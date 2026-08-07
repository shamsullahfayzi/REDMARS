import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Ban, Clock, Pause, Play, RefreshCw, Stethoscope, WifiOff } from 'lucide-react'
import { allowedStatusChanges, type QueueEntry, type VisitDepartmentOption } from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { QUEUE_POLL_MS, useQueue, waitTone } from '@/hooks/useQueue'
import { useCancelVisit, useChangeVisitStatus, useReassignPractitioner } from '@/hooks/useVisitStatus'
import { useVisitOptions } from '@/hooks/useVisits'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * One day before a YYYY-MM-DD, in the same string shape. Takes the SERVER'S `today` (task
 * 3.7's own facility-zone day), never a local `new Date()` — this screen already documents
 * why the day boundary has to come from the server, and re-deriving "yesterday" from the
 * browser's clock would reopen exactly that bug for a doctor near a UTC offset boundary.
 */
function dayBefore(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Task 3.7 — the queue.
 *
 * The one screen a doctor keeps open all day, so it answers one question: who do I call
 * next. That makes the WAIT the loudest thing on each row, and the order is arrival —
 * longest first — because a queue sorted any other way is how somebody waits all morning
 * without anyone meaning it.
 *
 * It re-reads itself every ten seconds (task 3.8) and says so — including when it stops,
 * because a screen that looks live while quietly frozen is worse than one that never
 * claimed to be.
 *
 * The buttons on each row are the visit's legal moves (task 3.9), taken from the shared
 * transition map so the screen cannot offer one the server will refuse.
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
          <div className="flex items-center gap-1.5">
            <Input
              id="queueDate"
              type="date"
              dir="ltr"
              value={date || (data?.date ?? '')}
              onChange={(e) => setDate(e.target.value)}
            />
            {/* Quick jump, not a default: the queue itself already opens to today with no
                filter (task 3.7's own day boundary). "Yesterday" is here because a doctor
                asking to look back one day shouldn't have to know the date. */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!today}
              onClick={() => today && setDate(dayBefore(today))}
            >
              {t('reports.presets.yesterday')}
            </Button>
            {date !== '' && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setDate('')}>
                {t('reports.presets.today')}
              </Button>
            )}
          </div>
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

        <StatusActions entry={entry} />

        <ReassignPractitionerAction entry={entry} />

        <CancelVisitAction entry={entry} />

        {/* The done-when of task 4.1: this is how a doctor opens a patient. It points at
            the VISIT, not the patient — a consultation is one occasion, and everything
            written in it is filed against that occasion. */}
        <Link
          to={`/consult/${entry.id}`}
          className="text-sm text-primary hover:underline"
          aria-label={t('queue.open')}
        >
          <Stethoscope className="size-5" aria-hidden />
        </Link>
      </Card>
    </li>
  )
}

/**
 * Cancelling a visit, and refunding it (task 3.11).
 *
 * Two steps on purpose. Rule R5 makes the reason mandatory, so there is no one-click
 * cancel to reach for — the receptionist has to say what happened before the money moves,
 * and the button that finally does it says how much is going back.
 *
 * Offered only to the desk and to administrators, matching `visit.cancel`. The server
 * applies R5's window and its "before the next step" clause on top of that, so a refusal
 * here is explained rather than merely denied.
 */
function CancelVisitAction({ entry }: { entry: QueueEntry }) {
  const { t } = useTranslation()
  const { roles } = useAuth()
  const cancel = useCancelVisit(entry.id)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  const mayCancel = roles.includes('admin') || roles.includes('receptionist')
  if (!mayCancel || entry.status === 'completed' || entry.status === 'cancelled') return null

  if (!open) {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Ban className="size-4" aria-hidden />
        {t('queue.cancel.start')}
      </Button>
    )
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <Label htmlFor={`cancel-${entry.id}`}>{t('queue.cancel.reason')}</Label>
      <Input
        id={`cancel-${entry.id}`}
        value={reason}
        autoFocus
        placeholder={t('queue.cancel.reasonPlaceholder')}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={cancel.isPending || reason.trim().length < 3}
          onClick={() => cancel.mutate({ reason: reason.trim() })}
        >
          {cancel.isPending ? t('queue.cancel.saving') : t('queue.cancel.confirm')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t('queue.cancel.keep')}
        </Button>
      </div>
      {/* The server's own words: R5 refusals say WHY, and "ask an administrator" is
          actionable in a way that a bare "forbidden" is not. */}
      {cancel.isError && (
        <p className="text-xs text-destructive">
          {cancel.error instanceof ApiError && typeof cancel.error.body === 'object'
            ? ((cancel.error.body as { message?: string }).message ?? t('queue.cancel.failed'))
            : t('queue.cancel.failed')}
        </p>
      )}
    </div>
  )
}

