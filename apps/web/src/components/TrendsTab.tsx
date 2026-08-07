import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardList, FlaskConical, MessageSquare } from 'lucide-react'
import { HISTORY_MONTHS, type ConsultPatient, type HistoryVisit } from '@redmars/shared'
import { TrendLineChart, type TrendPoint } from '@/components/charts/TrendLineChart'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useAuth } from '@/auth/authContext'
import { usePatientHistory } from '@/hooks/useHistory'

const WINDOWS = [12, 24, HISTORY_MONTHS.max] as const

/**
 * "How has this patient been since last time" as three pictures instead of a card list to
 * read one at a time — the complaint that keeps coming back, the diagnosis that does or
 * doesn't, a lab value moving in a direction. `HistoryTab` stays the detail view (every
 * card, every drug, every result); this is the bird's-eye view built from the exact same
 * fetch, `usePatientHistory` — no second endpoint, no second permission to hold.
 *
 * Same self-gate as HistoryTab, deliberately copied rather than shared through a prop:
 * `patient.read_history` is doctor and admin only, and a nurse holding `patient.read_clinical`
 * under R7 has today's vitals, not a year of the record turned into a trend.
 */
export function TrendsTab({ patient }: { patient: ConsultPatient }) {
  const { t } = useTranslation()
  const { roles } = useAuth()
  const [months, setMonths] = useState<number>(HISTORY_MONTHS.default)
  const history = usePatientHistory(patient.id, months)

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

  // Oldest first — a timeline reads left to right as "then" to "now", the opposite order
  // from HistoryTab's own newest-first cards (which answer "what happened most recently").
  const visits = [...history.data.visits].reverse()

  return (
    <div className="space-y-4">
      <div className="w-48 space-y-1.5">
        <Label htmlFor="trends-window">{t('history.window')}</Label>
        <Select
          id="trends-window"
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

      {visits.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{t('history.empty')}</p>
        </Card>
      ) : (
        <>
          <ComplaintSection visits={visits} />
          <DiagnosisSection visits={visits} />
          <LabSection visits={visits} />
        </>
      )}
    </div>
  )
}

/**
 * How many separate complaints the patient raised at each visit — not what they were, just
 * whether the list is growing or shrinking. `chiefComplaint` is one free-text field (a
 * receptionist or doctor types "fever, cough, headache" as a single string, not one row per
 * symptom the way `diagnoses` is), so a comma-separated item count is the only count this
 * field actually has to give.
 */
function complaintCount(text: string | null): number {
  if (!text) return 0
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean).length
}

function ComplaintSection({ visits }: { visits: HistoryVisit[] }) {
  const { t, i18n } = useTranslation()
  const points: TrendPoint[] = visits.map((visit) => {
    const count = complaintCount(visit.chiefComplaint)
    return {
      label: formatDay(visit.startedAt, i18n.language),
      value: count,
      displayValue: t('trends.complaint.count', { count }),
    }
  })

  return (
    <Card className="p-4">
      <SectionHeading icon={MessageSquare}>{t('trends.complaint.title')}</SectionHeading>
      {points.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('trends.complaint.empty')}</p>
      ) : (
        <TrendLineChart points={points} ariaLabel={t('trends.complaint.title')} />
      )}
    </Card>
  )
}

/**
 * How many diagnoses the doctor recorded per visit, over time — `diagnoses` is already one
 * structured row per finding (not free text), so the count is `diagnoses.length` directly,
 * no parsing needed. Every visit contributes a point, including zero-diagnosis visits: a
 * drop to zero is real trend information, not something to filter out.
 */
function DiagnosisSection({ visits }: { visits: HistoryVisit[] }) {
  const { t, i18n } = useTranslation()
  const points: TrendPoint[] = visits.map((visit) => {
    const count = visit.diagnoses.length
    return {
      label: formatDay(visit.startedAt, i18n.language),
      value: count,
      displayValue: t('trends.diagnosis.count', { count }),
    }
  })

  return (
    <Card className="p-4">
      <SectionHeading icon={ClipboardList}>{t('trends.diagnosis.title')}</SectionHeading>
      {points.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('trends.diagnosis.empty')}</p>
      ) : (
        <TrendLineChart points={points} ariaLabel={t('trends.diagnosis.title')} />
      )}
    </Card>
  )
}

/**
 * Every numeric, verified result across the window, grouped by test name — one small line
 * chart per test the patient has actually had more than once, so a doctor can see a value
 * moving rather than re-reading a table of one-off numbers.
 */
function LabSection({ visits }: { visits: HistoryVisit[] }) {
  const { t, i18n } = useTranslation()

  const byTest = new Map<string, TrendPoint[]>()
  for (const visit of visits) {
    for (const result of visit.labResults) {
      if (!result.isNumeric || result.value == null) continue
      const points = byTest.get(result.testName) ?? []
      points.push({
        label: formatDay(visit.startedAt, i18n.language),
        value: Number(result.value),
        displayValue: `${result.value}${result.unit ? ` ${result.unit}` : ''}`,
        abnormal: result.isAbnormal,
      })
      byTest.set(result.testName, points)
    }
  }
  const tests = [...byTest.entries()]

  return (
    <Card className="p-4">
      <SectionHeading icon={FlaskConical}>{t('trends.lab.title')}</SectionHeading>
      {tests.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('trends.lab.empty')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tests.map(([testName, points]) => (
            <div key={testName}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{testName}</p>
              <TrendLineChart points={points} ariaLabel={`${t('trends.lab.title')}: ${testName}`} />
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function SectionHeading({
  icon: Icon,
  children,
}: {
  icon: typeof MessageSquare
  children: string
}) {
  return (
    <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      {children}
    </h3>
  )
}

/** Noon UTC, so a calendar day never renders as the day before it — same rule as HistoryTab. */
function formatDay(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso))
}
