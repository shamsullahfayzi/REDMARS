import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { CalendarClock, CheckCircle2, Phone, RefreshCw, Stethoscope } from 'lucide-react'
import { FOLLOW_UP_DEFAULT_DAYS, type FollowUp, type FollowUpResponseStatus } from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFollowUps, useRespondFollowUp } from '@/hooks/useFollowUps'
import { cn } from '@/lib/utils'

/**
 * Task 4.15 — the recall list. "Psych patients due next month are listable."
 *
 * IT IS A WORK QUEUE, NOT A DIARY, and every choice here follows from that. A list of who
 * is due is something to read; a list of who is due AND HAS NOT BEEN SEEN is something to
 * do, and disengagement is what a psychiatric service is trying to catch. So the phone
 * number is on the row rather than a click away, "not seen" is the loud state, and the
 * count in the header is the number of calls to make rather than the number of rows.
 *
 * IT IS NOT THE APPOINTMENT BOOK. Task 3.10 knows who booked; this knows who was TOLD to
 * come back, which at Farhat is most of them and overlaps the book hardly at all.
 *
 * Two ways it is used, and the date range serves both: forward from today, which is the
 * clinic's diary, and BACKWARD over a window that has passed with `onlyMissed` on, which is
 * the list of people who never came. The second is the one that finds patients.
 *
 * ONE PAGE, FOUR VIEWERS. Admin, receptionist, doctor and — R13 — call_center all read the
 * exact same list; nothing here forks into a second page for the new role. The left-edge
 * urgency color (yellow/green/red, this session's addition) and the response badge are
 * visible to everyone who can see the row at all — that IS how a doctor "sees the change" a
 * call center logs. The three response BUTTONS are the only thing that's viewer-specific,
 * gated on `roles.includes('call_center') || roles.includes('admin')` — courtesy hiding,
 * same as everywhere else in this app; the server's `follow_up.respond` gate is the real one.
 */
