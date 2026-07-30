import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Pill, Printer, Search, TriangleAlert } from 'lucide-react'
import type {
  AllergySeverity,
  DispenseResponse,
  PharmacyAllergy,
  PharmacyPrescription,
  PharmacyQueueItem,
  ReturnMedicineResponse,
} from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { InvoiceReceipt } from '@/components/InvoiceReceipt'
import { PageHeader } from '@/components/PageHeader'
import { PaymentForm } from '@/components/PaymentForm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { serverMessage } from '@/lib/api'
import { useDebounced } from '@/hooks/useDebounced'
import { useInvoiceDetail } from '@/hooks/useInvoices'
import {
  useDispense,
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
  const dispense = useDispense()
  const [bill, setBill] = useState<DispenseResponse | null>(null)

  const isPharmacist = roles.includes('pharmacist')

  if (bill) {
    return (
      <DispensedBill
        bill={bill}
        canReceive={isPharmacist}
        canPrint={isPharmacist}
        canReturn={isPharmacist}
        onDone={onBack}
      />
    )
  }

  return (
    <div className="space-y-5">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t('pharmacy.back')}
      </Button>

      {query.isPending && <p className="text-muted-foreground">{t('pharmacy.loading')}</p>}
      {query.isError && <p className="text-sm text-destructive">{t('pharmacy.detailError')}</p>}

      {rx && (
        <div className="space-y-5">
          <PatientHeader rx={rx} />
          <AllergyPanel allergies={rx.allergies} />
          <DrugSheet rx={rx} />

          {isPharmacist && rx.status === 'active' && (
            <div className="space-y-2">
              <Button
                onClick={() => dispense.mutate(prescriptionId, { onSuccess: setBill })}
                disabled={dispense.isPending}
              >
                {dispense.isPending ? t('pharmacy.dispensing') : t('pharmacy.dispense')}
              </Button>
              {dispense.isError && (
                <p className="text-sm text-destructive">
                  {serverMessage(dispense.error) ?? t('pharmacy.dispenseError')}
                </p>
              )}
            </div>
          )}
          {rx.status !== 'active' && (
            <Badge variant="muted">{t('pharmacy.alreadyDispensed')}</Badge>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Task 6.10 — the medicine bill, dispensed and ready to settle at the pharmacy till. Reuses
 * the shared payment form and the invoice receipt: a pharmacy bill is paid and printed the
 * same way as any other. The receipt is fetched fresh so it reflects each instalment.
 */
function DispensedBill({
  bill,
  canReceive,
  canPrint,
  canReturn,
  onDone,
}: {
  bill: DispenseResponse
  canReceive: boolean
  canPrint: boolean
  canReturn: boolean
  onDone: () => void
}) {
  const { t } = useTranslation()
  const detailQuery = useInvoiceDetail(bill.invoiceId)
  const detail = detailQuery.data
  const returned = useReturnMedicine(bill.prescriptionId)
  const [showReturn, setShowReturn] = useState(false)
  const [reason, setReason] = useState('')
  const [result, setResult] = useState<ReturnMedicineResponse | null>(null)

  const outstanding = detail
    ? (() => {
        const owed = Number(detail.invoice.total) - Number(detail.invoice.paidAmount)
        return owed > 0 ? owed.toFixed(2) : null
      })()
    : null

  function submitReturn() {
    if (reason.trim().length < 3 || returned.isPending) return
    returned.mutate(
      { reason: reason.trim() },
      { onSuccess: (r) => { setResult(r); setShowReturn(false) } },
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Button variant="ghost" onClick={onDone}>
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t('pharmacy.back')}
        </Button>
        {canPrint && detail && !result && (
          <Button onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden />
            {t('pharmacy.printBill')}
          </Button>
        )}
      </div>

      <div className="print:hidden">
        <Badge variant={result ? 'danger' : 'success'}>
          {result
            ? t('pharmacy.returned', {
                amount: result.refundedAmount,
                currency: result.currency,
                receiptNo: result.refundReceiptNo ?? '—',
              })
            : t('pharmacy.dispensed', {
                invoiceNo: bill.invoiceNo,
                total: bill.total,
                currency: bill.currency,
              })}
        </Badge>
      </div>

      {!result && canReceive && outstanding && detail && (
        <PaymentForm
          invoiceId={bill.invoiceId}
          outstanding={outstanding}
          currency={detail.invoice.currency}
          onPaid={() => undefined}
        />
      )}

      {!result && canReturn && (
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

      {detail && (
        <Card className="max-w-2xl p-6 print:max-w-none print:border-0 print:p-0 print:shadow-none">
          <InvoiceReceipt
            facility={detail.facility}
            patient={detail.patient}
            visit={detail.visit}
            invoice={detail.invoice}
            receiptDate={detail.createdAt}
          />
        </Card>
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
