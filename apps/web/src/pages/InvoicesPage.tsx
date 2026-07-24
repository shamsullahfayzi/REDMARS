import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ChevronLeft, ChevronRight, Layers, Printer, Search } from 'lucide-react'
import {
  INVOICE_STATUSES,
  type InvoiceListItem,
  type InvoiceOrigin,
  type InvoiceStatus,
  type VisitBill,
} from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { InvoiceReceipt } from '@/components/InvoiceReceipt'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useDebounced } from '@/hooks/useDebounced'
import { useInvoiceDetail, useInvoiceList, useVisitBills } from '@/hooks/useInvoices'

/** Today, as the hospital reads it — the register opens to the day the desk is working. */
function facilityToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kabul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

const STATUS_VARIANT: Record<InvoiceStatus, 'success' | 'warning' | 'muted' | 'danger'> = {
  paid: 'success',
  partially_paid: 'warning',
  issued: 'muted',
  draft: 'muted',
  cancelled: 'danger',
}

/**
 * The till that raised a bill, coloured so the three read apart at a glance (task 6.2).
 * Kept clear of the status palette (success/warning/danger) — origin is not a state.
 */
const ORIGIN_VARIANT: Record<InvoiceOrigin, 'info' | 'active' | 'outline' | 'muted'> = {
  reception: 'info',
  lab: 'active',
  pharmacy: 'outline',
  other: 'muted',
}

/**
 * Task 6.1 — the invoices the desk handed out, findable again.
 *
 * Reception (3.6) and the lab (5.6) raise bills; this is where they are read back. The
 * register opens to today, searches by number or name across any day, and opens one bill
 * into the very same receipt the patient was handed — reprintable, so a lost slip costs a
 * button, not a reconstruction from memory.
 */
