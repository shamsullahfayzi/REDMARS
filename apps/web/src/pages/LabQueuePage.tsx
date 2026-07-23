import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Beaker, CheckCircle2, Clock, RefreshCw, Wallet, WifiOff } from 'lucide-react'
import type { LabQueueEntry, LabOrderItemStatus } from '@redmars/shared'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { LAB_QUEUE_POLL_MS, useLabQueue } from '@/hooks/useLabQueue'
import { waitTone } from '@/hooks/useQueue'
import { cn } from '@/lib/utils'

/**
 * Phase 5 — the lab worklist, the bench's screen.
 *
 * One question: what do I work next. So it is ordered by arrival (longest wait first, like
 * the visit queue) and grouped by patient, because a sample is drawn once per person even
 * when the doctor asked for four tests. The fact that gates the next step — is this paid —
 * is the loudest thing on each group after the name: Farhat collects at the window before a
 * sample is taken, and a bench that cannot see who has paid draws blood it should not.
 *
 * It re-reads itself every ten seconds and says when it has stopped, for the same reason the
 * visit queue does — a frozen screen that still looks live is the dangerous kind.
 *
 * Collecting the sample, entering the result and verifying it are the next slices; this one
 * shows the work, it does not yet move it.
 */

/** The active statuses a bench filters between, in the order work flows through them. */
const FILTERABLE: readonly LabOrderItemStatus[] = [
  'ordered',
  'sample_collected',
  'in_progress',
  'resulted',
]

interface OrderGroup {
  orderId: string
  orderNo: string
  visitId: string
  patientId: string
  patientName: string
  patientMrn: string
  waitedMinutes: number
  entries: LabQueueEntry[]
}

function groupByOrder(entries: LabQueueEntry[]): OrderGroup[] {
  const byOrder = new Map<string, OrderGroup>()
  for (const entry of entries) {
    let group = byOrder.get(entry.orderId)
    if (!group) {
      group = {
        orderId: entry.orderId,
        orderNo: entry.orderNo,
        visitId: entry.visitId,
        patientId: entry.patientId,
        patientName: entry.patientName,
        patientMrn: entry.patientMrn,
        // The server already ordered entries oldest-first, so the first one seen is the
        // group's wait — every test on one order was written at the same moment anyway.
        waitedMinutes: entry.waitedMinutes,
        entries: [],
      }
      byOrder.set(entry.orderId, group)
    }
    group.entries.push(entry)
  }
  return [...byOrder.values()]
}

/** One order's payment, read from its priced tests — they all share the one invoice. */
function paymentOf(entries: LabQueueEntry[]): 'paid' | 'awaiting' | 'noCharge' {
  const priced = entries.filter((entry) => entry.price != null)
  if (priced.length === 0) return 'noCharge'
  return priced.every((entry) => entry.paid) ? 'paid' : 'awaiting'
}

export function LabQueuePage() {
  const { t } = useTranslation()
  const [date, setDate] = useState('')
  const [status, setStatus] = useState<LabOrderItemStatus | ''>('')

  const [today, setToday] = useState<string | null>(null)
  const isPastDay = date !== '' && today != null && date < today
  const polling = !isPastDay

  const queue = useLabQueue(
    { date: date || undefined, status: status || undefined },
    { poll: polling },
  )
  const data = queue.data

  useEffect(() => {
    if (date === '' && data?.date) setToday(data.date)
  }, [date, data])

  const groups = groupByOrder(data?.entries ?? [])

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.lab')} description={t('labQueue.subtitle')} />

      {data && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Count label={t('labQueue.status.ordered')} value={data.counts.ordered} highlight />
          <Count label={t('labQueue.status.sample_collected')} value={data.counts.sample_collected} />
          <Count label={t('labQueue.status.in_progress')} value={data.counts.in_progress} />
          <Count label={t('labQueue.status.resulted')} value={data.counts.resulted} />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="labQueueDate">{t('labQueue.date')}</Label>
          <Input
            id="labQueueDate"
            type="date"
            dir="ltr"
            value={date || (data?.date ?? '')}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="labQueueStatus">{t('labQueue.filterStatus')}</Label>
          <Select
            id="labQueueStatus"
            value={status}
            onChange={(e) => setStatus(e.target.value as LabOrderItemStatus | '')}
          >
            <option value="">{t('labQueue.allActive')}</option>
            {FILTERABLE.map((value) => (
              <option key={value} value={value}>
                {t(`labQueue.status.${value}`)}
              </option>
            ))}
          </Select>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => void queue.refetch()}
          disabled={queue.isFetching}
        >
          <RefreshCw className={cn('size-4', queue.isFetching && 'animate-spin')} aria-hidden />
          {t('labQueue.refresh')}
        </Button>

        <div className="ms-auto flex items-center gap-2 text-sm text-muted-foreground">
          <span
            className={cn(
              'size-2 rounded-full',
              queue.isError && data ? 'bg-destructive' : polling ? 'bg-success' : 'bg-muted-foreground',
            )}
            aria-hidden
          />
          <span>
            {queue.isError && data
              ? t('labQueue.live.failing')
              : isPastDay
                ? t('labQueue.live.pastDay')
                : t('labQueue.live.on', { seconds: Math.round(LAB_QUEUE_POLL_MS / 1000) })}
          </span>
        </div>
      </div>

      {queue.isError && !data && <p className="text-sm text-destructive">{t('labQueue.error')}</p>}

      {queue.isError && data && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <WifiOff className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p className="text-sm font-medium text-destructive">{t('labQueue.live.failing')}</p>
        </div>
      )}

      {!queue.isError && groups.length === 0 && !queue.isPending ? (
        <Card className="p-8 text-center">
          <Beaker className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-muted-foreground">{t('labQueue.empty')}</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {groups.map((group) => (
            <OrderCard key={group.orderId} group={group} />
          ))}
        </ul>
      )}
    </div>
  )
}

