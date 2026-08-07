import { Fragment, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, Clock, Download, PieChart, Printer, Stethoscope, TrendingUp } from 'lucide-react'
import { AUDIT_ACTIONS, patientExportResponseSchema, type PatientExportResponse } from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { CensusBarChart } from '@/components/charts/CensusBarChart'
import { DonutChart } from '@/components/charts/DonutChart'
import { HorizontalBarChart } from '@/components/charts/HorizontalBarChart'
import { TrendLineChart } from '@/components/charts/TrendLineChart'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { apiGet } from '@/lib/api'
import { downloadCsv } from '@/lib/csv'
import { useVisitOptions } from '@/hooks/useVisits'
import {
  useAuditLogReport,
  useCensusReport,
  useDiagnosisReport,
  useErrorLogReport,
  useRevenueReport,
  useWaitTimeReport,
} from '@/hooks/useReports'

/**
 * A day, written the way every other document in this app already writes one —
 * `day-Mon-year`, month spelled short and in Latin letters regardless of UI language,
 * same as the receipt date on CollectionsPage and the issued-on line on the ID card.
 * Numbers stay numbers; only the month gets a name, so "07" never reads as ambiguous
 * day-vs-month the way an all-numeric date does across three languages at once.
 */
function formatDay(dateStr: string, withYear = true): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: withYear ? 'numeric' : undefined,
    timeZone: 'Asia/Kabul',
  }).format(new Date(`${dateStr}T12:00:00Z`))
}

/** Same day format, plus the time — the audit log's "when" column, to the minute. */
function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kabul',
  }).format(new Date(iso))
}