export function InvoicesPage() {
  const { t } = useTranslation()
  const { roles } = useAuth()
  const [input, setInput] = useState('')
  const [date, setDate] = useState(facilityToday())
  const [status, setStatus] = useState<InvoiceStatus | ''>('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const q = useDebounced(input, 250)
  const listQuery = useInvoiceList({
    q,
    date: date || undefined,
    status: status || undefined,
    page,
  })

  const invoices = listQuery.data?.invoices ?? []
  const total = listQuery.data?.total ?? 0
  const limit = listQuery.data?.limit ?? 20
  const pageCount = Math.max(1, Math.ceil(total / limit))

  // Any change to the filters restarts paging — page 3 of the old query means nothing here.
  useEffect(() => {
    setPage(1)
  }, [q, date, status])

  if (selectedId) {
    return (
      <InvoiceDetailView
        invoiceId={selectedId}
        canPrint={roles.includes('receptionist') || roles.includes('pharmacist')}
        onBack={() => setSelectedId(null)}
        onOpen={setSelectedId}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.invoices')} description={t('invoices.subtitle')} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('invoices.searchPlaceholder')}
            className="ps-9"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t('invoices.date')}</label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
            dir="ltr"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t('invoices.status')}</label>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as InvoiceStatus | '')}
            className="w-44"
          >
            <option value="">{t('invoices.allStatuses')}</option>
            {INVOICE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`invoices.statusLabel.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        {date && (
          <Button variant="ghost" onClick={() => setDate('')}>
            {t('invoices.allDates')}
          </Button>
        )}
      </div>

      {listQuery.isError && <p className="text-sm text-destructive">{t('invoices.error')}</p>}

      {!listQuery.isError && (
        <section className="space-y-3">
          {invoices.length === 0 && !listQuery.isPending ? (
            <p className="text-muted-foreground">{t('invoices.empty')}</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {t('invoices.count', { shown: invoices.length, total })}
              </p>
              <Card className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="p-3 text-start font-medium">{t('invoices.col.no')}</th>
                      <th className="p-3 text-start font-medium">{t('invoices.col.date')}</th>
                      <th className="p-3 text-start font-medium">{t('invoices.col.patient')}</th>
                      <th className="p-3 text-start font-medium">{t('invoices.col.for')}</th>
                      <th className="p-3 text-end font-medium">{t('invoices.col.total')}</th>
                      <th className="p-3 text-start font-medium">{t('invoices.col.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <InvoiceRow
                        key={invoice.id}
                        invoice={invoice}
                        onOpen={() => setSelectedId(invoice.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </Card>

              {pageCount > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {t('invoices.page', { page, pageCount })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
                      {t('invoices.previous')}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={page >= pageCount}
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    >
                      {t('invoices.next')}
                      <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}

function InvoiceRow({ invoice, onOpen }: { invoice: InvoiceListItem; onOpen: () => void }) {
  const { t } = useTranslation()
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kabul',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(invoice.createdAt))
  const summary =
    invoice.itemCount > 1
      ? t('invoices.summaryMore', { first: invoice.summary, more: invoice.itemCount - 1 })
      : invoice.summary

  return (
    <tr
      className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
      onClick={onOpen}
    >
      <td className="p-3 font-mono text-foreground" dir="ltr">
        {invoice.invoiceNo}
      </td>
      <td className="p-3 text-muted-foreground" dir="ltr">
        {day}
      </td>
      <td className="p-3">
        <span className="font-medium text-foreground">{invoice.patientName}</span>
        <span className="ms-2 font-mono text-xs text-muted-foreground" dir="ltr">
          {invoice.patientMrn}
        </span>
      </td>
      <td className="p-3 text-muted-foreground">{summary || '—'}</td>
      <td className="p-3 text-end font-mono text-foreground" dir="ltr">
        {invoice.total} {invoice.currency}
      </td>
      <td className="p-3">
        <Badge variant={STATUS_VARIANT[invoice.status]}>
          {t(`invoices.statusLabel.${invoice.status}`)}
        </Badge>
      </td>
    </tr>
  )
}

function InvoiceDetailView({
  invoiceId,
  canPrint,
  onBack,
  onOpen,
}: {
  invoiceId: string
  canPrint: boolean
  onBack: () => void
  onOpen: (invoiceId: string) => void
}) {
  const { t } = useTranslation()
  const detailQuery = useInvoiceDetail(invoiceId)
  const detail = detailQuery.data

  const outstanding = useMemo(() => {
    if (!detail) return null
    const owed = Number(detail.invoice.total) - Number(detail.invoice.paidAmount)
    return owed > 0 ? owed.toFixed(2) : null
  }, [detail])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t('invoices.back')}
        </Button>
        {canPrint && detail && (
          <Button onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden />
            {t('invoices.reprint')}
          </Button>
        )}
      </div>

      {detailQuery.isPending && (
        <p className="text-muted-foreground print:hidden">{t('invoices.loading')}</p>
      )}
      {detailQuery.isError && (
        <p className="text-sm text-destructive print:hidden">{t('invoices.detailError')}</p>
      )}

      {detail && (
        <>
          {outstanding && (
            <div className="print:hidden">
              <Badge variant="warning">
                {t('invoices.outstanding', {
                  amount: outstanding,
                  currency: detail.invoice.currency,
                })}
              </Badge>
            </div>
          )}
          {detail.visit && (
            <VisitBillsPanel
              visitId={detail.visit.id}
              currentInvoiceId={invoiceId}
              onOpen={onOpen}
            />
          )}
          <Card className="max-w-2xl p-6 print:max-w-none print:border-0 print:p-0 print:shadow-none">
            <InvoiceReceipt
              facility={detail.facility}
              patient={detail.patient}
              visit={detail.visit}
              invoice={detail.invoice}
              receiptDate={detail.createdAt}
            />
          </Card>
        </>
      )}
    </div>
  )
}

/**
 * Task 6.2 — the sibling bills a visit gathered, across the three tills. Shown only when
 * there IS more than one, so a plain single-bill visit stays uncluttered; the current bill
 * is marked, the others open on click. A running total sits on top: charged, paid, still
 * open across every till at once. Screen only — the printed receipt is one bill, not the set.
 */
function VisitBillsPanel({
  visitId,
  currentInvoiceId,
  onOpen,
}: {
  visitId: string
  currentInvoiceId: string
  onOpen: (invoiceId: string) => void
}) {
  const { t } = useTranslation()
  const query = useVisitBills(visitId)
  const data = query.data

  if (!data || data.bills.length < 2) return null
  const { visit, bills, totals } = data

  return (
    <Card className="max-w-2xl space-y-3 p-4 print:hidden">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Layers className="size-4 text-muted-foreground" aria-hidden />
        {t('visitBills.title', { visitNo: visit.visitNo, count: bills.length })}
      </div>

      <ul className="space-y-1.5">
        {bills.map((bill) => (
          <VisitBillRow
            key={bill.id}
            bill={bill}
            isCurrent={bill.id === currentInvoiceId}
            onOpen={() => onOpen(bill.id)}
          />
        ))}
      </ul>

      <dl className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">{t('visitBills.billed')}</dt>
          <dd className="font-mono text-foreground" dir="ltr">
            {totals.billed} {totals.currency}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">{t('visitBills.paid')}</dt>
          <dd className="font-mono text-foreground" dir="ltr">
            {totals.paid} {totals.currency}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">{t('visitBills.outstanding')}</dt>
          <dd
            className={`font-mono ${Number(totals.outstanding) > 0 ? 'text-warning' : 'text-foreground'}`}
            dir="ltr"
          >
            {totals.outstanding} {totals.currency}
          </dd>
        </div>
      </dl>
    </Card>
  )
}

function VisitBillRow({
  bill,
  isCurrent,
  onOpen,
}: {
  bill: VisitBill
  isCurrent: boolean
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const owed = Number(bill.outstanding) > 0

  return (
    <li>
      <button
        type="button"
        onClick={isCurrent ? undefined : onOpen}
        aria-current={isCurrent ? 'true' : undefined}
        className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-start text-sm ${
          isCurrent ? 'bg-muted' : 'cursor-pointer hover:bg-muted/50'
        }`}
      >
        <Badge variant={ORIGIN_VARIANT[bill.origin]}>{t(`visitBills.origin.${bill.origin}`)}</Badge>
        <span className="font-mono text-xs text-muted-foreground" dir="ltr">
          {bill.invoiceNo}
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{bill.summary || '—'}</span>
        <span className="font-mono text-foreground" dir="ltr">
          {bill.total} {bill.currency}
        </span>
        <Badge variant={owed ? 'warning' : STATUS_VARIANT[bill.status]}>
          {owed
            ? t('visitBills.owed', { amount: bill.outstanding })
            : t(`invoices.statusLabel.${bill.status}`)}
        </Badge>
      </button>
    </li>
  )
}
