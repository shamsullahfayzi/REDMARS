import { useTranslation } from 'react-i18next'
import type { ConsultContext } from '@redmars/shared'
import { useVisitLabResults } from '@/hooks/useLabOrder'

/**
 * The lab result report the patient carries out — the printed counterpart to the on-screen
 * read-back. A SECOND print-only sheet on the consult page; the print stylesheet plus the
 * `data-print-target` stamp (lib/print.ts) decide that this one, not the prescription, lands
 * on the paper when the doctor prints results.
 *
 * ONLY VERIFIED results print. A report is an official document a patient may take to another
 * clinic, so it carries values that have been signed off, not provisional ones — the same rule
 * the read-back follows. Modelled on the prescription sheet's restraint: no logo (Farhat prints
 * on pre-printed letterhead), a boxed identity header in their form, then the results table.
 */
export function LabResultSheet({ context }: { context: ConsultContext }) {
  const { t, i18n } = useTranslation()
  const resultsQuery = useVisitLabResults(context.visit.id, true)
  const verified = (resultsQuery.data?.items ?? []).filter((item) => item.value != null)
  const { patient, visit } = context

  const ageSex = [
    patient.ageYears != null ? t('print.years', { count: patient.ageYears }) : null,
    t(`patients.gender.${patient.gender}`),
  ]
    .filter(Boolean)
    .join(' / ')

  return (
    <div className="lab-result-sheet hidden p-6" lang={i18n.language} dir={i18n.dir()}>
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
          <Line label={t('print.regNo')} value={visit.visitNo} ltr />
          <Line label={t('print.printDate')} value={formatDateTime(new Date().toISOString())} ltr />
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
          {verified.map((item) => {
            const reference =
              item.referenceLow != null || item.referenceHigh != null
                ? `${item.referenceLow ?? ''}–${item.referenceHigh ?? ''}${item.unit ? ` ${item.unit}` : ''}`
                : (item.referenceText ?? '')
            return (
              <tr key={item.itemId} className="border-b border-black/30 align-top">
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
