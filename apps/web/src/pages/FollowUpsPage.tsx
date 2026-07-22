import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { CalendarClock, CheckCircle2, Phone, RefreshCw, Stethoscope } from 'lucide-react'
import { FOLLOW_UP_DEFAULT_DAYS, type FollowUp } from '@redmars/shared'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFollowUps } from '@/hooks/useFollowUps'
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
 */
export function FollowUpsPage() {
  const { t } = useTranslation()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [onlyMissed, setOnlyMissed] = useState(false)

  const followUps = useFollowUps({
    from: from || undefined,
    to: to || undefined,
    onlyMissed,
  })
  const data = followUps.data

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
              <FollowUpRow followUp={followUp} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FollowUpRow({ followUp }: { followUp: FollowUp }) {
  const { t, i18n } = useTranslation()

  return (
    <Card
      className={cn(
        'flex flex-wrap items-center gap-4 p-4',
        // Not seen is the loud state. The whole list exists for these rows.
        !followUp.attended && 'border-warning/40',
      )}
    >
      <div className="w-28 shrink-0">
        <p className="text-sm font-semibold text-foreground" dir="ltr">
          {formatDay(followUp.followUpDate, i18n.language)}
        </p>
      </div>

      <div className="min-w-48 flex-1">
        <Link
          to={`/patients/${followUp.patientId}`}
          className="font-semibold text-foreground hover:underline"
        >
          {followUp.patientName}
        </Link>
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

      {/* Back to the consultation the plan was made in — which is where the reasoning is,
          and which audits its own read. */}
      <Link
        to={`/consult/${followUp.visitId}`}
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <Stethoscope className="size-4" aria-hidden />
        {t('followUps.openVisit')}
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
    <Card className={cn('p-4', highlight && 'border-warning/50')}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
        {value}
      </p>
    </Card>
  )
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
