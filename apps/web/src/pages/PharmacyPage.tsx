import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Pill, Search, TriangleAlert } from 'lucide-react'
import type {
  AllergySeverity,
  PharmacyAllergy,
  PharmacyBill,
  PharmacyDrugLine,
  PharmacyPrescription,
  PharmacyQueueItem,
  ReturnMedicineResponse,
} from '@redmars/shared'
import { moneySchema } from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { InvoiceDetailView } from '@/components/InvoiceDetailView'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { serverMessage } from '@/lib/api'
import { useDebounced } from '@/hooks/useDebounced'
import {
  useBillPrescription,
  useConfirmHandover,
  usePharmacyPrescription,
  usePharmacyQueue,
  usePharmacySearch,
  useReturnMedicine,
} from '@/hooks/usePharmacy'

const WAIT_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kabul',
  hour: '2-digit',
  minute: '2-digit',
})

const SEVERITY_VARIANT: Record<AllergySeverity, 'danger' | 'warning' | 'muted'> = {
  severe: 'danger',
  moderate: 'warning',
  mild: 'muted',
}

/**
 * Task 6.8 + 6.9 — the pharmacy queue, and one prescription opened from it.
 *
 * The queue (6.8) is the pharmacist's home screen, oldest first. Opening a row shows the
 * prescription as R6 allows the pharmacy to see it (6.9): the drugs and the patient's
 * allergies, and nothing else clinical — no diagnosis, no complaint, no notes.
 */
export function PharmacyPage() {
  const { t } = useTranslation()
  const query = usePharmacyQueue()
  const items = query.data?.items ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [term, setTerm] = useState('')
  const searchQuery = usePharmacySearch(useDebounced(term, 250))
  const searching = term.trim().length >= 2
  const results = searchQuery.data?.items ?? []

  if (selectedId) {
    return <PrescriptionView prescriptionId={selectedId} onBack={() => setSelectedId(null)} />
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.pharmacy')} description={t('pharmacy.subtitle')} />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t('pharmacy.search.placeholder')}
          className="ps-9"
        />
      </div>

      {searching ? (
        <section className="space-y-3">
          {searchQuery.isError && (
            <p className="text-sm text-destructive">{t('pharmacy.search.error')}</p>
          )}
          {!searchQuery.isError && !searchQuery.isPending && results.length === 0 && (
            <p className="text-muted-foreground">{t('pharmacy.search.empty')}</p>
          )}
          {results.length > 0 && (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('pharmacy.col.ordered')}</th>
                    <th className="p-3 text-start font-medium">{t('pharmacy.col.patient')}</th>
                    <th className="p-3 text-start font-medium">{t('pharmacy.col.drugs')}</th>
                    <th className="p-3 text-start font-medium">{t('pharmacy.col.prescriber')}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((item) => (
                    <QueueRow
                      key={item.prescriptionId}
                      item={item}
                      onOpen={() => setSelectedId(item.prescriptionId)}
                    />
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      ) : (
        <>
          {query.isError && <p className="text-sm text-destructive">{t('pharmacy.error')}</p>}

          {!query.isError &&
            (items.length === 0 && !query.isPending ? (
              <Card className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
                <Pill className="size-8" aria-hidden />
                <p>{t('pharmacy.empty')}</p>
              </Card>
            ) : (
              <section className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t('pharmacy.waiting', { count: items.length })}
                </p>
                <Card className="overflow-x-auto p-0">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border text-muted-foreground">
                      <tr>
                        <th className="p-3 text-start font-medium">{t('pharmacy.col.ordered')}</th>
                        <th className="p-3 text-start font-medium">{t('pharmacy.col.patient')}</th>
                        <th className="p-3 text-start font-medium">{t('pharmacy.col.drugs')}</th>
                        <th className="p-3 text-start font-medium">
                          {t('pharmacy.col.prescriber')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <QueueRow
                          key={item.prescriptionId}
                          item={item}
                          onOpen={() => setSelectedId(item.prescriptionId)}
                        />
                      ))}
                    </tbody>
                  </table>
                </Card>
              </section>
            ))}
        </>
      )}
    </div>
  )
}

