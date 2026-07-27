import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ArrowUpRight, CalendarClock, Pill, Stethoscope } from 'lucide-react'
import {
  HISTORY_MONTHS,
  type HistoryPrescription,
  type HistoryVisit,
  type PatientHistoryResponse,
} from '@redmars/shared'
import { Badge } from '@/components/ui/badge'
import { BookFollowUp } from '@/components/BookFollowUp'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useAuth } from '@/auth/authContext'
import { usePatientHistory } from '@/hooks/useHistory'

/**
 * Task 4.14 — the last twelve months, on one screen.
 *
 * A psychiatric follow-up opens with a question the doctor cannot answer from the room:
 * what was tried, at what dose, and what happened. Today that is a paper file somebody has
 * to fetch, which is why in practice it does not get asked.
 *
 * ONE VISIT PER CARD, NEWEST FIRST, and everything about that occasion inside it. The
 * alternative — a diagnoses list, a prescriptions list, a visits list — is three lists a
 * doctor has to join by date in their head, and the join is where the mistake lives. What
 * a doctor actually asks is "what happened in March", and that is one card.
 *
 * THE CURRENT VISIT IS SKIPPED here rather than by the endpoint, deliberately. The API is
 * patient-scoped and will be read from a patient screen too; a visit-shaped exclusion baked
 * into it would be wrong there. Not showing the consultation you are sitting in is a
 * presentation decision, so it lives in the presentation.
 */

/** Twelve months is the done-when. The other two are for the patient known for years. */
const WINDOWS = [12, 24, HISTORY_MONTHS.max] as const

export function HistoryTab({
  patientId,
  currentVisitId,
  departmentId,
}: {
  patientId: string
  currentVisitId: string
  departmentId: string
}) {
  const { t } = useTranslation()
  const { roles } = useAuth()
  const [months, setMonths] = useState<number>(HISTORY_MONTHS.default)
  const history = usePatientHistory(patientId, months)

  /**
   * Courtesy, not control — `patient.read_history` is doctor and admin, and the server
   * answers 403 to everyone else. The nurse holds `patient.read_clinical` under R7 and not
   * this: taking today's blood pressure and reading a year of psychiatric attendance are
   * different acts, and the matrix already said so.
   */
  if (!roles.includes('doctor') && !roles.includes('admin')) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">{t('history.denied')}</p>
      </Card>
    )
  }

  if (history.isPending) {
    return <p className="text-sm text-muted-foreground">{t('history.loading')}</p>
  }
  if (history.isError || !history.data) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-destructive">{t('history.error')}</p>
      </Card>
    )
  }

  const visits = history.data.visits.filter((visit) => visit.id !== currentVisitId)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-48 space-y-1.5">
          <Label htmlFor="history-window">{t('history.window')}</Label>
          <Select
            id="history-window"
            value={months}
            onChange={(event) => setMonths(Number(event.target.value))}
          >
            {WINDOWS.map((option) => (
              <option key={option} value={option}>
                {t('history.months', { count: option })}
              </option>
            ))}
          </Select>
        </div>
        <Summary data={history.data} shown={visits.length} />
      </div>

      {visits.length === 0 ? (
        <Card className="p-8 text-center">
          {/* "Nothing recorded" and not "no history" — the difference matters on a screen
              where a blank space reads as a fact about the patient. */}
          <p className="text-sm text-muted-foreground">{t('history.empty')}</p>
        </Card>
      ) : (
        <ol className="space-y-3">
          {visits.map((visit) => (
            <li key={visit.id}>
              <VisitCard visit={visit} />
            </li>
          ))}
        </ol>
      )}

      {/* Task 6b.5 — "come back on the fifth" belongs at the end of reading the past,
          not on a separate screen. Doctor only: admin can read this tab but does not
          hold appointment.create, and the desk is not the one sitting in this room. */}
      {roles.includes('doctor') && (
        <BookFollowUp patientId={patientId} defaultDepartmentId={departmentId} lockToSelf />
      )}
    </div>
  )
}

