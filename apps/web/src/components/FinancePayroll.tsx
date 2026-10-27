import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import {
  AFGHAN_MONTHLY_TAX,
  payrollWorkspaceSchema,
  payrollRunSchema,
  formatMoney,
  moneyDecimal,
  gregorianToShamsi,
  shamsiToGregorian,
  utcToShamsi,
  type FinanceWorkspace,
} from '@redmars/shared'
import { apiGet } from '@/lib/api'
import { useAuth } from '@/auth/authContext'
import { download } from '@/lib/financeCsv'
import { Form } from './FinanceRevenue'
import { FinanceDateInput } from './FinanceDateInput'
import { Button } from './ui/button'
import { Card } from './ui/card'

type Perform = (
  path: string,
  input: Record<string, unknown>,
) => Promise<boolean>
type Workspace = z.infer<typeof payrollWorkspaceSchema>
type Run = z.infer<typeof payrollRunSchema>
type Props = { data: FinanceWorkspace; perform: Perform; busy: boolean }
const cls =
  'h-9 rounded-md border border-input bg-background px-2 text-sm w-full'
const today = () => shamsiToGregorian(utcToShamsi(new Date()))
const opt = (value: string, label: string) => ({ value, label })
const zeroFields = [
  'absenceDays',
  'overtimeHours',
  'bonus',
  'otherDeduction',
] as const

