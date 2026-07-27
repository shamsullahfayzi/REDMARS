import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ArrowUpRight, CalendarClock, FlaskConical, Pill, Printer, Stethoscope } from 'lucide-react'
import {
  HISTORY_MONTHS,
  type ConsultPatient,
  type HistoryLabResult,
  type HistoryPrescription,
  type HistoryVisit,
  type PatientHistoryResponse,
} from '@redmars/shared'
import { Badge } from '@/components/ui/badge'
import { BookFollowUp } from '@/components/BookFollowUp'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { HistoryLabResultSheet } from '@/components/HistoryLabResultSheet'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useAuth } from '@/auth/authContext'
import { usePatientHistory } from '@/hooks/useHistory'
import { printTarget } from '@/lib/print'
import { cn } from '@/lib/utils'

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
  patient,
  currentVisitId,
  departmentId,
}: {
  patient: ConsultPatient
  currentVisitId: string
  departmentId: string
}) {
  const { t } = useTranslation()
  const { roles } = useAuth()
  const [months, setMonths] = useState<number>(HISTORY_MONTHS.default)
  const history = usePatientHistory(patient.id, months)
  // Task 6b.6 — which past visit's lab report the print dialog is being asked for, if any.
  // Set on a click and consumed by the effect below, never read back into the UI: the
  // sheet is print-only, so there is nothing on screen for this state to drive.
  const [printVisit, setPrintVisit] = useState<HistoryVisit | null>(null)

  // Fires after the state above has committed and `HistoryLabResultSheet` has re-rendered
  // with the chosen visit — printing one render tick earlier would print last visit's sheet,
  // or an empty one on the very first click.
  useEffect(() => {
    if (printVisit) printTarget('history-lab')
  }, [printVisit])

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
              <VisitCard visit={visit} onPrintLabResults={setPrintVisit} />
            </li>
          ))}
        </ol>
      )}

      {/* Task 6b.5 — "come back on the fifth" belongs at the end of reading the past,
          not on a separate screen. Doctor only: admin can read this tab but does not
          hold appointment.create, and the desk is not the one sitting in this room. */}
      {roles.includes('doctor') && (
        <BookFollowUp patientId={patient.id} defaultDepartmentId={departmentId} lockToSelf />
      )}

      {/* Print-only, task 6b.6 — hidden until a card's Print button names a visit. */}
      <HistoryLabResultSheet patient={patient} visit={printVisit} />
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

function VisitCard({
  visit,
  onPrintLabResults,
}: {
  visit: HistoryVisit
  onPrintLabResults: (visit: HistoryVisit) => void
}) {
  const { t, i18n } = useTranslation()
  // Which of THIS visit's lab results are left off the paper if it gets printed — local to
  // the card, not the tab: closing and reopening the tab is a fresh read of the past, and
  // a tick from a card no longer on screen has nothing to mean.
  const [excluded, setExcluded] = useState<ReadonlySet<number>>(() => new Set())

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

      {visit.labResults.length > 0 && (
        <LabResultsBlock
          labResults={visit.labResults}
          excluded={excluded}
          onToggle={(index) =>
            setExcluded((current) => {
              const next = new Set(current)
              if (next.has(index)) next.delete(index)
              else next.add(index)
              return next
            })
          }
          onPrint={() =>
            onPrintLabResults({
              ...visit,
              labResults: visit.labResults.filter((_, index) => !excluded.has(index)),
            })
          }
        />
      )}
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

/**
 * Every test ordered on this old visit, same verified-only rule as the doctor's own
 * read-back (LabsTab). A doctor un-ticks whichever of them are not the point of THIS
 * report before printing — the same control task 6b.6 added to the current visit, so a
 * doctor moving between the two uses the same gesture either way.
 */
function LabResultsBlock({
  labResults,
  excluded,
  onToggle,
  onPrint,
}: {
  labResults: HistoryLabResult[]
  excluded: ReadonlySet<number>
  onToggle: (index: number) => void
  onPrint: () => void
}) {
  const { t } = useTranslation()
  const anyIncluded = labResults.some((item, index) => item.value != null && !excluded.has(index))

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <FlaskConical className="size-3.5" aria-hidden />
          {t('labs.resultsTitle')}
        </p>
        <Button type="button" size="sm" variant="outline" disabled={!anyIncluded} onClick={onPrint}>
          <Printer className="size-4" aria-hidden />
          {t('labs.print')}
        </Button>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {labResults.map((item, index) => (
          <li key={index} className="flex items-center gap-3 px-3 py-2">
            {item.value != null && (
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={!excluded.has(index)}
                onChange={() => onToggle(index)}
                aria-label={t('labs.includeInPrint', { test: item.testName })}
              />
            )}
            <span className="flex-1 text-sm text-foreground">{item.testName}</span>
            {item.value != null ? (
              <HistoryResultValue item={item} />
            ) : (
              <span className="text-xs text-muted-foreground">
                {t(`labQueue.status.${item.status}`)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function HistoryResultValue({ item }: { item: HistoryLabResult }) {
  const reference =
    item.referenceLow != null || item.referenceHigh != null
      ? `${item.referenceLow ?? ''}–${item.referenceHigh ?? ''}`
      : item.referenceText
  return (
    <span className="flex items-center gap-2">
      {reference && (
        <span dir="ltr" className="text-xs text-muted-foreground">
          {reference}
        </span>
      )}
      <span
        className={cn('text-sm font-semibold tabular-nums', item.isAbnormal && 'text-destructive')}
        dir="ltr"
      >
        {item.value}
        {item.unit ? ` ${item.unit}` : ''}
      </span>
      {(item.flag === 'H' || item.flag === 'L') && (
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-xs font-bold',
            item.flag === 'H' ? 'bg-destructive/15 text-destructive' : 'bg-info/15 text-info',
          )}
        >
          {item.flag}
        </span>
      )}
    </span>
  )
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso))
}
