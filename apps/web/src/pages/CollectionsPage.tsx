import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import type { VisitBill } from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { InvoiceDetailView } from '@/components/InvoiceDetailView'
import { ORIGIN_VARIANT, STATUS_VARIANT } from '@/components/invoiceBadges'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useCollectionsList } from '@/hooks/useCollections'
import { getCollectionsLastSeen, markCollectionsSeen } from '@/lib/collectionsSeen'

/**
 * Task 6b.7 — "Reception finds an unpaid bill without opening the patient."
 *
 * Every invoice the lab or the pharmacy raised that still owes money, gathered in one list.
 * Reception raises its own bill at check-in and already knows it is unpaid; this is the
 * other two counters, which it cannot otherwise see without opening the patient first and
 * guessing whether they owe anything. Opens into the very same pay-and-print view the
 * register (6.1) does — InvoiceDetailView — so taking the money here is no different from
 * taking it there.
 */
export function CollectionsPage() {
  const { t } = useTranslation()
  const { roles } = useAuth()
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const listQuery = useCollectionsList()
  const bills = listQuery.data?.bills ?? []

  // Frozen at mount: which bills are "new" for THIS visit to the page. Read once, then the
  // stored value is bumped to now so the sidebar badge (Sidebar.tsx) clears — a bill does
  // not keep announcing itself as new every time the desk looks at it again.
  const [seenAt] = useState(() => getCollectionsLastSeen())
  useEffect(() => {
    markCollectionsSeen()
  }, [])

  const needle = q.trim().toLowerCase()
  const filtered = !needle
    ? bills
    : bills.filter(
        (bill) =>
          bill.invoiceNo.toLowerCase().includes(needle) ||
          bill.patientName.toLowerCase().includes(needle) ||
          bill.patientMrn.toLowerCase().includes(needle),
      )

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

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('collections.searchPlaceholder')}
          className="ps-9"
          autoFocus
        />
      </div>

      {listQuery.isError && <p className="text-sm text-destructive">{t('collections.error')}</p>}

      {!listQuery.isError && (
        <section className="space-y-3">
          {filtered.length === 0 && !listQuery.isPending ? (
            <p className="text-muted-foreground">
              {bills.length === 0 ? t('collections.empty') : t('collections.noMatch')}
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {t('collections.count', { count: filtered.length })}
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
                    {filtered.map((bill) => (
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