/**
 * Fixing who a visit is booked under.
 *
 * Same two-step shape as cancel, and for the same reason: a reason is mandatory, so
 * there is no one-click reassign. Offered only to the desk and to administrators,
 * matching `visit.reassign_practitioner` — the server applies R5's same-day and
 * "before the next step" clauses on top of that.
 */
function ReassignPractitionerAction({ entry }: { entry: QueueEntry }) {
  const { t } = useTranslation()
  const { roles } = useAuth()
  const optionsQuery = useVisitOptions()
  const reassign = useReassignPractitioner(entry.id)
  const [open, setOpen] = useState(false)
  const [practitionerId, setPractitionerId] = useState('')
  const [reason, setReason] = useState('')

  const mayReassign = roles.includes('admin') || roles.includes('receptionist')
  const reassignable = entry.status !== 'completed' && entry.status !== 'cancelled'
  if (!mayReassign || !reassignable) return null

  const choices = (optionsQuery.data?.practitioners ?? []).filter(
    (p) => p.departmentIds.includes(entry.departmentId) && p.id !== entry.practitionerId,
  )
  if (choices.length === 0 && !open) return null

  if (!open) {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Stethoscope className="size-4" aria-hidden />
        {t('queue.reassign.start')}
      </Button>
    )
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-input bg-muted/30 p-3">
      <Label htmlFor={`reassign-doc-${entry.id}`}>{t('queue.reassign.practitioner')}</Label>
      <Select
        id={`reassign-doc-${entry.id}`}
        value={practitionerId}
        autoFocus
        onChange={(e) => setPractitionerId(e.target.value)}
      >
        <option value="">{t('queue.reassign.choose')}</option>
        {choices.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <Label htmlFor={`reassign-reason-${entry.id}`}>{t('queue.reassign.reason')}</Label>
      <Input
        id={`reassign-reason-${entry.id}`}
        value={reason}
        placeholder={t('queue.reassign.reasonPlaceholder')}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={reassign.isPending || !practitionerId || reason.trim().length < 3}
          onClick={() =>
            reassign.mutate(
              { practitionerId, reason: reason.trim() },
              { onSuccess: () => setOpen(false) },
            )
          }
        >
          {reassign.isPending ? t('queue.reassign.saving') : t('queue.reassign.confirm')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t('queue.reassign.keep')}
        </Button>
      </div>
      {reassign.isError && (
        <p className="text-xs text-destructive">
          {reassign.error instanceof ApiError && typeof reassign.error.body === 'object'
            ? ((reassign.error.body as { message?: string }).message ?? t('queue.reassign.failed'))
            : t('queue.reassign.failed')}
        </p>
      )}
    </div>
  )
}

/**
 * The moves this visit can actually make, as buttons (task 3.9).
 *
 * Driven by the shared transition map rather than a list written out here, so the screen
 * cannot offer a button the server will refuse — and cannot quietly stop offering one
 * when the rules change on the server side only.
 *
 * Nurse/doctor only, matching `visit.change_status`. Moving a patient through hold /
 * in-progress / complete is a clinical call, not desk work — the receptionist checks
 * people in (`visit.create`) but does not hold this.
 */
function StatusActions({ entry }: { entry: QueueEntry }) {
  const { t } = useTranslation()
  const { roles } = useAuth()
  const change = useChangeVisitStatus(entry.id)
  const moves = allowedStatusChanges(entry.status)

  const mayChangeStatus = roles.includes('nurse') || roles.includes('doctor')
  if (!mayChangeStatus || moves.length === 0) return null

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {moves.map((to) => (
          <Button
            key={to}
            type="button"
            size="sm"
            variant={to === 'in_progress' ? 'default' : 'outline'}
            disabled={change.isPending}
            onClick={() => change.mutate({ status: to, note: null })}
          >
            {t(`queue.action.${to}`)}
          </Button>
        ))}
      </div>
      {/* Says what happened rather than silently reverting — the common cause is a
          colleague having moved this visit first, which the doctor should know. */}
      {change.isError && (
        <p className="text-xs text-destructive">{t('queue.action.failed')}</p>
      )}
    </div>
  )
}
