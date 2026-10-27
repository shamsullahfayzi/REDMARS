import { useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import {
  financeRevenueWorkspaceSchema,
  financeArSchema,
  financeSourceSchema,
  payableSourceSchema,
  payrollSourceSchema,
  financePanelStatementSchema,
  revenueCategories,
  formatMoney,
  gregorianToShamsi,
  shamsiToGregorian,
  utcToShamsi,
  type FinanceWorkspace,
} from '@redmars/shared'
import { apiGet, apiPost, ApiError } from '@/lib/api'
import { download } from '@/lib/financeCsv'
import { useAuth } from '@/auth/authContext'
import { FinanceDateInput } from './FinanceDateInput'
import { Button } from './ui/button'
import { Card } from './ui/card'

const inputClass =
  'h-9 rounded-md border border-input bg-background px-2 text-sm w-full'
const today = () => shamsiToGregorian(utcToShamsi(new Date()))
const message = (e: unknown) =>
  e instanceof ApiError &&
  e.body &&
  typeof e.body === 'object' &&
  'message' in e.body
    ? String(e.body.message)
    : 'Could not complete the request.'
type Perform = (
  path: string,
  input: Record<string, unknown>,
) => Promise<boolean>
type Field = {
  name: string
  label: string
  type?: string
  value?: string
  options?: Array<{ value: string; label: string }>
  optional?: boolean
}
export function Form({
  title,
  fields,
  submit,
  onSubmit,
  busy,
}: {
  title: string
  fields: Field[]
  submit: string
  onSubmit: (v: Record<string, string>) => Promise<boolean>
  busy: boolean
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  return (
    <Card className="p-5">
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          void onSubmit(
            Object.fromEntries(
              fields.map((f) => [f.name, values[f.name] ?? f.value ?? '']),
            ),
          ).then((ok) => {
            if (ok) setValues({})
          })
        }}
      >
        <h3 className="font-semibold">{title}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {fields.map((f) => (
            <label key={f.name} className="grid gap-1 text-sm">
              {f.label}
              {f.type === 'date' ? ' (Shamsi)' : ''}
              {f.options ? (
                <select
                  className={inputClass}
                  required={!f.optional}
                  value={values[f.name] ?? f.value ?? ''}
                  onChange={(e) =>
                    setValues({ ...values, [f.name]: e.target.value })
                  }
                >
                  <option value="">Select…</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === 'date' ? (
                <FinanceDateInput
                  value={values[f.name] ?? f.value ?? ''}
                  required={!f.optional}
                  onChange={(v) => setValues({ ...values, [f.name]: v })}
                />
              ) : (
                <input
                  className={inputClass}
                  type={f.type ?? 'text'}
                  step={f.type === 'number' ? '0.01' : undefined}
                  required={!f.optional}
                  value={values[f.name] ?? f.value ?? ''}
                  onChange={(e) =>
                    setValues({ ...values, [f.name]: e.target.value })
                  }
                />
              )}
            </label>
          ))}
        </div>
        <Button disabled={busy} type="submit">
          {submit}
        </Button>
      </form>
    </Card>
  )
}
export function Grid({
  headers,
  rows,
}: {
  headers: string[]
  rows: React.ReactNode[][]
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            {headers.map((h) => (
              <th className="p-3 text-start" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td className="p-3 align-top" key={j}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="p-4 text-muted-foreground">
          No records for this selection.
        </p>
      )}
    </div>
  )
}

export function FinanceSource({ journalId }: { journalId: string }) {
  const { roles } = useAuth()
  const source = useQuery({
    queryKey: ['finance', 'source', journalId],
    queryFn: () =>
      apiGet(`/finance/journals/${journalId}/source`, financeSourceSchema),
  })
  const payable = useQuery({
    queryKey: ['finance', 'payable-source', journalId],
    queryFn: () =>
      apiGet(
        `/finance/payables/journals/${journalId}/source`,
        payableSourceSchema,
      ),
  })
  const s = source.data
  const asset = useQuery({
    queryKey: ['finance', 'asset-source', journalId],
    queryFn: () => apiGet(`/finance/assets/journals/${journalId}/source`, z.object({assetId:z.string(),code:z.string(),name:z.string(),kind:z.string()}).nullable()),
    enabled: !!s?.sourceType.startsWith('asset_'),
  })
  const payroll = useQuery({
    queryKey: ['finance','payroll-source',journalId],
    queryFn: () => apiGet(`/finance/payroll/journals/${journalId}/source`,payrollSourceSchema),
    enabled: !!s?.sourceType.startsWith('payroll_'),
  })
  return (
    <Card className="space-y-3 p-5">
      <h3 className="font-semibold">Source document</h3>
      {asset.data && <a className="underline" href={'/finance?asset='+asset.data.assetId}>Open asset {asset.data.code} · {asset.data.name} · {asset.data.kind}</a>}
      {payroll.data && <p>{payroll.data.employee} {payroll.data.reference} {payroll.data.runId && <a className="underline" href={'/finance?payrollRun='+payroll.data.runId}>Open payroll {payroll.data.period}</a>}</p>}
      {payable.isError && (
        <p role="alert">Could not load supplier source details.</p>
      )}
      {payable.data?.bills.map((b) => (
        <div className="space-y-2 rounded border p-3" key={b.id}>
          <p>
            {b.supplierName} · {b.reference} · {b.kind}
          </p>
          <p>
            Bill {formatMoney(b.amount)} AFN · Due {gregorianToShamsi(b.dueOn)}
            {b.allocation &&
              ` · Payment allocation ${formatMoney(b.allocation)} AFN`}
          </p>
          {b.procurement && (
            <>
              <p>
                PO {b.procurement.poReference} → GRN{' '}
                {b.procurement.grnReference} → Bill {b.reference}
              </p>
              <p>
                {b.procurement.sourceSystem} · Received{' '}
                {gregorianToShamsi(b.procurement.receivedOn)}
              </p>
              <details>
                <summary>Original received-goods lines</summary>
                <Grid
                  headers={[
                    'Description',
                    'Quantity',
                    'Unit cost AFN',
                    'Category',
                    'Amount AFN',
                  ]}
                  rows={b.procurement.lines.map((l) => [
                    l.description,
                    l.quantity,
                    formatMoney(l.unitCost),
                    l.category,
                    formatMoney(l.amount),
                  ])}
                />
              </details>
            </>
          )}
        </div>
      ))}
      {source.isError && (
        <p role="alert">Could not load the source document.</p>
      )}
      {source.isPending && <p>Loading source…</p>}
      {s && (
        <>
          <p className="text-sm">
            {s.sourceType.replaceAll('_', ' ')} · {s.sourceId ?? 'Manual entry'}
          </p>
          {s.invoice && (
            <>
              <p>
                {s.invoice.invoiceNo} · {gregorianToShamsi(s.invoice.date)} ·{' '}
                {s.invoice.status}
              </p>
              <p>
                {s.invoice.patientName} · MRN {s.invoice.mrn}
              </p>
              <p>
                Visit: {s.invoice.visitNo ?? 'No visit'}{' '}
                {s.invoice.visitId &&
                  roles.some((r) =>
                    ['admin', 'doctor', 'nurse'].includes(r),
                  ) && (
                    <a
                      className="underline"
                      href={`/consult/${s.invoice.visitId}`}
                    >
                      Open visit
                    </a>
                  )}
              </p>
              <p>
                Panel: {s.invoice.panelName ?? 'None'} · Current bill{' '}
                {formatMoney(s.invoice.total)} · Settled{' '}
                {formatMoney(s.invoice.paidAmount)} AFN
              </p>
              <Grid
                headers={['Current bill item', 'AFN']}
                rows={s.invoice.items.map((i) => [
                  i.description,
                  formatMoney(i.total),
                ])}
              />
              {s.payment && (
                <p>
                  Receipt {s.payment.receiptNo ?? '—'} · {s.payment.method} ·{' '}
                  {formatMoney(s.payment.amount)} AFN
                </p>
              )}
              <details>
                <summary className="cursor-pointer">
                  Accounting history for this invoice
                </summary>
                <Grid
                  headers={['Date', 'Journal', 'Status', 'Purpose']}
                  rows={s.history.map((h) => [
                    gregorianToShamsi(h.date),
                    h.number ?? 'Draft',
                    h.status,
                    h.memo,
                  ])}
                />
              </details>
            </>
          )}
        </>
      )}
    </Card>
  )
}

export function FinanceRevenue({
  data,
  perform,
  busy,
}: {
  data: FinanceWorkspace
  perform: Perform
  busy: boolean
}) {
  const { roles, user } = useAuth()
  const canWrite = roles.some((r) =>
    ['admin', 'accountant', 'finance_manager'].includes(r),
  )
  const canConfigure = roles.some((r) =>
    ['admin', 'finance_manager'].includes(r),
  )
  const workspace = useQuery({
    queryKey: ['finance', 'revenue'],
    queryFn: () => apiGet('/finance/revenue', financeRevenueWorkspaceSchema),
  })
  const [section, setSection] = useState('receivables'),
    [kind, setKind] = useState<'patient' | 'panel'>('patient'),
    [asOf, setAsOf] = useState(today()),
    [panel, setPanel] = useState(''),
    [source, setSource] = useState(''),
    [error, setError] = useState('')
  const [statementFrom, setStatementFrom] = useState(
    data.settings?.cutoverDate ?? today(),
  )
  const ar = useQuery({
    queryKey: ['finance', 'ar', kind, asOf, panel],
    queryFn: () =>
      apiGet(
        `/finance/receivables/${kind}?asOf=${asOf}${kind === 'panel' && panel ? '&panelId=' + panel : ''}`,
        financeArSchema,
      ),
    enabled: !!asOf,
  })
  const statement = useQuery({
    queryKey: ['finance', 'panel-statement', panel, statementFrom, asOf],
    queryFn: () =>
      apiGet(
        `/finance/panels/${panel}/statement?from=${statementFrom}&to=${asOf}`,
        financePanelStatementSchema,
      ),
    enabled:
      !!panel && !!statementFrom && statementFrom <= asOf && kind === 'panel',
  })
  const [preview, setPreview] = useState<{
    expected: string
    difference: string
    paymentCount: number
  } | null>(null)
  const draftTill = useRef<Record<string, unknown> | null>(null)
  const [tillBusy, setTillBusy] = useState(false)
  const r = workspace.data
  if (!r)
    return (
      <p role={workspace.isError ? 'alert' : undefined}>
        {workspace.isError
          ? 'Could not load revenue and receivables.'
          : 'Loading revenue…'}
      </p>
    )
  const accounts = data.accounts.filter((a) => a.isPosting && a.isActive)
  const options = accounts.map((a) => ({
    value: a.id,
    label: `${a.code} · ${a.name}`,
  }))
  const cash = accounts
    .filter((a) => a.isCash)
    .map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))
  const panels = r.panels.map((p) => ({
    value: p.id,
    label: `${p.code} · ${p.name}`,
  }))
  const activeAr = ar.data?.rows ?? []
  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-2">
        {[
          ['receivables', 'Receivables & panels'],
          ['mappings', 'Revenue mapping'],
          ['tills', 'Till close & deposits'],
        ].map(([value, label]) => (
          <Button
            variant={section === value ? 'default' : 'outline'}
            key={value}
            onClick={() => setSection(value)}
          >
            {label}
          </Button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {section === 'mappings' && (
        <>
          <p>
            Invoices use these accounts when their drafts are generated. A
            service override takes priority over its category. Discounts and
            credits use debit-normal revenue accounts.
          </p>
          <Grid
            headers={['Category / service', 'Income account']}
            rows={r.mappings.map((m) => [
              m.category.startsWith('service:')
                ? (r.services.find((s) => s.id === m.category.slice(8))?.name ??
                  m.category)
                : m.category,
              accounts.find((a) => a.id === m.accountId)?.name ?? m.accountId,
            ])}
          />
          {canConfigure && (
            <Form
              title="Set revenue mapping"
              fields={[
                {
                  name: 'category',
                  label: 'Category or service',
                  options: [
                    ...revenueCategories.map((v) => ({ value: v, label: v })),
                    ...r.services.map((s) => ({
                      value: 'service:' + s.id,
                      label: `Service: ${s.code} · ${s.name}`,
                    })),
                  ],
                },
                {
                  name: 'accountId',
                  label: 'Revenue account',
                  options: options.filter(
                    (o) =>
                      accounts.find((a) => a.id === o.value)?.type ===
                      'revenue',
                  ),
                },
              ]}
              submit="Save mapping"
              busy={busy}
              onSubmit={(v) => perform('revenue/mappings', v)}
            />
          )}
        </>
      )}
      {section === 'receivables' && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <label>
              Receivable type
              <select
                className={inputClass}
                value={kind}
                onChange={(e) => setKind(e.target.value as 'patient' | 'panel')}
              >
                <option value="patient">Patients</option>
                <option value="panel">Panels / institutions</option>
              </select>
            </label>
            <label>
              As of (Shamsi)
              <FinanceDateInput value={asOf} onChange={setAsOf} />
            </label>
            {kind === 'panel' && (
              <label>
                Panel
                <select
                  className={inputClass}
                  value={panel}
                  onChange={(e) => setPanel(e.target.value)}
                >
                  <option value="">All panels</option>
                  {panels.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {ar.isError && <p role="alert">Could not load receivables.</p>}
          {ar.data && (
            <>
              <p>
                Posted receivables: {formatMoney(ar.data.total)} AFN ·{' '}
                {ar.data.pending} drafts awaiting review
              </p>
              <p
                className={
                  ar.data.difference === '0.00'
                    ? 'text-muted-foreground'
                    : 'text-destructive'
                }
              >
                Facility control account: {formatMoney(ar.data.controlBalance)}{' '}
                · Unallocated difference: {formatMoney(ar.data.difference)} AFN
              </p>
              <p className="text-sm text-muted-foreground">
                Age is elapsed Kabul calendar days from the invoice date.
                Negative balances are credits. Opening control balances without
                invoice allocation appear as an unallocated difference.
              </p>
              <Grid
                headers={[
                  'Invoice',
                  'Patient / panel',
                  'Date (Shamsi)',
                  'Age',
                  '0–30',
                  '31–60',
                  '61–90',
                  '90+',
                  'Balance',
                ]}
                rows={activeAr.map((a) => [
                  a.invoiceNo,
                  `${a.patientName} · ${a.panelName ?? a.patientMrn}`,
                  gregorianToShamsi(a.date),
                  `${a.days} days`,
                  formatMoney(a.current),
                  formatMoney(a.days31to60),
                  formatMoney(a.days61to90),
                  formatMoney(a.over90),
                  formatMoney(a.balance),
                ])}
              />
              <Button
                variant="outline"
                onClick={() =>
                  download(`${kind}-receivables-${asOf}.csv`, [
                    [
                      'Invoice',
                      'Patient',
                      'Panel',
                      'Shamsi date',
                      'Days',
                      '0-30',
                      '31-60',
                      '61-90',
                      'Over 90',
                      'AFN balance',
                    ],
                    ...activeAr.map((a) => [
                      a.invoiceNo,
                      a.patientName,
                      a.panelName ?? '',
                      gregorianToShamsi(a.date),
                      String(a.days),
                      a.current,
                      a.days31to60,
                      a.days61to90,
                      a.over90,
                      a.balance,
                    ]),
                  ])
                }
              >
                Export aging for Excel
              </Button>
            </>
          )}
          {canWrite && (
            <div className="grid gap-5 lg:grid-cols-2">
              <Form
                title="Add a panel / institution"
                fields={[
                  { name: 'code', label: 'Code' },
                  { name: 'name', label: 'Name' },
                  {
                    name: 'contactPerson',
                    label: 'Contact person',
                    optional: true,
                  },
                  { name: 'phone', label: 'Phone', optional: true },
                ]}
                submit="Create panel"
                busy={busy}
                onSubmit={(v) => perform('panels', v)}
              />
              <Form
                title="Assign a payer to an unpaid patient invoice"
                fields={[
                  {
                    name: 'invoiceId',
                    label: 'Patient invoice',
                    options:
                      kind === 'patient'
                        ? activeAr.map((a) => ({
                            value: a.invoiceId,
                            label: `${a.invoiceNo} · ${a.patientName}`,
                          }))
                        : [],
                  },
                  { name: 'panelId', label: 'Panel', options: panels },
                ]}
                submit="Assign panel"
                busy={busy}
                onSubmit={(v) =>
                  perform(`invoices/${v.invoiceId}/panel`, {
                    panelId: v.panelId,
                  })
                }
              />
              {kind === 'panel' && (
                <Form
                  title="Record a panel remittance"
                  fields={[
                    {
                      name: 'invoiceId',
                      label: 'Invoice',
                      options: activeAr
                        .filter((a) => a.panelId)
                        .map((a) => ({
                          value: a.invoiceId,
                          label: `${a.invoiceNo} · ${a.panelName} · ${formatMoney(a.balance)} AFN`,
                        })),
                    },
                    {
                      name: 'cashAccountId',
                      label: 'Received into',
                      options: cash,
                    },
                    {
                      name: 'date',
                      label: 'Receipt date',
                      type: 'date',
                      value: today(),
                    },
                    { name: 'amount', label: 'Amount (AFN)', type: 'number' },
                    { name: 'reference', label: 'Bank / remittance reference' },
                  ]}
                  submit="Prepare receipt draft"
                  busy={busy}
                  onSubmit={(v) =>
                    perform('panels/receipts', {
                      ...v,
                      panelId: activeAr.find((a) => a.invoiceId === v.invoiceId)
                        ?.panelId,
                    })
                  }
                />
              )}
            </div>
          )}
          {kind === 'panel' && panel && (
            <Card className="space-y-3 p-5">
              <h3 className="font-semibold">Panel statement</h3>
              <label>
                From (Shamsi)
                <FinanceDateInput
                  value={statementFrom}
                  onChange={setStatementFrom}
                />
              </label>
              {statement.isError && (
                <p role="alert">Could not load statement.</p>
              )}
              {statement.data && (
                <>
                  <p>
                    {statement.data.panelName} · Opening{' '}
                    {formatMoney(statement.data.opening)} · Closing{' '}
                    {formatMoney(statement.data.closing)} AFN
                  </p>
                  <Grid
                    headers={[
                      'Date',
                      'Journal',
                      'Invoice',
                      'Debit',
                      'Credit',
                      'Balance',
                    ]}
                    rows={statement.data.lines.map((l) => [
                      gregorianToShamsi(l.date),
                      <button
                        key={l.journalId}
                        className="underline"
                        onClick={() => setSource(l.journalId)}
                      >
                        {l.number}
                      </button>,
                      l.invoiceNo,
                      formatMoney(l.debit),
                      formatMoney(l.credit),
                      formatMoney(l.balance),
                    ])}
                  />
                  <Button
                    variant="outline"
                    onClick={() =>
                      download(`panel-statement-${asOf}.csv`, [
                        ['Panel', statement.data!.panelName],
                        ['Opening', statement.data!.opening],
                        [
                          'Date',
                          'Journal',
                          'Invoice',
                          'Debit',
                          'Credit',
                          'Balance',
                        ],
                        ...statement.data!.lines.map((l) => [
                          gregorianToShamsi(l.date),
                          l.number,
                          l.invoiceNo,
                          l.debit,
                          l.credit,
                          l.balance,
                        ]),
                        ['Closing', statement.data!.closing],
                      ])
                    }
                  >
                    Export statement for Excel
                  </Button>
                </>
              )}
            </Card>
          )}
        </>
      )}
      {section === 'tills' && (
        <>
          <p>
            Count each cashier’s shift, review any difference, then approve it
            with a second accountant. Deposits are drafts until reviewed and
            posted.
          </p>
          {canWrite && (
            <Form
              title="Count a completed till shift"
              fields={[
                {
                  name: 'userId',
                  label: 'Cashier',
                  options: r.users.map((u) => ({
                    value: u.id,
                    label: u.fullName,
                  })),
                },
                {
                  name: 'origin',
                  label: 'Till',
                  options: ['reception', 'lab', 'pharmacy', 'other'].map(
                    (v) => ({ value: v, label: v }),
                  ),
                },
                { name: 'label', label: 'Shift name' },
                {
                  name: 'date',
                  label: 'Shift date',
                  type: 'date',
                  value: today(),
                },
                {
                  name: 'start',
                  label: 'Start time (Kabul)',
                  type: 'time',
                  value: '08:00',
                },
                {
                  name: 'end',
                  label: 'End time (Kabul)',
                  type: 'time',
                  value: '16:00',
                },
                {
                  name: 'opening',
                  label: 'Opening float (AFN)',
                  type: 'number',
                  value: '0',
                },
                {
                  name: 'counted',
                  label: 'Counted cash (AFN)',
                  type: 'number',
                },
                {
                  name: 'note',
                  label: 'Explanation of any difference',
                  optional: true,
                },
              ]}
              submit="Preview count"
              busy={busy || tillBusy}
              onSubmit={async (v) => {
                setError('')
                setTillBusy(true)
                try {
                  const input = {
                    userId: v.userId,
                    origin: v.origin,
                    label: v.label,
                    startsAt: new Date(
                      `${v.date}T${v.start}:00+04:30`,
                    ).toISOString(),
                    endsAt: new Date(
                      `${v.date}T${v.end}:00+04:30`,
                    ).toISOString(),
                    opening: v.opening,
                    counted: v.counted,
                    note: v.note,
                  }
                  const p = await apiPost(
                    '/finance/tills/preview',
                    { ...input, idempotencyKey: crypto.randomUUID() },
                    z.object({
                      expected: z.string(),
                      difference: z.string(),
                      paymentCount: z.number(),
                    }),
                  )
                  draftTill.current = input
                  setPreview(p)
                } catch (e) {
                  setError(message(e))
                } finally {
                  setTillBusy(false)
                }
                return false
              }}
            />
          )}
          {preview && (
            <Card className="p-5 space-y-3">
              <p>
                {preview.paymentCount} receipts · Expected{' '}
                {formatMoney(preview.expected)} · Over / short{' '}
                {formatMoney(preview.difference)} AFN
              </p>
              <Button
                disabled={busy}
                onClick={() => {
                  if (draftTill.current)
                    void perform('tills/close', draftTill.current).then(
                      (ok) => {
                        if (ok) {
                          setPreview(null)
                          draftTill.current = null
                        }
                      },
                    )
                }}
              >
                Save immutable count
              </Button>
              <Button variant="outline" onClick={() => setPreview(null)}>
                Cancel preview
              </Button>
            </Card>
          )}
          <Grid
            headers={[
              'Shift',
              'Cashier / till',
              'Expected',
              'Counted',
              'Over / short',
              'Review',
            ]}
            rows={r.closes.map((c) => [
              `${c.label} · ${utcToShamsi(new Date(c.startsAt))}`,
              `${c.userName} · ${c.origin}`,
              formatMoney(c.expected),
              formatMoney(c.counted),
              <span key="difference" title={c.note}>
                {formatMoney(c.difference)}
              </span>,
              c.approvedAt ? (
                'Approved'
              ) : canWrite && c.createdBy !== user?.id ? (
                <Button
                  key="approve"
                  disabled={busy}
                  onClick={() => void perform(`tills/${c.id}/approve`, {})}
                >
                  Approve
                </Button>
              ) : (
                'Awaiting another accountant'
              ),
            ])}
          />
          {canWrite && (
            <Form
              title="Record cash deposited into a bank"
              fields={[
                {
                  name: 'fromAccountId',
                  label: 'From cash account',
                  options: cash,
                },
                {
                  name: 'toAccountId',
                  label: 'To bank account',
                  options: cash,
                },
                {
                  name: 'tillCloseId',
                  label: 'Approved shift (optional)',
                  optional: true,
                  options: r.closes
                    .filter((c) => c.approvedAt)
                    .map((c) => ({
                      value: c.id,
                      label: `${c.label} · ${c.userName}`,
                    })),
                },
                {
                  name: 'date',
                  label: 'Deposit date',
                  type: 'date',
                  value: today(),
                },
                { name: 'amount', label: 'Amount (AFN)', type: 'number' },
                { name: 'reference', label: 'Deposit slip / bank reference' },
              ]}
              submit="Prepare deposit draft"
              busy={busy}
              onSubmit={(v) =>
                perform('deposits', {
                  ...v,
                  tillCloseId: v.tillCloseId || null,
                })
              }
            />
          )}
          <Grid
            headers={['Reference', 'Date', 'AFN', 'Status', 'Journal']}
            rows={r.deposits.map((d) => [
              d.reference,
              gregorianToShamsi(d.date),
              formatMoney(d.amount),
              d.reversed ? 'Reversed' : d.status,
              <button
                key={d.id}
                className="underline"
                onClick={() => setSource(d.journalId)}
              >
                View source
              </button>,
            ])}
          />
        </>
      )}
      {source && (
        <>
          <Button variant="outline" onClick={() => setSource('')}>
            Close source details
          </Button>
          <FinanceSource journalId={source} />
        </>
      )}
    </div>
  )
}
