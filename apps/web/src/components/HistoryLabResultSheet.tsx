import { useTranslation } from 'react-i18next'
import type { ConsultPatient, HistoryVisit } from '@redmars/shared'

/**
 * Task 6b.6 — the same report task 5.12 already prints for the visit a doctor is sitting
 * in, printed instead for one that closed months ago. A second, independent print target
 * (`history-lab`, not `lab`) so choosing to print an old visit's results from the History
 * tab can never collide with the CURRENT visit's own sheet mounted on the same page —
 * exactly one of the two is ever shown to the print dialog.
 *
 * Fed directly from the visit already sitting in the history response rather than a fresh
 * fetch: `HistoryVisit.labResults` follows the read-back's own verified-only rule (a value
 * appears only once signed off), so there is nothing this needs to ask the server again.
 */
export function HistoryLabResultSheet({
  patient,
  visit,
}: {
  patient: ConsultPatient
  visit: HistoryVisit | null
}) {
  const { t, i18n } = useTranslation()
  const verified = (visit?.labResults ?? []).filter((item) => item.value != null)

  const ageSex = [
    patient.ageYears != null ? t('print.years', { count: patient.ageYears }) : null,
    t(`patients.gender.${patient.gender}`),
  ]
    .filter(Boolean)
    .join(' / ')

  return (
    <div className="history-lab-sheet hidden p-6" lang={i18n.language} dir={i18n.dir()}>
      <h1 className="mb-3 text-center text-[13pt] font-bold uppercase tracking-wide">
        {t('labResultSheet.title')}
      </h1>

      <div className="grid grid-cols-2 border border-black text-[10pt]">
        <dl className="space-y-0.5 border-e border-black p-2">
          <Line label={t('print.uhid')} value={patient.mrn} ltr />
          <Line label={t('print.name')} value={patient.name} />
          <Line label={t('print.ageSex')} value={ageSex} />
        </dl>
        <dl className="space-y-0.5 p-2">
          <Line label={t('print.regNo')} value={visit?.visitNo ?? ''} ltr />
          <Line
            label={t('print.printDate')}
            value={formatDateTime(visit?.startedAt ?? new Date().toISOString())}
            ltr
          />
        </dl>
      </div>

      <table className="mt-4 w-full border-collapse text-[10pt]">
        <thead>
          <tr className="border-b border-black text-start">
            <th className="py-1 pe-2 text-start font-semibold">{t('labResultSheet.test')}</th>
            <th className="py-1 pe-2 text-start font-semibold">{t('labResultSheet.result')}</th>
            <th className="py-1 pe-2 text-start font-semibold">{t('labResultSheet.flag')}</th>
            <th className="py-1 text-start font-semibold">{t('labResultSheet.reference')}</th>
          </tr>
        </thead>
        <tbody>
          {verified.map((item, index) => {
            const reference =
              item.referenceLow != null || item.referenceHigh != null
                ? `${item.referenceLow ?? ''}–${item.referenceHigh ?? ''}${item.unit ? ` ${item.unit}` : ''}`
                : (item.referenceText ?? '')
            return (
              <tr key={index} className="border-b border-black/30 align-top">
                <td className="py-1 pe-2">{item.testName}</td>
                <td className="py-1 pe-2 font-semibold" dir="ltr">
                  {item.value}
                  {item.unit ? ` ${item.unit}` : ''}
                </td>
                <td className="py-1 pe-2" dir="ltr">
                  {item.flag ?? (item.isAbnormal ? '*' : '')}
                </td>
                <td className="py-1" dir="ltr">
                  {reference}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="mt-10 flex justify-end">
        <div className="w-56 border-t border-black pt-1 text-center text-[10pt]">
          {t('labResultSheet.verifiedBy')}
        </div>
      </div>
    </div>
  )
}

function Line({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex gap-1">
      <dt className="font-semibold">{label}:</dt>
      <dd dir={ltr ? 'ltr' : undefined}>{value}</dd>
    </div>
  )
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}
