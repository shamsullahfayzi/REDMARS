import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Stethoscope } from 'lucide-react'
import { isVisitOpen, type QueueEntry } from '@redmars/shared'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useQueue } from '@/hooks/useQueue'
import { cn } from '@/lib/utils'

/**
 * The doctor's own day, which the sidebar has pointed at since task 1.6 and which was a
 * placeholder until now.
 *
 * IT IS NOT A SECOND QUEUE, and the difference is why it is worth a screen. The queue
 * (task 3.7) answers WHO DO I CALL NEXT: this department, right now, longest wait loudest,
 * closed visits hidden because a finished consultation is not something to decide from.
 * This answers WHAT DID I DO — my patients, on a chosen day, finished ones included, in
 * the order the day actually happened. The two questions want opposite defaults, which is
 * why one screen serving both would be worse at each.
 *
 * The thing it is uniquely good at is the visit LEFT OPEN: a consultation that is still
 * `in_progress` at six o'clock is a patient whose record was never closed, and nothing else
 * in this application would ever show it to the doctor who left it. Those rows are marked.
 *
 * NO NEW ENDPOINT AND NO NEW PERMISSION. /visits/queue already takes a date, already takes
 * `includeClosed`, and already narrows to the caller's own practitioner when none is named
 * (visit.service.ts). Adding a route to serve a different arrangement of the same rows
 * would be a second thing to keep correct for no gain.
 *
 * NO STATUS BUTTONS AND NO CANCEL. Moving a visit along is the queue's job and it has the
 * buttons; this is for reading and for opening. Two screens offering the same actions is
 * two places to fix them.
 */