/** The small icon + label every chart card opens with — one visual rhythm across the page. */
function ChartHeading({ icon: Icon, children }: { icon: typeof Activity; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-1.5 text-sm font-medium text-foreground">
      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      {children}
    </div>
  )
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2.5 rounded-full ${className}`} aria-hidden="true" />
      {label}
    </span>
  )
}

/** Today, as the hospital reads it — matches TillPage's own local reading of the same zone. */
function facilityToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kabul' }).format(new Date())
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kabul' }).format(d)
}

/** The first and last day of the facility's calendar month, `monthsAgo` months back. */
function monthBounds(monthsAgo: number): { from: string; to: string } {
  const [y, m] = facilityToday().split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1 - monthsAgo, 1))
  const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0))
  return { from: base.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }
}

type Preset = 'today' | 'yesterday' | 'thisMonth' | 'lastMonth' | 'custom'

const PRESET_RANGE: Record<Exclude<Preset, 'custom'>, () => { from: string; to: string }> = {
  today: () => ({ from: facilityToday(), to: facilityToday() }),
  yesterday: () => ({ from: daysAgo(1), to: daysAgo(1) }),
  thisMonth: () => ({ from: monthBounds(0).from, to: facilityToday() }),
  lastMonth: () => monthBounds(1),
}

type TabKey = 'census' | 'waitTimes' | 'revenue' | 'diagnoses' | 'audit' | 'errors' | 'export'

/**
 * Task 6c — the reports the matrix (`report.operational`, `report.financial`,
 * `report.clinical_aggregate`, `audit_log.read`, `data.export`) has gated since 6b and
 * nothing has read until now. Which tabs render is the SAME split as the permission grants:
 * admin and management see every tab; a receptionist sees only her own census/wait-time
 * (R8); a doctor sees only diagnosis counts (their own patients — the server enforces the
 * scoping regardless of what this page shows). Role-gating here is courtesy, same as nav.ts
 * — the server re-checks every request on its own permission.
 */
export function ReportsPage() {
  const { t } = useTranslation()
  const { roles } = useAuth()

  const canOperational = roles.some((r) => ['admin', 'receptionist', 'management'].includes(r))
  const canFinancial = roles.some((r) => ['admin', 'management'].includes(r))
  const canClinical = roles.some((r) => ['admin', 'doctor', 'management'].includes(r))
  const canAudit = roles.some((r) => ['admin', 'management'].includes(r))
  // Same holders as canAudit (error_log.read mirrors audit_log.read) — oversight, not clinical.
  const canErrors = roles.some((r) => ['admin', 'management'].includes(r))
  const canExport = roles.includes('admin')

  const tabs = useMemo(
    () =>
      (
        [
          canOperational && ({ key: 'census', label: t('reports.tabs.census') } as const),
          canOperational && ({ key: 'waitTimes', label: t('reports.tabs.waitTimes') } as const),
          canFinancial && ({ key: 'revenue', label: t('reports.tabs.revenue') } as const),
          canClinical && ({ key: 'diagnoses', label: t('reports.tabs.diagnoses') } as const),
          canAudit && ({ key: 'audit', label: t('reports.tabs.audit') } as const),
          canErrors && ({ key: 'errors', label: t('reports.tabs.errors') } as const),
          canExport && ({ key: 'export', label: t('reports.tabs.export') } as const),
        ] as const
      ).filter((tab): tab is { key: TabKey; label: string } => tab !== false),
    [canOperational, canFinancial, canClinical, canAudit, canErrors, canExport, t],
  )

  const [active, setActive] = useState<TabKey | null>(tabs[0]?.key ?? null)
  const [preset, setPreset] = useState<Preset>('custom')
  const [from, setFrom] = useState(daysAgo(6))
  const [to, setTo] = useState(facilityToday())
  const [departmentId, setDepartmentId] = useState('')
  const [practitionerId, setPractitionerId] = useState('')

  const applyPreset = (p: Exclude<Preset, 'custom'>) => {
    const range = PRESET_RANGE[p]()
    setFrom(range.from)
    setTo(range.to)
    setPreset(p)
  }

  // The reception check-in screen's own picker (visit.read_queue) — every role that holds
  // any report permission also holds this one, so it never 403s here where the admin-only
  // /departments and /practitioners lists would. See useVisits.ts's own note on why.
  const options = useVisitOptions()
  const practitioners = useMemo(() => {
    const all = options.data?.practitioners ?? []
    return departmentId ? all.filter((p) => p.departmentIds.includes(departmentId)) : all
  }, [options.data, departmentId])

  const showFilters = active !== 'audit' && active !== 'errors' && active !== 'export'
  const showPractitionerFilter = showFilters && active !== 'revenue'

  if (!active) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('nav.reports')} description={t('reports.subtitle')} />
        <p className="text-muted-foreground">{t('reports.noAccess')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.reports')} description={t('reports.subtitle')} />

      <div className="flex flex-wrap gap-1 print:hidden">
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            variant={active === tab.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActive(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-end gap-2 print:hidden">
          <div className="flex gap-1">
            {(['today', 'yesterday', 'thisMonth', 'lastMonth'] as const).map((p) => (
              <Button
                key={p}
                variant={preset === p ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyPreset(p)}
              >
                {t(`reports.presets.${p}`)}
              </Button>
            ))}
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('reports.from')}</label>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                setPreset('custom')
              }}
              dir="ltr"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('reports.to')}</label>
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                setPreset('custom')
              }}
              dir="ltr"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              {t('reports.filterDepartment')}
            </label>
            <Select
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value)
                setPractitionerId('')
              }}
              className="w-40"
            >
              <option value="">{t('reports.allDepartments')}</option>
              {options.data?.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          {showPractitionerFilter && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                {t('reports.filterDoctor')}
              </label>
              <Select
                value={practitionerId}
                onChange={(e) => setPractitionerId(e.target.value)}
                className="w-40"
              >
                <option value="">{t('reports.allDoctors')}</option>
                {practitioners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer /> {t('reports.print')}
          </Button>
        </div>
      )}

      <div className="hidden print:block">
        <p className="text-lg font-semibold">
          {tabs.find((tab) => tab.key === active)?.label} — {formatDay(from)} → {formatDay(to)}
        </p>
      </div>

      {active === 'census' && <CensusView from={from} to={to} departmentId={departmentId} practitionerId={practitionerId} />}
      {active === 'waitTimes' && (
        <WaitTimesView from={from} to={to} departmentId={departmentId} practitionerId={practitionerId} />
      )}
      {active === 'revenue' && <RevenueView from={from} to={to} departmentId={departmentId} />}
      {active === 'diagnoses' && (
        <DiagnosesView from={from} to={to} departmentId={departmentId} practitionerId={practitionerId} />
      )}
      {active === 'audit' && <AuditLogView from={from} to={to} />}
      {active === 'errors' && <ErrorLogView from={from} to={to} />}
      {active === 'export' && <PatientExportView />}
    </div>
  )
}

function ReportShell({
  isPending,
  isError,
  isEmpty,
  children,
}: {
  isPending: boolean
  isError: boolean
  isEmpty: boolean
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  if (isError) return <p className="text-sm text-destructive">{t('reports.error')}</p>
  if (isPending) return <p className="text-muted-foreground">{t('reports.loading')}</p>
  if (isEmpty) return <p className="text-muted-foreground">{t('reports.empty')}</p>
  return <>{children}</>
}

function CensusView({
  from,
  to,
  departmentId,
  practitionerId,
}: {
  from: string
  to: string
  departmentId: string
  practitionerId: string
}) {
  const { t } = useTranslation()
  const query = useCensusReport({ from, to, departmentId: departmentId || undefined, practitionerId: practitionerId || undefined }, true)
  const data = query.data

  const days = useMemo(() => {
    if (!data) return []
    const byDate = new Map<string, { completed: number; cancelled: number; total: number }>()
    for (const r of data.rows) {
      const bucket = byDate.get(r.date) ?? { completed: 0, cancelled: 0, total: 0 }
      bucket.completed += r.completed
      bucket.cancelled += r.cancelled
      bucket.total += r.visitCount
      byDate.set(r.date, bucket)
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, b]) => ({
        axisLabel: formatDay(date, false),
        fullLabel: formatDay(date),
        completed: b.completed,
        cancelled: b.cancelled,
        other: Math.max(0, b.total - b.completed - b.cancelled),
        total: b.total,
      }))
  }, [data])

  return (
    <section className="space-y-3">
      {data && data.scope === 'own' && (
        <p className="text-xs text-muted-foreground">{t('reports.ownScopeNotice')}</p>
      )}
      <ReportShell isPending={query.isPending} isError={query.isError} isEmpty={!!data && data.rows.length === 0}>
        {data && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t('reports.census.totals', {
                  visits: data.totals.visitCount,
                  completed: data.totals.completed,
                  cancelled: data.totals.cancelled,
                  noShow: data.totals.noShow,
                })}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="print:hidden"
                onClick={() =>
                  downloadCsv(
                    `census_${from}_${to}.csv`,
                    ['Date', 'Department', 'Visits', 'Completed', 'Cancelled', 'No-show'],
                    data.rows.map((r) => [r.date, r.departmentName, r.visitCount, r.completed, r.cancelled, r.noShow]),
                  )
                }
              >
                <Download /> {t('reports.downloadCsv')}
              </Button>
            </div>

            <Card className="p-4">
              <ChartHeading icon={Activity}>{t('reports.census.chartTitle')}</ChartHeading>
              <CensusBarChart days={days} ariaLabel={t('reports.census.chartTitle')} />
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <LegendDot className="bg-success" label={t('reports.census.col.completed')} />
                <LegendDot className="bg-destructive" label={t('reports.census.col.cancelled')} />
                <LegendDot className="bg-muted-foreground/30" label={t('reports.census.open')} />
              </div>
            </Card>

            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('reports.census.col.date')}</th>
                    <th className="p-3 text-start font-medium">{t('reports.census.col.department')}</th>
                    <th className="p-3 text-end font-medium">{t('reports.census.col.visits')}</th>
                    <th className="p-3 text-end font-medium">{t('reports.census.col.completed')}</th>
                    <th className="p-3 text-end font-medium">{t('reports.census.col.cancelled')}</th>
                    <th className="p-3 text-end font-medium">{t('reports.census.col.noShow')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={`${r.date}|${r.departmentId}`} className="border-b border-border last:border-0">
                      <td className="p-3 text-foreground" dir="ltr">{formatDay(r.date)}</td>
                      <td className="p-3 text-foreground">{r.departmentName}</td>
                      <td className="p-3 text-end font-mono text-foreground">{r.visitCount}</td>
                      <td className="p-3 text-end font-mono text-foreground">{r.completed}</td>
                      <td className="p-3 text-end font-mono text-foreground">{r.cancelled}</td>
                      <td className="p-3 text-end font-mono text-foreground">{r.noShow}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </ReportShell>
    </section>
  )
}

function WaitTimesView({
  from,
  to,
  departmentId,
  practitionerId,
}: {
  from: string
  to: string
  departmentId: string
  practitionerId: string
}) {
  const { t } = useTranslation()
  const query = useWaitTimeReport({ from, to, departmentId: departmentId || undefined, practitionerId: practitionerId || undefined }, true)
  const data = query.data

  const bars = useMemo(() => {
    if (!data) return []
    return [...data.rows]
      .filter((r) => r.avgWaitMinutes != null)
      .sort((a, b) => (b.avgWaitMinutes ?? 0) - (a.avgWaitMinutes ?? 0))
      .slice(0, 8)
      .map((r) => ({
        label: r.practitionerName ? `${r.departmentName} · ${r.practitionerName}` : r.departmentName,
        value: r.avgWaitMinutes ?? 0,
        displayValue: t('reports.waitTimes.minutes', { minutes: (r.avgWaitMinutes ?? 0).toFixed(1) }),
      }))
  }, [data, t])

  return (
    <section className="space-y-3">
      {data && data.scope === 'own' && (
        <p className="text-xs text-muted-foreground">{t('reports.ownScopeNotice')}</p>
      )}
      <ReportShell isPending={query.isPending} isError={query.isError} isEmpty={!!data && data.rows.length === 0}>
        {data && (
          <>
            {bars.length > 0 && (
              <Card className="p-4">
                <ChartHeading icon={Clock}>{t('reports.waitTimes.chartTitle')}</ChartHeading>
                <HorizontalBarChart data={bars} ariaLabel={t('reports.waitTimes.chartTitle')} />
              </Card>
            )}
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="print:hidden"
                onClick={() =>
                  downloadCsv(
                    `wait_times_${from}_${to}.csv`,
                    ['Department', 'Doctor', 'Visits', 'Avg wait (min)', 'Median wait (min)'],
                    data.rows.map((r) => [
                      r.departmentName,
                      r.practitionerName ?? '',
                      r.visitCount,
                      r.avgWaitMinutes?.toFixed(1) ?? '',
                      r.medianWaitMinutes?.toFixed(1) ?? '',
                    ]),
                  )
                }
              >
                <Download /> {t('reports.downloadCsv')}
              </Button>
            </div>
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('reports.waitTimes.col.department')}</th>
                    <th className="p-3 text-start font-medium">{t('reports.waitTimes.col.doctor')}</th>
                    <th className="p-3 text-end font-medium">{t('reports.waitTimes.col.visits')}</th>
                    <th className="p-3 text-end font-medium">{t('reports.waitTimes.col.avg')}</th>
                    <th className="p-3 text-end font-medium">{t('reports.waitTimes.col.median')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr
                      key={`${r.departmentId}|${r.practitionerId ?? ''}`}
                      className="border-b border-border last:border-0"
                    >
                      <td className="p-3 text-foreground">{r.departmentName}</td>
                      <td className="p-3 text-foreground">{r.practitionerName ?? '—'}</td>
                      <td className="p-3 text-end font-mono text-foreground">{r.visitCount}</td>
                      <td className="p-3 text-end font-mono text-foreground">
                        {r.avgWaitMinutes != null ? r.avgWaitMinutes.toFixed(1) : '—'}
                      </td>
                      <td className="p-3 text-end font-mono text-foreground">
                        {r.medianWaitMinutes != null ? r.medianWaitMinutes.toFixed(1) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </ReportShell>
    </section>
  )
}

function RevenueView({ from, to, departmentId }: { from: string; to: string; departmentId: string }) {
  const { t } = useTranslation()
  const query = useRevenueReport({ from, to, departmentId: departmentId || undefined }, true)
  const data = query.data

  const trend = useMemo(() => {
    if (!data) return []
    return [...data.byDay]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ label: formatDay(d.date, false), value: Number(d.total), displayValue: d.total }))
  }, [data])

  return (
    <section className="space-y-4">
      <ReportShell isPending={query.isPending} isError={query.isError} isEmpty={!!data && data.byDay.length === 0}>
        {data && (
          <>
            <Card className="max-w-xs p-4">
              <p className="text-xs text-muted-foreground">{t('reports.revenue.grandTotal')}</p>
              <p className="font-mono text-2xl font-bold text-foreground" dir="ltr">
                {data.grandTotal}
              </p>
            </Card>

            {trend.length > 1 && (
              <Card className="p-4">
                <ChartHeading icon={TrendingUp}>{t('reports.revenue.trendTitle')}</ChartHeading>
                <TrendLineChart points={trend} ariaLabel={t('reports.revenue.trendTitle')} />
              </Card>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="p-4">
                <ChartHeading icon={PieChart}>{t('reports.revenue.byDepartment')}</ChartHeading>
                <DonutChart
                  slices={data.byDepartment.map((d) => ({
                    label: d.type ? t(`departments.types.${d.type}`) : t('reports.revenue.otherDepartment'),
                    value: Number(d.total),
                    displayValue: d.total,
                  }))}
                  total={data.grandTotal}
                  totalLabel={t('reports.revenue.total')}
                  ariaLabel={t('reports.revenue.byDepartment')}
                />
              </Card>
              <Card className="p-4">
                <ChartHeading icon={PieChart}>{t('reports.revenue.byMethod')}</ChartHeading>
                <DonutChart
                  slices={data.byMethod.map((m) => ({
                    label: t(`payments.methodLabel.${m.method}`, { defaultValue: m.method }),
                    value: Number(m.total),
                    displayValue: m.total,
                  }))}
                  total={data.grandTotal}
                  totalLabel={t('reports.revenue.total')}
                  ariaLabel={t('reports.revenue.byMethod')}
                />
              </Card>
            </div>

            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="print:hidden"
                onClick={() =>
                  downloadCsv(
                    `revenue_${from}_${to}.csv`,
                    ['Date', 'Total'],
                    data.byDay.map((d) => [d.date, d.total]),
                  )
                }
              >
                <Download /> {t('reports.downloadCsv')}
              </Button>
            </div>
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('reports.revenue.col.date')}</th>
                    <th className="p-3 text-end font-medium">{t('reports.revenue.col.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byDay.map((d) => (
                    <tr key={d.date} className="border-b border-border last:border-0">
                      <td className="p-3 text-foreground" dir="ltr">{formatDay(d.date)}</td>
                      <td className="p-3 text-end font-mono text-foreground" dir="ltr">{d.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </ReportShell>
    </section>
  )
}

function DiagnosesView({
  from,
  to,
  departmentId,
  practitionerId,
}: {
  from: string
  to: string
  departmentId: string
  practitionerId: string
}) {
  const { t } = useTranslation()
  const query = useDiagnosisReport({ from, to, departmentId: departmentId || undefined, practitionerId: practitionerId || undefined }, true)
  const data = query.data

  const bars = useMemo(
    () =>
      (data?.rows ?? []).slice(0, 8).map((r) => ({
        label: r.label,
        value: r.count,
        displayValue: String(r.count),
      })),
    [data],
  )

  return (
    <section className="space-y-3">
      {data && data.scope === 'own' && (
        <p className="text-xs text-muted-foreground">{t('reports.diagnoses.ownScopeNotice')}</p>
      )}
      <ReportShell isPending={query.isPending} isError={query.isError} isEmpty={!!data && data.rows.length === 0}>
        {data && (
          <>
            {bars.length > 0 && (
              <Card className="p-4">
                <ChartHeading icon={Stethoscope}>{t('reports.diagnoses.chartTitle')}</ChartHeading>
                <HorizontalBarChart data={bars} ariaLabel={t('reports.diagnoses.chartTitle')} />
              </Card>
            )}
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="print:hidden"
                onClick={() =>
                  downloadCsv(
                    `diagnoses_${from}_${to}.csv`,
                    ['ICD code', 'Diagnosis', 'Count'],
                    data.rows.map((r) => [r.icdCode ?? '', r.label, r.count]),
                  )
                }
              >
                <Download /> {t('reports.downloadCsv')}
              </Button>
            </div>
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('reports.diagnoses.col.code')}</th>
                    <th className="p-3 text-start font-medium">{t('reports.diagnoses.col.label')}</th>
                    <th className="p-3 text-end font-medium">{t('reports.diagnoses.col.count')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={`${r.icdCode ?? 'text'}-${i}`} className="border-b border-border last:border-0">
                      <td className="p-3 font-mono text-foreground" dir="ltr">{r.icdCode ?? '—'}</td>
                      <td className="p-3 text-foreground">{r.label}</td>
                      <td className="p-3 text-end font-mono text-foreground">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </ReportShell>
    </section>
  )
}

function AuditLogView({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation()
  const [action, setAction] = useState('')
  const [entity, setEntity] = useState('')
  const [page, setPage] = useState(1)
  const query = useAuditLogReport({ from, to, action: action || undefined, entity: entity || undefined, page }, true)
  const data = query.data

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t('reports.audit.action')}</label>
          <Select
            value={action}
            onChange={(e) => {
              setAction(e.target.value)
              setPage(1)
            }}
            className="w-40"
          >
            <option value="">{t('reports.audit.anyAction')}</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t('reports.audit.entity')}</label>
          <Input
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value)
              setPage(1)
            }}
            placeholder={t('reports.audit.entityPlaceholder')}
            className="w-40"
          />
        </div>
      </div>

      <ReportShell isPending={query.isPending} isError={query.isError} isEmpty={!!data && data.rows.length === 0}>
        {data && (
          <>
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('reports.audit.col.when')}</th>
                    <th className="p-3 text-start font-medium">{t('reports.audit.col.who')}</th>
                    <th className="p-3 text-start font-medium">{t('reports.audit.col.action')}</th>
                    <th className="p-3 text-start font-medium">{t('reports.audit.col.entity')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="p-3 text-foreground" dir="ltr">
                        {formatDateTime(r.createdAt)}
                      </td>
                      <td className="p-3 text-foreground">{r.userName ?? '—'}</td>
                      <td className="p-3 text-foreground">{r.action}</td>
                      <td className="p-3 text-foreground">
                        {r.entity}
                        {r.entityId && (
                          <span className="ms-1 font-mono text-xs text-muted-foreground" dir="ltr">
                            {r.entityId.slice(0, 8)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <div className="flex items-center justify-between print:hidden">
              <p className="text-xs text-muted-foreground">
                {t('reports.audit.pageOf', { page: data.page, total: Math.max(1, Math.ceil(data.total / data.limit)) })}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  {t('reports.audit.prev')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * data.limit >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('reports.audit.next')}
                </Button>
              </div>
            </div>
          </>
        )}
      </ReportShell>
    </section>
  )
}

/**
 * Task 7.8 — "you can debug a 2am call" without SSH. Same shape as AuditLogView above, plus
 * a click-to-expand stack trace, since that is the one thing this screen exists to show that
 * the audit log never carries.
 */
function ErrorLogView({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation()
  const [statusCode, setStatusCode] = useState('')
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const query = useErrorLogReport(
    { from, to, statusCode: statusCode ? Number(statusCode) : undefined, page },
    true,
  )
  const data = query.data

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t('reports.errors.status')}</label>
          <Select
            value={statusCode}
            onChange={(e) => {
              setStatusCode(e.target.value)
              setPage(1)
            }}
            className="w-32"
          >
            <option value="">{t('reports.errors.anyStatus')}</option>
            {['500', '502', '503', '504'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <ReportShell isPending={query.isPending} isError={query.isError} isEmpty={!!data && data.rows.length === 0}>
        {data && (
          <>
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('reports.errors.col.when')}</th>
                    <th className="p-3 text-start font-medium">{t('reports.errors.col.status')}</th>
                    <th className="p-3 text-start font-medium">{t('reports.errors.col.request')}</th>
                    <th className="p-3 text-start font-medium">{t('reports.errors.col.message')}</th>
                    <th className="p-3 text-start font-medium">{t('reports.errors.col.who')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <Fragment key={r.id}>
                      <tr
                        className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                        onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                      >
                        <td className="p-3 text-foreground" dir="ltr">
                          {formatDateTime(r.createdAt)}
                        </td>
                        <td className="p-3 font-mono text-destructive">{r.statusCode}</td>
                        <td className="p-3 font-mono text-xs text-foreground" dir="ltr">
                          {r.method} {r.path}
                        </td>
                        <td className="max-w-xs truncate p-3 text-foreground">{r.message}</td>
                        <td className="p-3 text-foreground">{r.userName ?? '—'}</td>
                      </tr>
                      {expandedId === r.id && (
                        <tr className="border-b border-border bg-muted/30 last:border-0">
                          <td colSpan={5} className="p-3">
                            <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-mono text-xs text-foreground" dir="ltr">
                              {r.stack ?? r.message}
                            </pre>
                            {r.ipAddress && (
                              <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                                {t('reports.errors.from')}: {r.ipAddress}
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </Card>
            <div className="flex items-center justify-between print:hidden">
              <p className="text-xs text-muted-foreground">
                {t('reports.audit.pageOf', { page: data.page, total: Math.max(1, Math.ceil(data.total / data.limit)) })}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  {t('reports.audit.prev')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * data.limit >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('reports.audit.next')}
                </Button>
              </div>
            </div>
          </>
        )}
      </ReportShell>
    </section>
  )
}

/**
 * Task 6c.10 / R11 — the raw patient list. Its own tab, not folded into the others: every
 * other report here is counts and totals, and this is the one door onto patient identity —
 * admin only, a reason typed before the server will hand it over, and every pull leaves its
 * own audit row (enforced server-side; this form only makes the requirement visible).
 */
function PatientExportView() {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [result, setResult] = useState<PatientExportResponse | null>(null)
  const [error, setError] = useState(false)
  const [pending, setPending] = useState(false)

  const run = async () => {
    setPending(true)
    setError(false)
    try {
      const data = await apiGet(
        `/reports/patient-export?reason=${encodeURIComponent(reason)}`,
        patientExportResponseSchema,
      )
      setResult(data)
      downloadCsv(
        `patients_${facilityToday()}.csv`,
        ['MRN', 'Name', 'Gender', 'Phone', 'Address', 'Registered'],
        data.rows.map((r) => [r.mrn, r.name, r.gender, r.phone ?? '', r.address ?? '', r.registeredAt]),
      )
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="max-w-lg space-y-3">
      <p className="text-sm text-muted-foreground">{t('reports.export.explain')}</p>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">{t('reports.export.reason')}</label>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
      </div>
      <Button onClick={run} disabled={pending || reason.trim().length < 5}>
        <Download /> {t('reports.export.action')}
      </Button>
      {error && <p className="text-sm text-destructive">{t('reports.export.error')}</p>}
      {result && <p className="text-sm text-muted-foreground">{t('reports.export.done', { count: result.count })}</p>}
    </section>
  )
}