function OrderCard({ group }: { group: OrderGroup }) {
  const { t } = useTranslation()
  const tone = waitTone(group.waitedMinutes)
  const payment = paymentOf(group.entries)

  return (
    <li>
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-48 flex-1">
            <Link
              to={`/consult/${group.visitId}`}
              className="font-semibold text-foreground hover:underline"
            >
              {group.patientName}
            </Link>
            <p className="mt-0.5 text-sm text-muted-foreground">
              <span dir="ltr" className="font-mono">
                {group.patientMrn}
              </span>
              {' · '}
              <span dir="ltr" className="font-mono">
                {group.orderNo}
              </span>
            </p>
          </div>

          <PaymentBadge payment={payment} />

          {/* The loudest thing after the name — a wait nobody noticed is what the screen
              exists to prevent. */}
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
            {t('labQueue.waited', { minutes: group.waitedMinutes })}
          </span>
        </div>

        <ul className="divide-y divide-border rounded-lg border border-border">
          {group.entries.map((entry) => (
            <li key={entry.itemId} className="flex items-center gap-3 px-3 py-2">
              <span className="flex-1 text-sm text-foreground">
                {entry.testName}
                <span dir="ltr" className="ms-2 font-mono text-xs text-muted-foreground">
                  {entry.code}
                </span>
              </span>
              <StatusPill status={entry.status} />
              <span className="w-20 text-end text-sm tabular-nums text-muted-foreground" dir="ltr">
                {entry.price == null ? t('labQueue.noCharge') : entry.price}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </li>
  )
}

function PaymentBadge({ payment }: { payment: 'paid' | 'awaiting' | 'noCharge' }) {
  const { t } = useTranslation()
  if (payment === 'noCharge') {
    return (
      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
        {t('labQueue.payment.noCharge')}
      </span>
    )
  }
  const paid = payment === 'paid'
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        paid ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning-foreground',
      )}
    >
      {paid ? <CheckCircle2 className="size-3.5" aria-hidden /> : <Wallet className="size-3.5" aria-hidden />}
      {paid ? t('labQueue.payment.paid') : t('labQueue.payment.awaiting')}
    </span>
  )
}

function StatusPill({ status }: { status: LabOrderItemStatus }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-1 text-xs font-medium',
        status === 'ordered'
          ? 'bg-primary/10 text-primary'
          : status === 'sample_collected'
            ? 'bg-info/15 text-info'
            : status === 'in_progress'
              ? 'bg-warning/15 text-warning-foreground'
              : status === 'resulted'
                ? 'bg-accent/15 text-accent-foreground'
                : 'bg-muted text-muted-foreground',
      )}
    >
      {t(`labQueue.status.${status}`)}
    </span>
  )
}

function Count({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <Card className={cn('p-4', highlight && 'border-primary/40')}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
        {value}
      </p>
    </Card>
  )
}
