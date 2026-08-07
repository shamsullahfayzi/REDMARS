import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import type { VisitBill } from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { InvoiceDetailView } from '@/components/InvoiceDetailView'
import { ORIGIN_VARIANT, STATUS_VARIANT } from '@/components/invoiceBadges'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useDebounced } from '@/hooks/useDebounced'
import { useCollectionsList } from '@/hooks/useCollections'
import { getCollectionsLastSeen, markCollectionsSeen } from '@/lib/collectionsSeen'

/** Today, as the hospital reads it — same reading ReportsPage/InvoicesPage use. */
function facilityToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kabul' }).format(new Date())
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kabul' }).format(d)
}

/** The first and last day of the facility's calendar month, `monthsAgo` months back. */
function monthBounds(monthsAgo: number): { from: string; to: string } {
  const [y, m] = facilityToday().split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1 - monthsAgo, 1))
  const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0))
  return { from: base.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }
}

type Preset = 'today' | 'yesterday' | 'thisMonth' | 'lastMonth'

const PRESET_RANGE: Record<Preset, () => { from: string; to: string }> = {
  today: () => ({ from: facilityToday(), to: facilityToday() }),
  yesterday: () => ({ from: daysAgo(1), to: daysAgo(1) }),
  thisMonth: () => ({ from: monthBounds(0).from, to: facilityToday() }),
  lastMonth: () => monthBounds(1),
}

/**
 * Task 6b.7 — "Reception finds an unpaid bill without opening the patient."
 *
 * Every invoice the lab or the pharmacy raised that still owes money, gathered in one list.
 * Reception raises its own bill at check-in and already knows it is unpaid; this is the
 * other two counters, which it cannot otherwise see without opening the patient first and
 * guessing whether they owe anything. Opens into the very same pay-and-print view the
 * register (6.1) does — InvoiceDetailView — so taking the money here is no different from
 * taking it there.
 *
 * NO DATE FILTER BY DEFAULT — every open bill shows, however old, because an unpaid bill
 * from days ago is a MORE urgent reason to be on this worklist, not a reason to be hidden.
 * Today/yesterday/this month are here as a way to NARROW a long list, same buttons Reports
 * uses, not a default that trims it.
 */
export function CollectionsPage() {
  const { t } = useTranslation()
  const { roles } = useAuth()
  const [input, setInput] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [preset, setPreset] = useState<Preset | null>(null)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const q = useDebounced(input, 250)
  const listQuery = useCollectionsList({ from: from || undefined, to: to || undefined, q, page })
  const bills = listQuery.data?.bills ?? []
  const total = listQuery.data?.total ?? 0
  const limit = listQuery.data?.limit ?? 50
  const pageCount = Math.max(1, Math.ceil(total / limit))

  // Any change to the filters restarts paging — page 3 of the old query means nothing here.
  useEffect(() => {
    setPage(1)
  }, [q, from, to])

  const applyPreset = (p: Preset) => {
    const range = PRESET_RANGE[p]()
    setFrom(range.from)
    setTo(range.to)
    setPreset(p)
  }

  const clearDates = () => {
    setFrom('')
    setTo('')
    setPreset(null)
  }

  // Frozen at mount: which bills are "new" for THIS visit to the page. Read once, then the
  // stored value is bumped to now so the sidebar badge (Sidebar.tsx) clears — a bill does
  // not keep announcing itself as new every time the desk looks at it again.
  const [seenAt] = useState(() => getCollectionsLastSeen())
  useEffect(() => {
    markCollectionsSeen()
  }, [])

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
        canRefund={roles.includes('admin') || isTill}
        canRefundPrint={isTill}
        onBack={() => setSelectedId(null)}
        onOpen={setSelectedId}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.collections')} description={t('collections.subtitle')} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('collections.searchPlaceholder')}
            className="ps-9"
            autoFocus
          />
        </div>
        <div className="flex gap-1">
          {(['today', 'yesterday', 'thisMonth', 'lastMonth'] as const).map((p) => (
            <Button
              key={p}
              variant={preset === p ? 'default' : 'outline'}
              size="sm"
              onClick={() => applyPreset(p)}
            >
              {t(`reports.presets.${p}`)}
            </Button>
          ))}
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t('reports.from')}</label>
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              setPreset(null)
            }}
            className="w-40"
            dir="ltr"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t('reports.to')}</label>
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setPreset(null)
            }}
            className="w-40"
            dir="ltr"
          />
        </div>
        {(from || to) && (
          <Button variant="ghost" onClick={clearDates}>
            {t('collections.allDates')}
          </Button>
        )}
      </div>

      {listQuery.isError && <p className="text-sm text-destructive">{t('collections.error')}</p>}

      {!listQuery.isError && (
        <section className="space-y-3">
          {bills.length === 0 && !listQuery.isPending ? (
            <p className="text-muted-foreground">
              {total === 0 && !q && !from && !to ? t('collections.empty') : t('collections.noMatch')}
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {t('collections.count', { shown: bills.length, total })}
              </p>
              <Card className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="p-3 text-start font-medium">{t('collections.col.origin')}</th>
                      <th className="p-3 text-start font-medium">{t('invoices.col.no')}</th>
                      <th className="p-3 text-start font-medium">{t('invoices.col.date')}</th>
                      <th className="p-3 text-start font-medium">{t('invoices.col.patient')}</th>
                      <th className="p-3 text-start font-medium">{t('invoices.col.for')}</th>
                      <th className="p-3 text-end font-medium">{t('collections.col.outstanding')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map((bill) => (
                      <CollectionsRow
                        key={bill.id}
                        bill={bill}
                        isNew={bill.createdAt > seenAt}
                        onOpen={() => setSelectedId(bill.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </Card>

              {pageCount > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {t('collections.page', { page, pageCount })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
                      {t('collections.previous')}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={page >= pageCount}
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    >
                      {t('collections.next')}
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

function CollectionsRow({
  bill,
  isNew,
  onOpen,
}: {
  bill: VisitBill
  isNew: boolean
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kabul',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(bill.createdAt))
  const summary =
    bill.itemCount > 1
      ? t('invoices.summaryMore', { first: bill.summary, more: bill.itemCount - 1 })
      : bill.summary

  return (
    <tr
      className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
      onClick={onOpen}
    >
      <td className="p-3">
        <div className="flex items-center gap-1.5">
          <Badge variant={ORIGIN_VARIANT[bill.origin]}>
            {t(`visitBills.origin.${bill.origin}`)}
          </Badge>
          {isNew && <Badge variant="success">{t('collections.new')}</Badge>}
        </div>
      </td>
      <td className="p-3 font-mono text-foreground" dir="ltr">
        {bill.invoiceNo}
      </td>
      <td className="p-3 text-muted-foreground" dir="ltr">
        {day}
      </td>
      <td className="p-3">
        <span className="font-medium text-foreground">{bill.patientName}</span>
        <span className="ms-2 font-mono text-xs text-muted-foreground" dir="ltr">
          {bill.patientMrn}
        </span>
      </td>
      <td className="p-3 text-muted-foreground">{summary || '—'}</td>
      <td className="p-3 text-end" dir="ltr">
        <span className="font-mono text-warning">
          {bill.outstanding} {bill.currency}
        </span>
        <Badge variant={STATUS_VARIANT[bill.status]} className="ms-2">
          {t(`invoices.statusLabel.${bill.status}`)}
        </Badge>
      </td>
    </tr>
  )
}