export function FollowUpsPage() {
  const { t } = useTranslation()
  const { roles } = useAuth()
  const canRespond = roles.includes('call_center') || roles.includes('admin')
  // call_center holds neither `patient.read_*` nor consult/queue access — a link into
  // either would only 403. Distinct from `canRespond`: admin can respond too, but (unlike
  // call_center) genuinely holds the read grants those links need, so admin keeps them.
  const isCallCenterOnly = roles.length === 1 && roles[0] === 'call_center'
  // A call-center-only login has one job: the next two days. Everyone else keeps the
  // existing 30-day diary default. Computed once, at mount — a role does not change under
  // a signed-in session, so there is nothing to react to afterward.
  const [from, setFrom] = useState('')
  const [to, setTo] = useState(() => (isCallCenterOnly ? shiftDay(facilityToday(), 2) : ''))
  const [onlyMissed, setOnlyMissed] = useState(false)

  const followUps = useFollowUps({
    from: from || undefined,
    to: to || undefined,
    onlyMissed,
  })
  const data = followUps.data
  const today = facilityToday()

  /** Shift the served window by whole days, so "the month before" is one click. */
  function shiftWindow(days: number) {
    if (!data) return
    setFrom(shiftDay(data.from, days))
    setTo(shiftDay(data.to, days))
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.followUps')} description={t('followUps.description')} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="followUpFrom">{t('followUps.from')}</Label>
          <Input
            id="followUpFrom"
            type="date"
            dir="ltr"
            value={from || data?.from || ''}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="followUpTo">{t('followUps.to')}</Label>
          <Input
            id="followUpTo"
            type="date"
            dir="ltr"
            value={to || data?.to || ''}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>

        {/* The move that turns the diary into the list of people who never came. */}
        <Button
          type="button"
          variant="outline"
          disabled={!data}
          onClick={() => shiftWindow(-(FOLLOW_UP_DEFAULT_DAYS + 1))}
        >
          {t('followUps.previousWindow')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!data}
          onClick={() => shiftWindow(FOLLOW_UP_DEFAULT_DAYS + 1)}
        >
          {t('followUps.nextWindow')}
        </Button>

        <label className="flex h-10 items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={onlyMissed}
            onChange={(event) => setOnlyMissed(event.target.checked)}
            className="size-4 accent-primary"
          />
          {t('followUps.onlyMissed')}
        </label>

        <Button
          type="button"
          variant="outline"
          onClick={() => void followUps.refetch()}
          disabled={followUps.isFetching}
        >
          <RefreshCw className={cn('size-4', followUps.isFetching && 'animate-spin')} aria-hidden />
          {t('followUps.refresh')}
        </Button>
      </div>

      {data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Count label={t('followUps.due')} value={data.followUps.length} />
          {/* Counted over the WINDOW, not over the filtered list — so the number does not
              change meaning under the desk as they work it down. */}
          <Count label={t('followUps.missed')} value={data.missed} highlight={data.missed > 0} />
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('followUps.window')}
            </p>
            <p className="mt-1 text-sm font-medium text-foreground" dir="ltr">
              {data.from} → {data.to}
            </p>
          </Card>
        </div>
      )}

      {followUps.isError && <p className="text-sm text-destructive">{t('followUps.error')}</p>}

      {data?.truncated && (
        <p className="text-sm text-warning">{t('followUps.truncated')}</p>
      )}

      {!followUps.isError && !followUps.isPending && data?.followUps.length === 0 ? (
        <Card className="p-8 text-center">
          <CalendarClock className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-muted-foreground">{t('followUps.empty')}</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {(data?.followUps ?? []).map((followUp) => (
            <li key={followUp.prescriptionId}>
              <FollowUpRow
                followUp={followUp}
                today={today}
                canRespond={canRespond}
                isCallCenterOnly={isCallCenterOnly}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Not attended yet: where the due date sits relative to today. Attended has nothing left to warn about. */
function urgencyOf(followUp: FollowUp, today: string): 'upcoming' | 'due' | 'overdue' | null {
  if (followUp.attended) return null
  if (followUp.followUpDate > today) return 'upcoming'
  if (followUp.followUpDate === today) return 'due'
  return 'overdue'
}

const URGENCY_BORDER: Record<'upcoming' | 'due' | 'overdue', string> = {
  upcoming: 'border-s-4 border-s-warning',
  due: 'border-s-4 border-s-success',
  overdue: 'border-s-4 border-s-destructive',
}

function FollowUpRow({
  followUp,
  today,
  canRespond,
  isCallCenterOnly,
}: {
  followUp: FollowUp
  today: string
  canRespond: boolean
  isCallCenterOnly: boolean
}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const urgency = urgencyOf(followUp, today)

  // call_center holds neither `patient.read_*` nor consult access — the whole-row click,
  // the patient link and the "open visit" link all lead somewhere that would only 403 for
  // them, so none of the three exist on their screen. Everyone else keeps all three exactly
  // as before this task.
  function openConsult() {
    if (isCallCenterOnly) return
    navigate(`/consult/${followUp.visitId}`)
  }

  return (
    <Card
      role={isCallCenterOnly ? undefined : 'button'}
      tabIndex={isCallCenterOnly ? undefined : 0}
      onClick={isCallCenterOnly ? undefined : openConsult}
      onKeyDown={
        isCallCenterOnly
          ? undefined
          : (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                openConsult()
              }
            }
      }
      className={cn(
        'flex flex-wrap items-center gap-4 p-4',
        !isCallCenterOnly && 'cursor-pointer transition-colors hover:border-ring hover:bg-muted/40',
        urgency && URGENCY_BORDER[urgency],
      )}
    >
      <div className="w-28 shrink-0">
        <p className="text-sm font-semibold text-foreground" dir="ltr">
          {formatDay(followUp.followUpDate, i18n.language)}
        </p>
      </div>

      <div className="min-w-48 flex-1">
        {isCallCenterOnly ? (
          <span className="font-semibold text-foreground">{followUp.patientName}</span>
        ) : (
          <Link
            to={`/patients/${followUp.patientId}`}
            onClick={(event) => event.stopPropagation()}
            className="font-semibold text-foreground hover:underline"
          >
            {followUp.patientName}
          </Link>
        )}
        <p className="mt-0.5 text-sm text-muted-foreground">
          <span dir="ltr" className="font-mono">
            {followUp.patientMrn}
          </span>
          {followUp.practitionerName && ` · ${followUp.practitionerName}`}
        </p>
      </div>

      {/* On the row, not a click away. A recall list that sends the desk to look up a
          number one patient at a time is a recall list that does not get worked. */}
      {followUp.patientPhone ? (
        <a
          href={`tel:${followUp.patientPhone}`}
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          dir="ltr"
        >
          <Phone className="size-4" aria-hidden />
          {followUp.patientPhone}
        </a>
      ) : (
        <span className="text-sm text-muted-foreground">{t('followUps.noPhone')}</span>
      )}

      {followUp.attended ? (
        <Badge variant="success">
          <CheckCircle2 className="me-1 size-3.5" aria-hidden />
          {t('followUps.seen')}
        </Badge>
      ) : (
        <Badge variant="warning">{t('followUps.notSeen')}</Badge>
      )}

      {followUp.response && <ResponseBadge response={followUp.response} />}

      {canRespond && (
        <div onClick={(event) => event.stopPropagation()}>
          <RespondControls prescriptionId={followUp.prescriptionId} />
        </div>
      )}

      {/* Back to the consultation the plan was made in — the same destination the row
          click now opens, kept as its own link so the row's affordance is not the only
          way in (a screen reader landmark, a middle-click to open in a new tab). */}
      {!isCallCenterOnly && (
        <Link
          to={`/consult/${followUp.visitId}`}
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <Stethoscope className="size-4" aria-hidden />
          {t('followUps.openVisit')}
        </Link>
      )}
    </Card>
  )
}

function ResponseBadge({ response }: { response: NonNullable<FollowUp['response']> }) {
  const { t } = useTranslation()
  const variant =
    response.status === 'coming' ? 'success' : response.status === 'not_coming' ? 'danger' : 'outline'
  return (
    <Badge variant={variant} title={response.note ?? undefined}>
      {t(`followUps.response.${response.status}`)}
    </Badge>
  )
}

/** The call center's three buttons — Coming / Not coming fire straight away, Custom opens a note first. */
function RespondControls({ prescriptionId }: { prescriptionId: string }) {
  const { t } = useTranslation()
  const respond = useRespondFollowUp()
  const [showCustom, setShowCustom] = useState(false)
  const [note, setNote] = useState('')

  function send(status: FollowUpResponseStatus, withNote?: string) {
    respond.mutate(
      { prescriptionId, status, note: withNote?.trim() || undefined },
      { onSuccess: () => setShowCustom(false) },
    )
  }

  if (showCustom) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t('followUps.response.notePlaceholder')}
          className="h-8 w-48 text-sm"
        />
        <Button
          type="button"
          size="sm"
          disabled={respond.isPending}
          onClick={() => send('custom', note)}
        >
          {t('followUps.response.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setShowCustom(false)}>
          {t('followUps.response.cancel')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={respond.isPending}
        onClick={() => send('coming')}
      >
        {t('followUps.response.coming')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={respond.isPending}
        onClick={() => send('not_coming')}
      >
        {t('followUps.response.not_coming')}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setShowCustom(true)}>
        {t('followUps.response.custom')}
      </Button>
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
    <Card className={cn('p-4', highlight && 'border-warning/50')}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
        {value}
      </p>
    </Card>
  )
}

/** Today, as the hospital reads it — same reading every other page's local copy uses. */
function facilityToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kabul' }).format(new Date())
}

/** Whole days in UTC — these strings are calendar days at the hospital, not instants. */
function shiftDay(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/** Noon UTC, so a calendar day never renders as the day before it. */
function formatDay(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  )
}