export function MyConsultationsPage() {
  const { t } = useTranslation()
  const [date, setDate] = useState('')
  const [today, setToday] = useState<string | null>(null)

  // The whole day, closed visits included — the opposite of the queue's default, and the
  // point of this screen.
  const consultations = useQueue(
    { date: date || undefined, includeClosed: true },
    // A past day cannot change, so polling it is a request that can only ever return the
    // same answer.
    { poll: today != null && (date === '' || date >= today) },
  )

  const data = consultations.data

  // What day it is at the HOSPITAL, learned from the server rather than this browser's
  // clock — the day boundary is computed in the facility's zone, so the browser's idea of
  // "today" is not the one the rows were selected by.
  useEffect(() => {
    if (date === '' && data?.date) setToday(data.date)
  }, [date, data])

  const shownDate = date || data?.date || ''
  const entries = data?.entries ?? []
  const unfinished = entries.filter((entry) => isVisitOpen(entry.status)).length

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.consultations')} description={t('consultations.description')} />

      {/*
        An account with no practitioner record gets every visit in the facility back, because
        the endpoint has nothing to narrow by. That is a reasonable answer to "the queue" and
        a wrong one to "mine", so the screen says which it is showing rather than letting a
        doctor read the whole hospital's day as their own.
      */}
      {data && !data.scope.mine && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="text-sm text-foreground">{t('consultations.notMine')}</p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="consultDate">{t('consultations.date')}</Label>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t('consultations.previous')}
              onClick={() => setDate(shiftDay(shownDate, -1))}
            >
              {/* Mirrors with the page — "previous" is not always leftwards. */}
              <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
            </Button>
            <Input
              id="consultDate"
              type="date"
              dir="ltr"
              value={shownDate}
              onChange={(event) => setDate(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t('consultations.next')}
              onClick={() => setDate(shiftDay(shownDate, 1))}
            >
              <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
            </Button>
          </div>
        </div>

        {today != null && shownDate !== today && (
          <Button type="button" variant="ghost" onClick={() => setDate('')}>
            <CalendarDays className="size-4" aria-hidden />
            {t('consultations.today')}
          </Button>
        )}
      </div>

      {data && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Count label={t('visits.status.completed')} value={data.counts.completed} />
          <Count
            label={t('visits.status.in_progress')}
            value={data.counts.in_progress}
            highlight={data.counts.in_progress > 0}
          />
          <Count label={t('visits.status.on_hold')} value={data.counts.on_hold} />
          <Count label={t('visits.status.arrived')} value={data.counts.arrived} />
        </div>
      )}

      {consultations.isError && (
        <p className="text-sm text-destructive">{t('consultations.error')}</p>
      )}

      {/* Said once at the top rather than hunted for down the list. A visit still open on
          a day that is over is the one thing this screen exists to catch. */}
      {today != null && shownDate < today && unfinished > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="text-sm text-foreground">
            {t('consultations.leftOpen', { count: unfinished })}
          </p>
        </div>
      )}

      {!consultations.isError && !consultations.isPending && entries.length === 0 ? (
        <Card className="p-8 text-center">
          <Stethoscope className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-muted-foreground">{t('consultations.empty')}</p>
        </Card>
      ) : (
        <ol className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id}>
              <ConsultationRow entry={entry} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function ConsultationRow({ entry }: { entry: QueueEntry }) {
  const { t } = useTranslation()
  const open = isVisitOpen(entry.status)

  return (
    <Card className="flex flex-wrap items-center gap-4 p-4">
      {/* When it started, because this list is the day in order. The queue leads with the
          WAIT instead — same rows, different question. */}
      <span className="w-16 shrink-0 font-mono text-sm tabular-nums text-muted-foreground" dir="ltr">
        {formatClock(entry.startedAt)}
      </span>

      <div className="min-w-48 flex-1">
        <Link
          to={`/patients/${entry.patientId}`}
          className="font-semibold text-foreground hover:underline"
        >
          {entry.patientName}
        </Link>
        <p className="mt-0.5 text-sm text-muted-foreground">
          <span dir="ltr" className="font-mono">
            {entry.patientMrn}
          </span>
          {' · '}
          {t(`patients.gender.${entry.gender}`)}
          {entry.ageYears != null && ` · ${t('patients.search.years', { count: entry.ageYears })}`}
        </p>
        {entry.chiefComplaint && (
          <p className="mt-1 text-sm text-foreground">{entry.chiefComplaint}</p>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        <p>{entry.departmentName}</p>
        <p dir="ltr" className="font-mono text-xs">
          {entry.visitNo}
        </p>
      </div>

      <span
        className={cn(
          'rounded-full px-2.5 py-1 text-xs font-medium',
          entry.status === 'in_progress'
            ? 'bg-info/15 text-info'
            : entry.status === 'on_hold'
              ? 'bg-warning/15 text-warning-foreground'
              : entry.status === 'completed'
                ? 'bg-muted text-muted-foreground'
                : 'bg-primary/10 text-primary',
        )}
      >
        {t(`visits.status.${entry.status}`)}
      </span>

      <Link
        to={`/consult/${entry.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <Stethoscope className="size-4" aria-hidden />
        {open ? t('consultations.open') : t('consultations.review')}
      </Link>
    </Card>
  )
}

function Count({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <Card className={cn('p-4', highlight && 'border-primary/40')}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
        {value}
      </p>
    </Card>
  )
}

/**
 * YYYY-MM-DD, shifted by whole days in UTC.
 *
 * UTC on purpose: these strings are calendar days at the hospital, not instants, and
 * parsing them in the browser's own zone is how "yesterday" becomes two days ago for
 * somebody whose machine is set to the wrong side of midnight.
 */
function shiftDay(date: string, days: number): string {
  if (!date) return date
  const at = new Date(`${date}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/**
 * HH:MM at the HOSPITAL, not on this workstation.
 *
 * The day these rows were selected for is a day in Kabul, so rendering their times in the
 * browser's zone would put a late-evening visit on the previous page. Second place this
 * zone is written out (PrescriptionSheet is the first) — on the third it moves into
 * packages/shared, where the API's own FACILITY_TIME_ZONE should join it.
 */
function formatClock(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kabul',
  }).format(new Date(iso))
}