export function FinancePayroll(props: Props) {
  const { roles } = useAuth()
  const [section, setSection] = useState('runs'),
    [selected, setSelected] = useState(
      () => new URLSearchParams(window.location.search).get('payrollRun') ?? '',
    )
  const q = useQuery({
    queryKey: ['finance', 'payroll'],
    queryFn: () => apiGet('/finance/payroll', payrollWorkspaceSchema),
  })
  const canWrite = roles.some((r) =>
    ['admin', 'finance_manager', 'accountant', 'payroll_officer'].includes(r),
  )
  const configure = roles.some((r) => ['admin', 'finance_manager'].includes(r))
  if (!q.data)
    return (
      <p role={q.isError ? 'alert' : undefined}>
        {q.isError
          ? 'Payroll could not load. Check your payroll access.'
          : 'Loading payroll…'}
      </p>
    )
  const w = q.data
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Payroll / معاشات</h2>
        <p className="text-sm text-muted-foreground">
          Monthly Shamsi payroll · AFN · Calculate → review → approve → post
          accrual → pay
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {['runs', 'employees', 'loans', 'settings'].map((s) => (
          <Button
            key={s}
            variant={section === s ? 'default' : 'outline'}
            onClick={() => setSection(s)}
          >
            {s === 'runs'
              ? 'Payroll runs'
              : s === 'employees'
                ? 'Employees'
                : s === 'loans'
                  ? 'Loans & advances'
                  : 'Tax settings'}
          </Button>
        ))}
      </div>
      {!w.config && (
        <p role="alert">
          A finance manager must save the tax settings before the first payroll
          calculation.
        </p>
      )}
      {section === 'employees' && (
        <Employees {...props} w={w} canWrite={canWrite} />
      )}
      {section === 'settings' && (
        <TaxSettings {...props} w={w} canConfigure={configure} />
      )}
      {section === 'loans' && <Loans {...props} w={w} canWrite={canWrite} />}
      {section === 'runs' && (
        <>
          {canWrite && (
            <Calculate {...props} w={w} onCalculated={() => setSelected('')} />
          )}
          <Card className="p-4 overflow-auto">
            <h3 className="font-semibold mb-3">Payroll history</h3>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {[
                    'Period',
                    'Accrual date',
                    'State',
                    'Gross AFN',
                    'Net AFN',
                    '',
                  ].map((h, i) => (
                    <th key={i} className="p-2 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {w.runs.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{r.period}</td>
                    <td>{gregorianToShamsi(r.date)}</td>
                    <td>{r.status}</td>
                    <td>{formatMoney(r.gross)}</td>
                    <td>{formatMoney(r.net)}</td>
                    <td>
                      <Button
                        variant="outline"
                        onClick={() => setSelected(r.id)}
                      >
                        Open run
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!w.runs.length && <p className="py-4">No payroll runs yet.</p>}
          </Card>
          {selected && (
            <RunDetail
              key={selected}
              {...props}
              id={selected}
              canWrite={canWrite}
              canApprove={configure}
            />
          )}
        </>
      )}
    </div>
  )
}
function Employees({
  w,
  canWrite,
  ...props
}: Props & { w: Workspace; canWrite: boolean }) {
  const [edit, setEdit] = useState('')
  const e = w.employees.find((x) => x.id === edit)
  return (
    <div className="space-y-4">
      {canWrite && (
        <Form
          key={edit}
          title={e ? 'Edit employee' : 'Add payroll employee'}
          busy={props.busy}
          submit="Save employee"
          fields={[
            { name: 'code', label: 'Employee number', value: e?.code },
            { name: 'name', label: 'English name', value: e?.name },
            {
              name: 'nameDari',
              label: 'نام دری / Dari name',
              optional: true,
              value: e?.nameDari,
            },
            {
              name: 'basic',
              label: 'Monthly basic salary (AFN)',
              value: e?.basic,
            },
            {
              name: 'allowance',
              label: 'Monthly taxable allowances (AFN)',
              value: e?.allowance ?? '0',
            },
            {
              name: 'overtimeRate',
              label: 'Overtime per hour (AFN)',
              value: e?.overtimeRate ?? '0',
            },
            {
              name: 'costCentreId',
              label: 'Department / cost centre',
              value: e?.costCentreId,
              options: w.centres.map((c) => opt(c.id, c.code + ' · ' + c.name)),
            },
            {
              name: 'startsOn',
              label: 'Employment start',
              type: 'date',
              value: e?.startsOn ?? today(),
            },
            {
              name: 'endsOn',
              label: 'Employment end (inclusive)',
              type: 'date',
              value: e?.endsOn ?? '',
              optional: true,
            },
            {
              name: 'active',
              label: 'Status',
              value: e?.isActive === false ? 'no' : 'yes',
              options: [opt('yes', 'Active'), opt('no', 'Inactive')],
            },
          ]}
          onSubmit={async (v) => {
            const ok = await props.perform(
              'payroll/employees' + (e ? '/' + e.id : ''),
              {
                ...v,
                endsOn: v.endsOn || null,
                isActive: v.active === 'yes',
                currency: 'AFN',
              },
            )
            if (ok) setEdit('')
            return ok
          }}
        />
      )}
      {!w.centres.length && (
        <p>
          Create a department cost centre in Suppliers & payables → Expense
          mappings first.
        </p>
      )}
      {e && (
        <Button variant="outline" onClick={() => setEdit('')}>
          Cancel edit
        </Button>
      )}
      <Card className="p-4 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {[
                'Number',
                'Employee',
                'Basic',
                'Allowance',
                'Currency',
                'Status',
                '',
              ].map((h, i) => (
                <th key={i} className="p-2 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {w.employees.map((e) => (
              <tr className="border-t" key={e.id}>
                <td className="p-2">{e.code}</td>
                <td>
                  {e.name}
                  <span className="block" lang="prs" dir="rtl">
                    {e.nameDari}
                  </span>
                </td>
                <td>{formatMoney(e.basic)}</td>
                <td>{formatMoney(e.allowance)}</td>
                <td>{e.currency}</td>
                <td>{e.isActive ? 'Active' : 'Inactive'}</td>
                <td>
                  {canWrite && (
                    <Button variant="outline" onClick={() => setEdit(e.id)}>
                      Edit
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
function TaxSettings({
  w,
  canConfigure,
  ...p
}: Props & { w: Workspace; canConfigure: boolean }) {
  const [bands, setBands] = useState(w.config?.taxBands ?? AFGHAN_MONTHLY_TAX)
  const [name, setName] = useState(
    w.config?.taxName ?? 'Afghan monthly wage withholding · Article 4',
  )
  return (
    <Card className="p-5 space-y-4">
      <h3 className="font-semibold">Monthly wage withholding</h3>
      <p className="text-sm">
        The Afghan preset uses marginal rates of 0%, 2%, 10% and 20%. Tax is
        calculated on gross pay after absence and before loan or other
        deductions. Saved runs retain their tax schedule.{' '}
        <a
          className="underline"
          href="https://www.acbar.org/upload/145984549848.pdf"
          target="_blank"
          rel="noreferrer"
        >
          Ministry of Finance guide
        </a>
      </p>
      <label className="block">
        Schedule name
        <input
          className={cls}
          disabled={!canConfigure}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {bands.map((b, i) => (
        <div className="grid grid-cols-2 gap-3" key={i}>
          <label>
            Income above (AFN)
            <input
              className={cls}
              disabled={!canConfigure}
              value={b.from}
              onChange={(e) =>
                setBands(
                  bands.map((x, j) =>
                    i === j ? { ...x, from: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <label>
            Marginal rate (%)
            <input
              className={cls}
              disabled={!canConfigure}
              value={b.rate}
              onChange={(e) =>
                setBands(
                  bands.map((x, j) =>
                    i === j ? { ...x, rate: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
        </div>
      ))}
      {canConfigure && (
        <div className="flex gap-2">
          <Button
            disabled={p.busy}
            onClick={() =>
              void p.perform('payroll/config', {
                taxName: name,
                taxBands: bands,
              })
            }
          >
            Save tax schedule
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setBands(AFGHAN_MONTHLY_TAX)
              setName('Afghan monthly wage withholding · Article 4')
            }}
          >
            Load Afghan preset
          </Button>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Monthly basic pay and allowances are prorated by calendar days for
        joiners/leavers. Absence reduces basic pay using this period’s calendar
        days. Overtime uses the employee’s configured hourly rate. Amounts round
        half up to 0.01 AFN.
      </p>
    </Card>
  )
}
function Loans({
  w,
  canWrite,
  ...p
}: Props & { w: Workspace; canWrite: boolean }) {
  return (
    <div className="space-y-4">
      {canWrite && (
        <Form
          title="Issue loan or salary advance"
          submit="Create issue journal for review"
          busy={p.busy}
          fields={[
            {
              name: 'employeeId',
              label: 'Employee',
              options: w.employees
                .filter((e) => e.isActive)
                .map((e) => opt(e.id, e.code + ' · ' + e.name)),
            },
            {
              name: 'kind',
              label: 'Type',
              value: 'advance',
              options: [
                opt('advance', 'Salary advance'),
                opt('loan', 'Staff loan'),
              ],
            },
            { name: 'reference', label: 'Reference' },
            { name: 'amount', label: 'Principal (AFN)' },
            { name: 'installment', label: 'Monthly deduction (AFN)' },
            { name: 'date', label: 'Issue date', type: 'date', value: today() },
            {
              name: 'firstPeriodId',
              label: 'First deduction period',
              options: p.data.periods
                .filter((x) => !x.closedAt)
                .map((x) => opt(x.id, x.label)),
            },
            {
              name: 'cashAccountId',
              label: 'Cash / bank account',
              options: p.data.accounts
                .filter((a) => a.isCash && a.isActive)
                .map((a) => opt(a.id, a.name)),
            },
          ]}
          onSubmit={(v) => p.perform('payroll/loans', v)}
        />
      )}
      <p className="text-sm">
        Post the issue journal in Journals before calculating payroll. Approved
        payroll reserves installments; posted payroll reduces the loan balance.
      </p>
      <Card className="p-4 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {[
                'Employee / reference',
                'Principal',
                'Installment',
                'Repaid',
                'Pending',
                'Outstanding',
                'First period',
                'Journal',
              ].map((h) => (
                <th className="text-left p-2" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {w.loans.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="p-2">
                  {l.employeeName}
                  <br />
                  {l.reference}
                </td>
                {[
                  l.amount,
                  l.installment,
                  l.deducted,
                  l.reserved,
                  l.outstanding,
                ].map((v, i) => (
                  <td key={i}>{formatMoney(v)}</td>
                ))}
                <td>{l.firstPeriod}</td>
                <td>
                  {l.journal.reversed ? 'Reversed' : l.journal.status}
                  <br />
                  <code className="text-xs">{l.journal.id.slice(0, 8)}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
function Calculate({
  w,
  onCalculated,
  ...p
}: Props & { w: Workspace; onCalculated: () => void }) {
  const [periodId, setPeriod] = useState(''),
    [on, setOn] = useState(today()),
    [adjustments, setAdjustments] = useState<
      Record<string, Record<string, string>>
    >({})
  const period = p.data.periods.find((x) => x.id === periodId)
  const existing = w.runs.find((r) => r.period === period?.label)
  const saved = useQuery({
    queryKey: ['finance', 'payroll', 'run', existing?.id],
    queryFn: () =>
      apiGet('/finance/payroll/runs/' + existing!.id, payrollRunSchema),
    enabled: !!existing,
  })
  const eligible = w.employees.filter(
    (e) =>
      e.isActive &&
      (!period || e.startsOn <= period.endsOn) &&
      (!e.endsOn || !period || e.endsOn >= period.startsOn),
  )
  return (
    <Card className="p-5 space-y-4">
      <h3 className="font-semibold">Calculate / recalculate monthly payroll</h3>
      <div className="grid md:grid-cols-2 gap-3">
        <label>
          Shamsi period
          <select
            className={cls}
            value={periodId}
            onChange={(e) => {
              setPeriod(e.target.value)
              setAdjustments({})
              const x = p.data.periods.find((x) => x.id === e.target.value)
              if (x) setOn(x.endsOn)
            }}
          >
            <option value="">Select…</option>
            {p.data.periods
              .filter((x) => !x.closedAt)
              .map((x) => (
                <option value={x.id} key={x.id}>
                  {x.label}
                </option>
              ))}
          </select>
        </label>
        <label>
          Accrual date (Shamsi)
          <FinanceDateInput value={on} onChange={setOn} />
        </label>
      </div>
      <p className="text-sm text-muted-foreground">
        Enter this month’s attendance totals and adjustments. Blank amounts mean
        zero. Recalculate replaces the unapproved run and returns it to review.
      </p>
      {saved.data && (
        <Button
          variant="outline"
          disabled={p.busy}
          onClick={() => {
            const r = saved.data!
            setOn(r.date)
            setAdjustments(
              Object.fromEntries(
                r.items.map((i) => [
                  i.employeeId,
                  {
                    absenceDays: i.absenceDays,
                    overtimeHours: i.overtimeHours,
                    bonus: i.bonus,
                    otherDeduction: i.otherDeduction,
                    note: i.note,
                  },
                ]),
              ),
            )
          }}
        >
          Load saved attendance and adjustments
        </Button>
      )}
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {[
                'Employee',
                'Absence days',
                'Overtime hours',
                'Bonus AFN',
                'Other deduction AFN',
                'Attendance / deduction note',
              ].map((h) => (
                <th key={h} className="p-2 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {eligible.map((e) => (
              <tr key={e.id}>
                <td className="min-w-40">
                  {e.code} · {e.name}
                </td>
                {[...zeroFields, 'note'].map((f) => (
                  <td className="p-1" key={f}>
                    <input
                      aria-label={e.name + ' ' + f}
                      className={cls + ' min-w-24'}
                      value={
                        adjustments[e.id]?.[f] ??
                        saved.data?.items.find((i) => i.employeeId === e.id)?.[
                          f as
                            | 'absenceDays'
                            | 'overtimeHours'
                            | 'bonus'
                            | 'otherDeduction'
                            | 'note'
                        ] ??
                        ''
                      }
                      placeholder={f === 'note' ? 'Reference' : '0'}
                      onChange={(v) =>
                        setAdjustments({
                          ...adjustments,
                          [e.id]: { ...adjustments[e.id], [f]: v.target.value },
                        })
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        disabled={p.busy || !periodId || !w.config}
        onClick={() =>
          void p
            .perform('payroll/calculate', {
              periodId,
              date: on,
              adjustments: eligible.map((e) => ({
                ...Object.fromEntries(
                  zeroFields.map((f) => [
                    f,
                    (adjustments[e.id]?.[f] ??
                      saved.data?.items.find((i) => i.employeeId === e.id)?.[
                        f
                      ]) ||
                      '0',
                  ]),
                ),
                employeeId: e.id,
                note:
                  adjustments[e.id]?.note ??
                  saved.data?.items.find((i) => i.employeeId === e.id)?.note ??
                  '',
              })),
            })
            .then((ok) => {
              if (ok) onCalculated()
            })
        }
      >
        Calculate payroll
      </Button>
    </Card>
  )
}
function RunDetail({
  id,
  canWrite,
  canApprove,
  ...p
}: Props & { id: string; canWrite: boolean; canApprove: boolean }) {
  const { roles, user } = useAuth()
  const [slip, setSlip] = useState(''),
    [language, setLanguage] = useState<'en' | 'prs'>('en')
  const q = useQuery({
    queryKey: ['finance', 'payroll', 'run', id],
    queryFn: () => apiGet('/finance/payroll/runs/' + id, payrollRunSchema),
  })
  if (!q.data)
    return <p>{q.isError ? 'Could not load payroll run.' : 'Loading run…'}</p>
  const r = q.data,
    selected = r.items.find((i) => i.id === slip)
  const total = (
    key: 'gross' | 'tax' | 'loanDeduction' | 'otherDeduction' | 'net' | 'paid',
  ) => r.items.reduce((sum, i) => sum.add(i[key]), moneyDecimal('0')).toFixed(2)
  const exportRun = () =>
    download('payroll-' + r.period + '.csv', [
      [
        'Period',
        'State',
        'Code',
        'Employee',
        'Department',
        'Basic',
        'Allowance',
        'Absence',
        'Overtime',
        'Bonus',
        'Gross',
        'Tax',
        'Loan',
        'Other deductions',
        'Net',
        'Paid',
        'Pending',
      ],
      ...r.items.map((i) => [
        r.period,
        r.status,
        i.code,
        i.name,
        i.centreName,
        i.basic,
        i.allowance,
        i.absence,
        i.overtime,
        i.bonus,
        i.gross,
        i.tax,
        i.loanDeduction,
        i.otherDeduction,
        i.net,
        i.paid,
        i.reserved,
      ]),
    ])
  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <h3 className="text-lg font-semibold">
          Payroll {r.period} · {r.status}
        </h3>
        <p className="text-sm">
          Tax schedule: {r.taxName}.{' '}
          {r.journal
            ? `Accrual journal: ${r.journal.status} (${r.journal.id.slice(0, 8)}).`
            : 'Approval will create a draft accrual journal.'}
        </p>
        <div className="flex flex-wrap gap-3">
          {(
            [
              'gross',
              'tax',
              'loanDeduction',
              'otherDeduction',
              'net',
              'paid',
            ] as const
          ).map((k) => (
            <div className="rounded border p-3" key={k}>
              <span className="block text-xs">
                {
                  {
                    gross: 'Gross',
                    tax: 'Tax',
                    loanDeduction: 'Loan repayment',
                    otherDeduction: 'Other deductions',
                    net: 'Net',
                    paid: 'Paid',
                  }[k]
                }
              </span>
              <strong>{formatMoney(total(k))} AFN</strong>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && r.status === 'calculated' && (
            <Button
              disabled={p.busy}
              onClick={() =>
                void p.perform(`payroll/runs/${id}/review`, {
                  version: r.version,
                })
              }
            >
              Mark reviewed
            </Button>
          )}
          {canApprove && r.status === 'reviewed' && (
            <Button
              disabled={p.busy || r.createdBy === user?.id}
              onClick={() =>
                void p.perform(`payroll/runs/${id}/approve`, {
                  version: r.version,
                })
              }
            >
              Approve payroll
            </Button>
          )}
          <Button variant="outline" onClick={exportRun}>
            Export payroll CSV
          </Button>
        </div>
        {canApprove && r.status === 'reviewed' && r.createdBy === user?.id && (
          <p className="text-sm">
            A different administrator or finance manager must approve this run.
          </p>
        )}
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {[
                  'Employee',
                  'Department',
                  'Gross',
                  'Tax',
                  'Loan',
                  'Other',
                  'Net',
                  'Paid / pending',
                  '',
                ].map((h, i) => (
                  <th className="p-2 text-left" key={i}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.items.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="p-2">
                    {i.code} · {i.name}
                  </td>
                  <td>{i.centreName}</td>
                  {[
                    i.gross,
                    i.tax,
                    i.loanDeduction,
                    i.otherDeduction,
                    i.net,
                  ].map((v, n) => (
                    <td key={n}>{formatMoney(v)}</td>
                  ))}
                  <td>
                    {formatMoney(i.paid)} / {formatMoney(i.reserved)}
                  </td>
                  <td>
                    <Button variant="outline" onClick={() => setSlip(i.id)}>
                      Payslip
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h4 className="font-semibold">Department allocation</h4>
        <div className="flex flex-wrap gap-4">
          {[...new Set(r.items.map((i) => i.costCentreId))].map((c) => (
            <p key={c}>
              {r.items.find((i) => i.costCentreId === c)?.centreName}:{' '}
              <strong>
                {formatMoney(
                  r.items
                    .filter((i) => i.costCentreId === c)
                    .reduce((n, i) => n.add(i.gross), moneyDecimal('0')),
                )}{' '}
                AFN
              </strong>
            </p>
          ))}
        </div>
      </Card>
      {r.status === 'approved' &&
        r.journal?.status === 'posted' &&
        roles.some((x) =>
          ['admin', 'finance_manager', 'accountant'].includes(x),
        ) && (
          <Form
            title="Pay salary"
            busy={p.busy}
            submit="Create salary payment for review"
            fields={[
              {
                name: 'itemId',
                label: 'Employee',
                options: r.items
                  .filter((i) => moneyDecimal(i.available).gt('0'))
                  .map((i) =>
                    opt(
                      i.id,
                      `${i.name} · available ${formatMoney(i.available)} AFN`,
                    ),
                  ),
              },
              { name: 'amount', label: 'Amount AFN' },
              { name: 'reference', label: 'Payment reference' },
              { name: 'date', label: 'Date', type: 'date', value: today() },
              {
                name: 'cashAccountId',
                label: 'Cash / bank',
                options: p.data.accounts
                  .filter((a) => a.isCash && a.isActive)
                  .map((a) => opt(a.id, a.name)),
              },
            ]}
            onSubmit={(v) => p.perform('payroll/payments', v)}
          />
        )}
      {r.payments.length > 0 && (
        <Card className="p-4">
          <h4 className="font-semibold">Salary payments</h4>
          {r.payments.map((x) => (
            <p className="py-1 text-sm" key={x.id}>
              {r.items.find((i) => i.id === x.itemId)?.name} · {x.reference} ·{' '}
              {gregorianToShamsi(x.date)} · {formatMoney(x.amount)} AFN ·{' '}
              {x.journal.reversed ? 'reversed' : x.journal.status} · journal{' '}
              {x.journal.id.slice(0, 8)}
            </p>
          ))}
        </Card>
      )}
      {selected && (
        <>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setLanguage(language === 'en' ? 'prs' : 'en')}
            >
              {language === 'en' ? 'دری' : 'English'}
            </Button>
            <Button onClick={() => window.print()}>
              Print / save payslip PDF
            </Button>
          </div>
          <Payslip run={r} item={selected} language={language} />
        </>
      )}
    </div>
  )
}
function Payslip({
  run,
  item: i,
  language,
}: {
  run: Run
  item: Run['items'][number]
  language: 'en' | 'prs'
}) {
  const dari = language === 'prs'
  const rows = [
    ['Basic salary', 'معاش اساسی', i.basic],
    ['Allowances', 'امتیازات', i.allowance],
    ['Overtime', 'اضافه کاری', i.overtime],
    ['Bonus', 'پاداش', i.bonus],
    ['Absence deduction', 'کسر غیرحاضری', i.absence],
    ['Gross after absence', 'معاش ناخالص پس از کسر غیرحاضری', i.gross],
    ['Income tax', 'مالیه بر عایدات', i.tax],
    ['Loan / advance repayment', 'بازپرداخت قرضه / مساعده', i.loanDeduction],
    ['Other deductions', 'سایر کسورات', i.otherDeduction],
    ['Net salary', 'معاش خالص', i.net],
    ['Paid', 'پرداخت شده', i.paid],
  ]
  const content = (
    <>
      <h2 className="text-2xl font-bold">
        {dari ? 'فیش معاش' : 'Salary payslip'} · {run.period}
      </h2>
      <p className="font-semibold">{run.facilityName}</p>
      <p>
        {dari ? i.nameDari || i.name : i.name} · {i.code} · {i.centreName}
      </p>
      <p>
        {dari ? 'تاریخ' : 'Date'}: {gregorianToShamsi(run.date)} · AFN
      </p>
      <p>
        {dari ? 'وضعیت' : 'Status'}:{' '}
        {run.status === 'approved'
          ? dari
            ? 'تایید شده'
            : 'Approved'
          : dari
            ? 'پیش نویس'
            : 'DRAFT'}
      </p>
      <table className="w-full">
        <tbody>
          {rows.map(([en, prs, v]) => (
            <tr className="border-b" key={en}>
              <td className="py-2">{dari ? prs : en}</td>
              <td className="text-end" dir="ltr">
                {formatMoney(v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        {dari ? 'روزهای غیرحاضری' : 'Absence days'}: {i.absenceDays} ·{' '}
        {dari ? 'ساعات اضافه کاری' : 'Overtime hours'}: {i.overtimeHours}
      </p>
      {i.note && <p>{i.note}</p>}
      <p>
        {dari ? 'امضای کارمند' : 'Employee signature'}: ____________________
      </p>
    </>
  )
  return (
    <>
      <section
        id="payroll-payslip"
        dir={dari ? 'rtl' : 'ltr'}
        lang={language}
        className="rounded border bg-white text-black p-8 space-y-4"
      >
        {content}
      </section>
      {createPortal(
        <section
          id="payroll-print-root"
          dir={dari ? 'rtl' : 'ltr'}
          lang={language}
          className="hidden bg-white text-black p-8 space-y-4"
        >
          <style>{`@media print { body > *:not(#payroll-print-root) { display: none !important; } #payroll-print-root { display: block !important; margin: 0; } @page { size: A4; margin: 12mm; } }`}</style>
          {content}
        </section>,
        document.body,
      )}
    </>
  )
}
