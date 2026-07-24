import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ChevronLeft, ChevronRight, Layers, Printer, Search } from 'lucide-react'
import {
  DISCOUNT_CEILING_PCT,
  INVOICE_STATUSES,
  type InvoiceListItem,
  type InvoiceOrigin,
  type InvoiceStatus,
  PAYMENT_TENDERS,
  type PaymentTender,
  type RecordPaymentResponse,
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
import { ApiError, serverMessage } from '@/lib/api'
import { useDebounced } from '@/hooks/useDebounced'
import {
  useApplyDiscount,
  useInvoiceDetail,
  useInvoiceList,
  useRecordPayment,
  useVisitBills,
} from '@/hooks/useInvoices'

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
    const isTill = roles.includes('receptionist') || roles.includes('pharmacist')
    const canDiscount = roles.includes('admin') || isTill
    return (
      <InvoiceDetailView
        invoiceId={selectedId}
        canPrint={isTill}
        canReceive={isTill}
        canDiscount={canDiscount}
        discountUncapped={roles.includes('admin')}
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
  canReceive,
  canDiscount,
  discountUncapped,
  onBack,
  onOpen,
}: {
  invoiceId: string
  canPrint: boolean
  canReceive: boolean
  canDiscount: boolean
  discountUncapped: boolean
  onBack: () => void
  onOpen: (invoiceId: string) => void
}) {
  const { t } = useTranslation()
  const detailQuery = useInvoiceDetail(invoiceId)
  const detail = detailQuery.data
  // The last payment taken here, kept so its receipt number stays on screen even after a
  // final instalment closes the bill and the payment form itself goes away.
  const [lastReceipt, setLastReceipt] = useState<{
    receiptNo: string | null
    amount: string
    currency: string
    settled: boolean
  } | null>(null)

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
          {lastReceipt && (
            <div className="print:hidden">
              <Badge variant="success">
                {t('payments.took', {
                  receiptNo: lastReceipt.receiptNo ?? '—',
                  amount: lastReceipt.amount,
                  currency: lastReceipt.currency,
                })}
                {lastReceipt.settled ? ` · ${t('payments.settled')}` : ''}
              </Badge>
            </div>
          )}
          {canDiscount && detail.invoice.status !== 'cancelled' && (
            <DiscountForm
              invoiceId={invoiceId}
              subtotal={detail.invoice.subtotal}
              currentDiscount={detail.invoice.discount}
              currentReason={detail.invoice.discountReason}
              currency={detail.invoice.currency}
              uncapped={discountUncapped}
            />
          )}
          {canReceive && outstanding && detail.invoice.status !== 'cancelled' && (
            <PaymentForm
              invoiceId={invoiceId}
              outstanding={outstanding}
              currency={detail.invoice.currency}
              onPaid={(r) =>
                setLastReceipt({
                  receiptNo: r.payment.receiptNo,
                  amount: r.payment.amount,
                  currency: r.currency,
                  settled: r.status === 'paid',
                })
              }
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

/**
 * Task 6.3 — take a payment against a bill, cash in full or an instalment. Defaults to the
 * whole balance (the common case is settling in one go), but the amount is editable down to
 * a part-payment; it is clamped client-side to what is owed and clamped again on the server,
 * which is the one that counts. Screen only, never printed.
 */
function PaymentForm({
  invoiceId,
  outstanding,
  currency,
  onPaid,
}: {
  invoiceId: string
  outstanding: string
  currency: string
  onPaid: (result: RecordPaymentResponse) => void
}) {
  const { t } = useTranslation()
  const record = useRecordPayment(invoiceId)
  const [amount, setAmount] = useState(outstanding)
  const [method, setMethod] = useState<PaymentTender>('cash')
  const [reference, setReference] = useState('')

  // When the balance changes under us — a partial payment landed, or a sibling window took
  // money — snap the amount back to what is now owed rather than leave a stale figure.
  useEffect(() => {
    setAmount(outstanding)
  }, [outstanding])

  const owed = Number(outstanding)
  const value = Number(amount)
  const valid = amount.trim() !== '' && value > 0 && value <= owed

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || record.isPending) return
    record.mutate(
      { amount, method, reference: reference.trim() || undefined },
      {
        onSuccess: (result) => {
          onPaid(result)
          setReference('')
        },
      },
    )
  }

  return (
    <Card className="max-w-2xl space-y-3 p-4 print:hidden">
      <p className="text-sm font-medium text-foreground">{t('payments.title')}</p>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="pay-amount">
            {t('payments.amount')}
          </label>
          <Input
            id="pay-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="w-36 font-mono"
            dir="ltr"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="pay-method">
            {t('payments.method')}
          </label>
          <Select
            id="pay-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentTender)}
            className="w-40"
          >
            {PAYMENT_TENDERS.map((m) => (
              <option key={m} value={m}>
                {t(`payments.methodLabel.${m}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-48 flex-1">
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="pay-reference">
            {t('payments.reference')}
          </label>
          <Input
            id="pay-reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={t('payments.referencePlaceholder')}
          />
        </div>
        <Button type="submit" disabled={!valid || record.isPending}>
          {record.isPending ? t('payments.submitting') : t('payments.submit')}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        {t('payments.owedHint', { amount: outstanding, currency })}
      </p>
      {record.isError && (
        <p className="text-sm text-destructive">
          {serverMessage(record.error) ?? t('payments.error')}
        </p>
      )}
    </Card>
  )
}

/**
 * Task 6.4 — discount a bill, Rule R10. A reason is required (the input will not submit
 * without one), and for anyone but an admin the amount is capped at 10% of the subtotal —
 * greyed at the same number the server refuses, so the till is never invited to type a
 * discount that will bounce. The server enforces both regardless. Screen only.
 */
function DiscountForm({
  invoiceId,
  subtotal,
  currentDiscount,
  currentReason,
  currency,
  uncapped,
}: {
  invoiceId: string
  subtotal: string
  currentDiscount: string
  currentReason: string | null
  currency: string
  uncapped: boolean
}) {
  const { t } = useTranslation()
  const apply = useApplyDiscount(invoiceId)
  const hasDiscount = Number(currentDiscount) > 0
  const [amount, setAmount] = useState(hasDiscount ? currentDiscount : '')
  const [reason, setReason] = useState(currentReason ?? '')
  // Revealed only after the server refuses an over-ceiling discount — then an admin at the
  // counter authorises it with their own credentials (task 6.5).
  const [showApproval, setShowApproval] = useState(false)
  const [approverUsername, setApproverUsername] = useState('')
  const [approverPassword, setApproverPassword] = useState('')

  const subtotalNum = Number(subtotal)
  const ceiling = uncapped ? subtotalNum : (subtotalNum * DISCOUNT_CEILING_PCT) / 100
  const value = Number(amount)
  // The amount is bounded by the subtotal here, not the ceiling: over-ceiling is allowed to
  // be typed on purpose, because it is what triggers the approval path below.
  const baseValid = amount.trim() !== '' && value > 0 && value <= subtotalNum && reason.trim().length >= 3
  const approvalValid =
    !showApproval || (approverUsername.trim() !== '' && approverPassword !== '')
  const valid = baseValid && approvalValid

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || apply.isPending) return
    apply.mutate(
      {
        amount,
        reason: reason.trim(),
        approval: showApproval
          ? { username: approverUsername.trim(), password: approverPassword }
          : undefined,
      },
      {
        onError: (error) => {
          if (error instanceof ApiError && errorCode(error) === 'over_ceiling') {
            setShowApproval(true)
          }
        },
        onSuccess: () => setApproverPassword(''),
      },
    )
  }

  return (
    <Card className="max-w-2xl space-y-3 p-4 print:hidden">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{t('discount.title')}</p>
        {hasDiscount && (
          <Badge variant="muted">
            {t('discount.current', { amount: currentDiscount, currency })}
          </Badge>
        )}
      </div>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="disc-amount">
            {t('discount.amount')}
          </label>
          <Input
            id="disc-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="w-32 font-mono"
            dir="ltr"
          />
        </div>
        <div className="min-w-56 flex-1">
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="disc-reason">
            {t('discount.reason')}
          </label>
          <Input
            id="disc-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('discount.reasonPlaceholder')}
          />
        </div>
        {!showApproval && (
          <Button type="submit" variant="outline" disabled={!valid || apply.isPending}>
            {apply.isPending ? t('discount.applying') : t('discount.apply')}
          </Button>
        )}
      </form>

      {showApproval && (
        <form onSubmit={submit} className="space-y-2 rounded-md border border-warning/40 p-3">
          <p className="text-xs font-medium text-warning">{t('discount.approvalNeeded')}</p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground" htmlFor="appr-user">
                {t('discount.approverUsername')}
              </label>
              <Input
                id="appr-user"
                value={approverUsername}
                onChange={(e) => setApproverUsername(e.target.value)}
                autoComplete="off"
                dir="ltr"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground" htmlFor="appr-pass">
                {t('discount.approverPassword')}
              </label>
              <Input
                id="appr-pass"
                type="password"
                value={approverPassword}
                onChange={(e) => setApproverPassword(e.target.value)}
                autoComplete="off"
                dir="ltr"
              />
            </div>
            <Button type="submit" disabled={!valid || apply.isPending}>
              {apply.isPending ? t('discount.applying') : t('discount.approveAndApply')}
            </Button>
          </div>
        </form>
      )}

      <p className="text-xs text-muted-foreground">
        {uncapped
          ? t('discount.ceilingNone', { subtotal, currency })
          : t('discount.ceilingHint', {
              pct: DISCOUNT_CEILING_PCT,
              max: ceiling.toFixed(2),
              currency,
            })}
      </p>
      {apply.isSuccess && (
        <p className="text-sm text-success">
          {t('discount.applied', { total: apply.data.total, currency })}
          {apply.data.approvedByName
            ? ` · ${t('discount.approvedBy', { name: apply.data.approvedByName })}`
            : ''}
        </p>
      )}
      {apply.isError && errorCode(apply.error) !== 'over_ceiling' && (
        <p className="text-sm text-destructive">
          {serverMessage(apply.error) ?? t('discount.error')}
        </p>
      )}
    </Card>
  )
}

/** The server's own error code, when it wrote one — used to branch on `over_ceiling`. */
function errorCode(error: unknown): string | null {
  if (error instanceof ApiError && error.body && typeof error.body === 'object' && 'code' in error.body) {
    const code = (error.body as { code?: unknown }).code
    return typeof code === 'string' ? code : null
  }
  return null
}
