import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Clock, Pause, Play, RefreshCw, Stethoscope, WifiOff } from 'lucide-react'
import type { QueueEntry, VisitDepartmentOption } from '@redmars/shared'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { QUEUE_POLL_MS, useQueue, waitTone } from '@/hooks/useQueue'
import { useVisitOptions } from '@/hooks/useVisits'
import { cn } from '@/lib/utils'

/**
 * Task 3.7 — the queue.
 *
 * The one screen a doctor keeps open all day, so it answers one question: who do I call
 * next. That makes the WAIT the loudest thing on each row, and the order is arrival —
 * longest first — because a queue sorted any other way is how somebody waits all morning
 * without anyone meaning it.
 *
 * Auto-refresh is task 3.8. Until then the refresh is a button, which is honest: a screen
 * that looks live and is not is worse than one that plainly asks to be re-read.
 */
export function QueuePage() {
  const { t, i18n } = useTranslation()
  const [departmentId, setDepartmentId] = useState('')
  const [date, setDate] = useState('')
  const [includeClosed, setIncludeClosed] = useState(false)
  const [paused, setPaused] = useState(false)

  const optionsQuery = useVisitOptions()

  // What day it is at the HOSPITAL, learned from the server rather than from this
  // browser's clock — the same reason the day boundary is computed server-side at all
  // (task 3.7). With no date filter, the date the server served is today there.
  const [today, setToday] = useState<string | null>(null)

  // A past day cannot change, so polling it is a request that can only ever return the
  // same answer. Live means live; history is just history.
  const isPastDay = date !== '' && today != null && date < today
  const polling = !paused && !isPastDay

  const queue = useQueue(
    { departmentId: departmentId || undefined, date: date || undefined, includeClosed },
    { poll: polling },
  )

  const data = queue.data

  useEffect(() => {
    if (date === '' && data?.date) setToday(data.date)
  }, [date, data])
  const entries = data?.entries ?? []
  const departments = optionsQuery.data?.departments ?? []

  // Which rows arrived since the last read — the done-when, made visible. A doctor is
  // not staring at this screen; they glance up, and something should say what changed.
  const filterSignature = `${departmentId}|${date}|${String(includeClosed)}`
  const seenIds = useRef<Set<string> | null>(null)
  const seenFor = useRef(filterSignature)
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!data) return

    const ids = new Set(data.entries.map((entry) => entry.id))
    const previous = seenIds.current
    // A changed filter means a different list, not new arrivals — everything would
    // otherwise flash at once and the signal would mean nothing.
    const sameList = seenFor.current === filterSignature
    seenIds.current = ids
    seenFor.current = filterSignature

    // The first read of a list is not an arrival either.
    if (!previous || !sameList) {
      setFreshIds(new Set())
      return
    }

    const arrived = new Set([...ids].filter((id) => !previous.has(id)))
    if (arrived.size === 0) return

    setFreshIds(arrived)
    const timer = window.setTimeout(() => setFreshIds(new Set()), 8000)
    return () => window.clearTimeout(timer)
  }, [data, filterSignature])

  function departmentName(department: VisitDepartmentOption): string {
    if (i18n.language === 'prs' && department.nameLocalPrs) return department.nameLocalPrs
    if (i18n.language === 'ps' && department.nameLocalPs) return department.nameLocalPs
    return department.name
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.queue')}
        description={data?.scope.mine ? t('queue.mine') : t('queue.everyone')}
      />

      {/* What the filter is hiding, said out loud. */}
      {data && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Count label={t('visits.status.arrived')} value={data.counts.arrived} highlight />
          <Count label={t('visits.status.in_progress')} value={data.counts.in_progress} />
          <Count label={t('visits.status.on_hold')} value={data.counts.on_hold} />
          <Count label={t('visits.status.completed')} value={data.counts.completed} />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="queueDepartment">{t('visits.fields.department')}</Label>
          <Select
            id="queueDepartment"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value="">{t('queue.allDepartments')}</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {departmentName(department)}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="queueDate">{t('queue.date')}</Label>
          <Input
            id="queueDate"
            type="date"
            dir="ltr"
            value={date || (data?.date ?? '')}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <label className="flex h-10 items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={includeClosed}
            onChange={(e) => setIncludeClosed(e.target.checked)}
            className="size-4 accent-primary"
          />
          {t('queue.includeClosed')}
        </label>

        <Button
          type="button"
          variant="outline"
          onClick={() => void queue.refetch()}
          disabled={queue.isFetching}
        >
          <RefreshCw className={cn('size-4', queue.isFetching && 'animate-spin')} aria-hidden />
          {t('queue.refresh')}
        </Button>

        <LiveIndicator
          polling={polling}
          paused={paused}
          isPastDay={isPastDay}
          failing={queue.isError && data != null}
          updatedAt={queue.dataUpdatedAt}
          onTogglePause={() => setPaused((p) => !p)}
        />
      </div>

      {/* Failing with nothing to show. The one below is failing with stale data, which
          is the more dangerous case and gets the louder treatment. */}
      {queue.isError && !data && <p className="text-sm text-destructive">{t('queue.error')}</p>}

      {queue.isError && data && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <WifiOff className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <div className="text-sm">
            <p className="font-medium text-destructive">{t('queue.stale.title')}</p>
            <p className="text-muted-foreground">
              {t('queue.stale.since', { time: formatClock(queue.dataUpdatedAt) })}
            </p>
          </div>
        </div>
      )}

      {!queue.isError && entries.length === 0 && !queue.isPending ? (
        <Card className="p-8 text-center">
          <Clock className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-muted-foreground">{t('queue.empty')}</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry, index) => (
            <QueueRow
              key={entry.id}
              entry={entry}
              position={index + 1}
              isNew={freshIds.has(entry.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

/** HH:MM in the reader's own locale — this one is about their clock, not the hospital's. */
function formatClock(at: number): string {
  if (!at) return '—'
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/**
 * Says whether the screen is actually live, because after task 3.8 it usually is — and a
 * screen that LOOKS live while quietly frozen is worse than one that never claimed to be.
 * Four honest states: updating, not updating, paused, and a fixed past day.
 */
function LiveIndicator({
  polling,
  paused,
  isPastDay,
  failing,
  updatedAt,
  onTogglePause,
}: {
  polling: boolean
  paused: boolean
  isPastDay: boolean
  failing: boolean
  updatedAt: number
  onTogglePause: () => void
}) {
  const { t } = useTranslation()
  const seconds = Math.round(QUEUE_POLL_MS / 1000)

  const label = failing
    ? t('queue.live.failing')
    : isPastDay
      ? t('queue.live.pastDay')
      : paused
        ? t('queue.live.paused')
        : t('queue.live.on', { seconds })

  return (
    <div className="ms-auto flex items-center gap-2 text-sm text-muted-foreground">
      <span
        className={cn(
          'size-2 rounded-full',
          failing ? 'bg-destructive' : polling ? 'bg-success' : 'bg-muted-foreground',
        )}
        aria-hidden
      />
      <span>{label}</span>
      <span className="text-xs">·</span>
      <span className="text-xs tabular-nums">
        {t('queue.live.updated', { time: formatClock(updatedAt) })}
      </span>
      {!isPastDay && (
        <Button type="button" variant="ghost" size="icon-sm" onClick={onTogglePause} aria-label={label}>
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
        </Button>
      )}
    </div>
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

function QueueRow({
  entry,
  position,
  isNew,
}: {
  entry: QueueEntry
  position: number
  isNew: boolean
}) {
  const { t } = useTranslation()
  const tone = waitTone(entry.waitedMinutes)

  return (
    <li>
      {/* A ring AND a word. Colour alone would say nothing to a colour-blind doctor, and
          nothing at all to a screen reader. */}
      <Card
        className={cn(
          'flex flex-wrap items-center gap-4 p-4',
          isNew && 'ring-2 ring-primary/50',
        )}
      >
        {isNew && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
            {t('queue.justArrived')}
          </span>
        )}
        {/* Position in line, not a clinical priority — the number is just where they are. */}
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
          aria-hidden
        >
          {position}
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
          <p>
            {entry.departmentName}
            {entry.practitionerName ? ` · ${entry.practitionerName}` : ''}
          </p>
          <p dir="ltr" className="font-mono text-xs">
            {entry.visitNo}
          </p>
        </div>

        <div className="flex items-center gap-3">
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

          {/* The loudest thing on the row. A wait nobody has noticed is exactly what
              this screen exists to make impossible to miss. */}
          <span
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold tabular-nums',
              tone === 'urgent'
                ? 'bg-destructive/10 text-destructive'
                : tone === 'warning'
                  ? 'bg-warning/15 text-warning-foreground'
                  : 'text-muted-foreground',
            )}
          >
            <Clock className="size-4" aria-hidden />
            {t('queue.waited', { minutes: entry.waitedMinutes })}
          </span>
        </div>

        <Link
          to={`/patients/${entry.patientId}`}
          className="text-sm text-primary hover:underline"
          aria-label={t('queue.open')}
        >
          <Stethoscope className="size-5" aria-hidden />
        </Link>
      </Card>
    </li>
  )
}
