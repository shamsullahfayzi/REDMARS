import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Clock, RefreshCw, Stethoscope } from 'lucide-react'
import type { QueueEntry, VisitDepartmentOption } from '@redmars/shared'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useQueue, waitTone } from '@/hooks/useQueue'
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

  const optionsQuery = useVisitOptions()
  const queue = useQueue({ departmentId: departmentId || undefined, date: date || undefined, includeClosed })

  const data = queue.data
  const entries = data?.entries ?? []
  const departments = optionsQuery.data?.departments ?? []

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
      </div>

      {queue.isError && <p className="text-sm text-destructive">{t('queue.error')}</p>}

      {!queue.isError && entries.length === 0 && !queue.isPending ? (
        <Card className="p-8 text-center">
          <Clock className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-muted-foreground">{t('queue.empty')}</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry, index) => (
            <QueueRow key={entry.id} entry={entry} position={index + 1} />
          ))}
        </ul>
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

function QueueRow({ entry, position }: { entry: QueueEntry; position: number }) {
  const { t } = useTranslation()
  const tone = waitTone(entry.waitedMinutes)

  return (
    <li>
      <Card className="flex flex-wrap items-center gap-4 p-4">
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
