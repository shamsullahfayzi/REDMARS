import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Wallet } from 'lucide-react'
import type { TillSummary } from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useTillReport } from '@/hooks/useTill'

/** Today, as the hospital reads it — the till opens to the day being closed. */
function facilityToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kabul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/**
 * Task 6.12 — daily cash reconciliation, per till.
 *
 * The operator (receptionist, pharmacist) counts their own drawer at closing; an admin or
 * manager sees every till at once. Cash is the figure that must balance — it is the number
 * shown large; card and transfer are recorded beneath but do not sit in the drawer.
 */
export function TillPage() {
  const { t } = useTranslation()
  const { roles } = useAuth()
  const scope = roles.includes('admin') || roles.includes('management') ? 'all' : 'mine'
  const [date, setDate] = useState(facilityToday())
  const query = useTillReport(scope, date || undefined)
  const report = query.data

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.till')} description={t('till.subtitle')} />

      <div>
        <label className="mb-1 block text-xs text-muted-foreground">{t('till.date')}</label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-40"
          dir="ltr"
        />
      </div>

      {query.isError && <p className="text-sm text-destructive">{t('till.error')}</p>}

      {report && !query.isError && (
        <>
          {report.tills.length === 0 ? (
            <Card className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
              <Wallet className="size-8" aria-hidden />
              <p>{t('till.empty')}</p>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {report.tills.map((till) => (
                <TillCard key={till.userId ?? 'unattributed'} till={till} />
              ))}
            </div>
          )}

          {scope === 'all' && report.tills.length > 0 && (
            <Card className="max-w-md space-y-2 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('till.grandCash')}</span>
                <span className="font-mono text-lg font-bold text-foreground" dir="ltr">
                  {report.cashTotal}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('till.grandTotal')}</span>
                <span className="font-mono text-foreground" dir="ltr">
                  {report.grandTotal}
                </span>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function TillCard({ till }: { till: TillSummary }) {
  const { t } = useTranslation()
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-medium text-foreground">
          {till.userName || t('till.unattributed')}
        </span>
        <span className="text-xs text-muted-foreground">
          {t('till.movements', { payments: till.paymentCount, refunds: till.refundCount })}
        </span>
      </div>

      <div>
        <p className="text-xs text-muted-foreground">{t('till.cashToCount')}</p>
        <p className="font-mono text-2xl font-bold text-foreground" dir="ltr">
          {till.cashTotal}
        </p>
      </div>

      {till.byMethod.length > 0 && (
        <dl className="space-y-1 border-t border-border pt-2 text-sm">
          {till.byMethod.map((m) => (
            <div key={m.method} className="flex justify-between">
              <dt className="text-muted-foreground">
                {t(`payments.methodLabel.${m.method}`, { defaultValue: m.method })}
              </dt>
              <dd className="font-mono text-foreground" dir="ltr">
                {m.amount}
              </dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-1 font-medium">
            <dt className="text-foreground">{t('till.total')}</dt>
            <dd className="font-mono text-foreground" dir="ltr">
              {till.total}
            </dd>
          </div>
        </dl>
      )}
    </Card>
  )
}