function QueueRow({ item, onOpen }: { item: PharmacyQueueItem; onOpen: () => void }) {
  const { t } = useTranslation()
  return (
    <tr
      className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
      onClick={onOpen}
    >
      <td className="p-3 whitespace-nowrap text-muted-foreground" dir="ltr">
        {WAIT_TIME.format(new Date(item.orderedAt))}
      </td>
      <td className="p-3">
        <span className="font-medium text-foreground">{item.patientName}</span>
        <span className="ms-2 font-mono text-xs text-muted-foreground" dir="ltr">
          {item.patientMrn}
        </span>
        {item.ageYears != null && (
          <span className="ms-2 text-xs text-muted-foreground">
            {t('patients.search.years', { count: item.ageYears })}
          </span>
        )}
        {/* Present (and worth a badge) only on a search result — every queue row is
            'active' by definition, so this stays quiet on the queue itself. */}
        {item.status && item.status !== 'active' && (
          <Badge variant="muted" className="ms-2">
            {t(`pharmacy.status.${item.status}`, { defaultValue: item.status })}
          </Badge>
        )}
      </td>
      <td className="p-3 text-foreground">
        {item.summary || '—'}
        {item.itemCount > 0 && (
          <span className="ms-2 text-xs text-muted-foreground">
            {t('pharmacy.itemCount', { count: item.itemCount })}
          </span>
        )}
      </td>
      <td className="p-3 text-muted-foreground">{item.practitionerName}</td>
    </tr>
  )
}

/**
 * Task 6.10 — bill, wait for reception, hand over. Three states read off one field
 * (`rx.bill`) rather than local mutation-result state, so reopening an already-billed
 * prescription from the queue picks up exactly where it left off — a pharmacist who bills a
 * sheet, gets called away, and comes back an hour later sees the SAME screen a colleague who
 * just clicked "Bill" would, not a blank one.
 */
