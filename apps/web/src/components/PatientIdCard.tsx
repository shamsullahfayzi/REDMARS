import { useTranslation } from 'react-i18next'
import type { CheckInResponse } from '@redmars/shared'

/**
 * Task 6b.8 — "MRN + name on a small print sheet, handed over on first visit."
 *
 * A card-sized slip a patient keeps: the facility, their name, and above all the MRN — the
 * one number that makes every later visit findable in seconds instead of a name search
 * through everyone who shares it. Print-only (see index.css's `.id-card-sheet`); the
 * `printTarget('id-card')` call in ReceptionPage is what actually puts it on paper instead
 * of the receipt sitting next to it on the same "done" screen.
 */
export function PatientIdCard({ result }: { result: CheckInResponse }) {
  const { t, i18n } = useTranslation()
  const facilityName =
    (i18n.language === 'prs' && result.facility.nameLocalPrs) ||
    (i18n.language === 'ps' && result.facility.nameLocalPs) ||
    result.facility.name

  const issued = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kabul',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(result.visit.startedAt))

  return (
    <div className="id-card-sheet">
      <div className="id-card flex flex-col justify-between">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wide">{facilityName}</p>
          <p className="mt-0.5 text-[8px] text-muted-foreground">{t('idCard.title')}</p>
        </div>

        <div>
          <p className="text-sm font-bold leading-tight">{result.patient.name}</p>
          <p className="mt-1 text-[9px] text-muted-foreground">
            {t(`patients.gender.${result.patient.gender}`)}
            {result.patient.ageYears != null && ` · ${result.patient.ageYears}y`}
          </p>
        </div>

        <div className="border-t border-dashed pt-1.5">
          <p className="text-[8px] uppercase tracking-wide text-muted-foreground">
            {t('idCard.mrn')}
          </p>
          <p className="font-mono text-lg font-bold tracking-wider" dir="ltr">
            {result.patient.mrn}
          </p>
        </div>

        <p className="text-[7px] text-muted-foreground" dir="ltr">
          {t('idCard.issued', { date: issued })}
        </p>
      </div>
    </div>
  )
}