/** What the list cannot say for itself: what was cut, and what sits before the window. */
function Summary({ data, shown }: { data: PatientHistoryResponse; shown: number }) {
  const { t } = useTranslation()

  return (
    <div className="text-end text-sm text-muted-foreground">
      <p>{t('history.count', { count: shown })}</p>
      {data.olderVisits > 0 && (
        <p className="text-xs">{t('history.older', { count: data.olderVisits })}</p>
      )}
      {data.truncated && <p className="text-xs text-warning">{t('history.truncated')}</p>}
    </div>
  )
}

function VisitCard({ visit }: { visit: HistoryVisit }) {
  const { t, i18n } = useTranslation()

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
            {formatDate(visit.startedAt, i18n.language)}
          </span>
          <span dir="ltr" className="font-mono text-xs text-muted-foreground">
            {visit.visitNo}
          </span>
          <Badge variant={visit.status === 'cancelled' ? 'muted' : 'outline'}>
            {t(`visits.status.${visit.status}`)}
          </Badge>
        </div>
        {/* The visit's id is a place to go, not a handle to write through — and the screen
            it opens re-checks every permission itself, including the one this panel does
            not hold for clinical notes. */}
        <Link
          to={`/consult/${visit.id}`}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          {t('history.open')}
          <ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden />
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        {visit.departmentName}
        {visit.practitionerName ? ` · ${visit.practitionerName}` : ''}
      </p>

      {visit.chiefComplaint && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-foreground">
          {visit.chiefComplaint}
        </p>
      )}

      {visit.diagnoses.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Stethoscope className="size-3.5" aria-hidden />
            {t('history.diagnoses')}
          </p>
          <ul className="space-y-1">
            {visit.diagnoses.map((diagnosis, index) => (
              <li key={index} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                {diagnosis.isPrimary && (
                  <Badge variant="active">{t('history.primary')}</Badge>
                )}
                {diagnosis.icdCode && (
                  <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                    {diagnosis.icdCode}
                  </span>
                )}
                <span className="text-foreground">{diagnosis.text}</span>
                <span className="text-xs text-muted-foreground">
                  {/* The value labels are reused from task 4.5 rather than restated. A
                      certainty that read "Ruled out" on one screen and "Refuted" on
                      another would be two words for one clinical claim. */}
                  {t(`diagnosis.certainties.${diagnosis.certainty}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {visit.prescription && <PrescriptionBlock prescription={visit.prescription} />}
    </Card>
  )
}

/**
 * What was actually given, as a table rather than a sentence.
 *
 * The drug name is the SNAPSHOT taken when it was prescribed, not what the formulary calls
 * that row today — so a strength that was discontinued still reads as what the patient took.
 * Names, doses and frequencies are dir="ltr" in every language, like the printed sheet.
 */
function PrescriptionBlock({ prescription }: { prescription: HistoryPrescription }) {
  const { t } = useTranslation()

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Pill className="size-3.5" aria-hidden />
        {t('history.prescribed')}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-start text-xs text-muted-foreground">
              <th className="py-1 text-start font-medium">{t('history.drug')}</th>
              <th className="py-1 text-start font-medium">{t('history.dose')}</th>
              <th className="py-1 text-start font-medium">{t('history.frequency')}</th>
              <th className="py-1 text-start font-medium">{t('history.duration')}</th>
            </tr>
          </thead>
          <tbody>
            {prescription.items.map((item, index) => (
              <tr key={index} className="border-t border-border/60">
                <td className="py-1 text-foreground" dir="ltr">
                  {item.drugNameAtTime}
                </td>
                <td className="py-1 text-muted-foreground" dir="ltr">
                  {item.dose ?? '—'}
                </td>
                <td className="py-1 text-muted-foreground" dir="ltr">
                  {item.frequency}
                </td>
                <td className="py-1 text-muted-foreground" dir="ltr">
                  {item.duration}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {prescription.advice && (
        <p className="text-xs text-muted-foreground">{prescription.advice}</p>
      )}
    </div>
  )
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso))
}