function PrescriptionView({
  prescriptionId,
  onBack,
}: {
  prescriptionId: string
  onBack: () => void
}) {
  const { t } = useTranslation()
  const { roles } = useAuth()
  const query = usePharmacyPrescription(prescriptionId)
  const rx = query.data

  const isPharmacist = roles.includes('pharmacist')
  // Once a bill exists, `InvoiceDetailView` below supplies its own back/print row — a second
  // one here would just be a duplicate control fighting it for the same job.
  const hasBill = !!rx?.bill

  return (
    <div className="space-y-5">
      {!hasBill && (
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t('pharmacy.back')}
        </Button>
      )}

      {query.isPending && <p className="text-muted-foreground">{t('pharmacy.loading')}</p>}
      {query.isError && <p className="text-sm text-destructive">{t('pharmacy.detailError')}</p>}

      {rx && (
        <div className="space-y-5">
          <PatientHeader rx={rx} />
          <AllergyPanel allergies={rx.allergies} />
          <DrugSheet rx={rx} />

          {isPharmacist && rx.status === 'active' && !rx.bill && (
            <BillForm prescriptionId={prescriptionId} items={rx.items} />
          )}

          {rx.bill && (
            <BillPanel
              prescriptionId={prescriptionId}
              bill={rx.bill}
              rxStatus={rx.status}
              isPharmacist={isPharmacist}
              onHandedOver={onBack}
            />
          )}

          {/* Falls through only for a status neither 'active' nor ever billed — a
              cancelled/voided sheet found via search, never a real dispensing state. */}
          {!rx.bill && rx.status !== 'active' && (
            <Badge variant="muted">{t('pharmacy.alreadyDispensed')}</Badge>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The pricing form — the actual fix for "the bill is always zero." `Drug.sellPrice` only
 * ever supplies `suggestedUnitPrice`, a pre-filled starting figure (many drugs have no
 * catalog price at all, which used to mean a silent 0.00 bill with no way to correct it);
 * every field here stays editable, and the amount that lands on the invoice is whatever the
 * pharmacist typed, not what the formulary happened to say.
 */
function BillForm({ prescriptionId, items }: { prescriptionId: string; items: PharmacyDrugLine[] }) {
  const { t } = useTranslation()
  const billMutation = useBillPrescription()
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((item) => [item.id, item.suggestedUnitPrice ?? ''])),
  )

  const qtyOf = (item: PharmacyDrugLine) => item.quantity ?? 1
  const lineTotal = (item: PharmacyDrugLine) => {
    const price = Number(prices[item.id])
    return Number.isFinite(price) ? price * qtyOf(item) : 0
  }
  const billTotal = items.reduce((sum, item) => sum + lineTotal(item), 0)
  const allPriced = items.every((item) => moneySchema.safeParse(prices[item.id]).success)

  function submit() {
    if (!allPriced || billMutation.isPending) return
    billMutation.mutate({
      prescriptionId,
      body: { items: items.map((item) => ({ itemId: item.id, unitPrice: prices[item.id].trim() })) },
    })
  }

  return (
    <Card className="space-y-3 p-4">
      <p className="text-sm font-medium text-foreground">{t('pharmacy.priceTitle')}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="pb-2 text-start font-medium">{t('pharmacy.col.drugs')}</th>
              <th className="pb-2 text-end font-medium">{t('pharmacy.col.qty')}</th>
              <th className="pb-2 text-end font-medium">{t('pharmacy.col.unitPrice')}</th>
              <th className="pb-2 text-end font-medium">{t('pharmacy.col.lineTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="py-2 pe-2 text-foreground">{item.drugName}</td>
                <td className="py-2 text-end text-muted-foreground" dir="ltr">
                  {qtyOf(item)}
                </td>
                <td className="py-2 ps-2 text-end">
                  <Input
                    value={prices[item.id] ?? ''}
                    onChange={(e) =>
                      setPrices((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    inputMode="decimal"
                    dir="ltr"
                    className="w-24 ms-auto text-end font-mono"
                    aria-label={t('pharmacy.unitPriceFor', { drug: item.drugName })}
                  />
                </td>
                <td className="py-2 ps-2 text-end font-mono text-foreground" dir="ltr">
                  {lineTotal(item).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm font-medium text-foreground">{t('pharmacy.billTotal')}</span>
        <span className="font-mono text-base font-semibold text-foreground" dir="ltr">
          {billTotal.toFixed(2)}
        </span>
      </div>

      <Button onClick={submit} disabled={!allPriced || billMutation.isPending}>
        {billMutation.isPending ? t('pharmacy.billing') : t('pharmacy.billIt')}
      </Button>
      {!allPriced && <p className="text-xs text-muted-foreground">{t('pharmacy.priceHint')}</p>}
      {billMutation.isError && (
        <p className="text-sm text-destructive">
          {serverMessage(billMutation.error) ?? t('pharmacy.billError')}
        </p>
      )}
    </Card>
  )
}

/**
 * The bill itself, in whichever of three states it's actually in:
 *  - raised, unpaid — a message pointing at reception, no handover button yet;
 *  - raised, paid — the handover button appears;
 *  - handed over — the same success badge this screen always showed, plus the return flow.
 *
 * `InvoiceDetailView` is the same pay/discount/print view every other bill in this system
 * already uses (task 6.1/6.4) — reused here for its proven `DiscountForm` (mandatory reason,
 * R10's ceiling) and reprint, but with `canReceive` permanently false: the pharmacy counter
 * no longer takes payment at all, on request — reception collects it, and the moment it does,
 * this same invoice (already a `prescription_item` bill Collections already lists lab bills
 * the identical way) shows as settled here too on the next fetch.
 *
 * `canRefund` stays OFF for the same reason it always was: a pharmacy bill's money reverses
 * through `useReturnMedicine` below (the box coming back refunds what was paid for it), and a
 * second, independent "refund this payment" control on the same screen would let the two
 * paths double-handle the same cash.
 */
function BillPanel({
  prescriptionId,
  bill,
  rxStatus,
  isPharmacist,
  onHandedOver,
}: {
  prescriptionId: string
  bill: PharmacyBill
  rxStatus: string
  isPharmacist: boolean
  onHandedOver: () => void
}) {
  const { t } = useTranslation()
  const { roles } = useAuth()
  const handover = useConfirmHandover()
  const returned = useReturnMedicine(prescriptionId)
  const [showReturn, setShowReturn] = useState(false)
  const [reason, setReason] = useState('')
  const [result, setResult] = useState<ReturnMedicineResponse | null>(null)

  const alreadyHandedOver = rxStatus !== 'active'
  const canConfirmHandover = isPharmacist && bill.isPaid && !alreadyHandedOver

  function submitReturn() {
    if (reason.trim().length < 3 || returned.isPending) return
    returned.mutate(
      { reason: reason.trim() },
      { onSuccess: (r) => { setResult(r); setShowReturn(false) } },
    )
  }

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        {result ? (
          <Badge variant="danger">
            {t('pharmacy.returned', {
              amount: result.refundedAmount,
              currency: result.currency,
              receiptNo: result.refundReceiptNo ?? '—',
            })}
          </Badge>
        ) : alreadyHandedOver ? (
          <Badge variant="success">
            {t('pharmacy.dispensed', {
              invoiceNo: bill.invoiceNo,
              total: bill.total,
              currency: bill.currency,
            })}
          </Badge>
        ) : bill.isPaid ? (
          <Badge variant="success">{t('pharmacy.billPaid', { invoiceNo: bill.invoiceNo })}</Badge>
        ) : (
          <Badge variant="warning">
            {t('pharmacy.awaitingPayment', {
              invoiceNo: bill.invoiceNo,
              outstanding: bill.outstanding,
              currency: bill.currency,
            })}
          </Badge>
        )}
      </div>

      {!result && !bill.isPaid && !alreadyHandedOver && (
        <p className="text-sm text-muted-foreground print:hidden">
          {t('pharmacy.waitingForReception')}
        </p>
      )}

      {!result && canConfirmHandover && (
        <div className="space-y-2 print:hidden">
          <Button
            onClick={() => handover.mutate(prescriptionId, { onSuccess: onHandedOver })}
            disabled={handover.isPending}
          >
            {handover.isPending ? t('pharmacy.handingOver') : t('pharmacy.confirmHandover')}
          </Button>
          {handover.isError && (
            <p className="text-sm text-destructive">
              {serverMessage(handover.error) ?? t('pharmacy.handoverError')}
            </p>
          )}
        </div>
      )}

      {!result && isPharmacist && alreadyHandedOver && (
        <Card className="max-w-2xl space-y-2 p-4 print:hidden">
          {!showReturn ? (
            <Button variant="destructive" onClick={() => setShowReturn(true)}>
              {t('pharmacy.return')}
            </Button>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-56 flex-1">
                <label className="mb-1 block text-xs text-muted-foreground" htmlFor="return-reason">
                  {t('pharmacy.returnReason')}
                </label>
                <Input
                  id="return-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('pharmacy.returnReasonPlaceholder')}
                  autoFocus
                />
              </div>
              <Button
                variant="destructive"
                disabled={reason.trim().length < 3 || returned.isPending}
                onClick={submitReturn}
              >
                {returned.isPending ? t('pharmacy.returning') : t('pharmacy.confirmReturn')}
              </Button>
            </div>
          )}
          {returned.isError && (
            <p className="text-sm text-destructive">
              {serverMessage(returned.error) ?? t('pharmacy.returnError')}
            </p>
          )}
        </Card>
      )}

      {!result && (
        <InvoiceDetailView
          invoiceId={bill.invoiceId}
          canPrint={isPharmacist}
          canReceive={false}
          canDiscount={isPharmacist || roles.includes('admin')}
          discountUncapped={roles.includes('admin')}
          canRefund={false}
          canRefundPrint={false}
          onBack={onHandedOver}
          // This screen is the just-billed bill's own discount/print/status view, not a
          // general invoice browser — a sibling bill on the same visit (reception's OPD
          // fee, say) is shown in the totals panel for context, same as everywhere else,
          // but opening one is what the Collections/Invoices screens are already for.
          onOpen={() => undefined}
        />
      )}
    </div>
  )
}

function PatientHeader({ rx }: { rx: PharmacyPrescription }) {
  const { t } = useTranslation()
  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">{rx.patient.name}</h2>
      <p className="text-sm text-muted-foreground">
        <span className="font-mono" dir="ltr">
          {rx.patient.mrn}
        </span>
        {rx.patient.ageYears != null &&
          ` · ${t('patients.search.years', { count: rx.patient.ageYears })}`}
        {rx.patient.gender && ` · ${rx.patient.gender}`}
        {` · ${t('pharmacy.by', { name: rx.practitionerName })}`}
      </p>
    </div>
  )
}

function AllergyPanel({ allergies }: { allergies: PharmacyAllergy[] }) {
  const { t } = useTranslation()
  const active = allergies.filter((a) => a.isActive)

  if (active.length === 0) {
    return (
      <Card className="border-success/30 bg-success/5 p-3 text-sm text-muted-foreground">
        {t('pharmacy.noAllergies')}
      </Card>
    )
  }

  return (
    <Card className="border-destructive/30 bg-destructive/5 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
        <TriangleAlert className="size-4" aria-hidden />
        {t('pharmacy.allergies')}
      </div>
      <ul className="space-y-1.5 text-sm">
        {active.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2">
            <Badge variant={SEVERITY_VARIANT[a.severity]}>
              {t(`allergies.severities.${a.severity}`, { defaultValue: a.severity })}
            </Badge>
            <span className="font-medium text-foreground">{a.substance}</span>
            {a.reaction && <span className="text-muted-foreground">· {a.reaction}</span>}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function DrugSheet({ rx }: { rx: PharmacyPrescription }) {
  const { t } = useTranslation()
  return (
    <Card className="space-y-4 p-4">
      {rx.interactionAckReason && (
        <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
          <span className="font-medium text-warning">{t('pharmacy.interactionAck')}: </span>
          <span className="text-foreground">{rx.interactionAckReason}</span>
        </div>
      )}

      <ul className="space-y-3">
        {rx.items.map((item) => (
          <li key={item.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium text-foreground">{item.drugName}</span>
              {item.dose && <span className="text-sm text-muted-foreground">{item.dose}</span>}
            </div>
            <p className="text-sm text-muted-foreground">
              {[item.frequency, item.duration, item.route].filter(Boolean).join(' · ')}
              {item.quantity != null && ` · ${t('pharmacy.qty', { count: item.quantity })}`}
            </p>
            {item.instructions && (
              <p className="text-sm text-muted-foreground">{item.instructions}</p>
            )}
            {item.allergyOverrideReason && (
              <p className="mt-1 text-xs text-destructive">
                <TriangleAlert className="me-1 inline size-3" aria-hidden />
                {t('pharmacy.allergyOverride', { reason: item.allergyOverrideReason })}
              </p>
            )}
          </li>
        ))}
      </ul>

      {rx.advice && (
        <div className="text-sm">
          <span className="font-medium text-foreground">{t('pharmacy.advice')}: </span>
          <span className="text-muted-foreground">{rx.advice}</span>
        </div>
      )}
    </Card>
  )
}
