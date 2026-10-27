import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import {
  payablesWorkspaceSchema,
  payablesReportSchema,
  supplierStatementSchema,
  procurementReceiptSchema,
  formatMoney,
  moneyDecimal,
  gregorianToShamsi,
  shamsiToGregorian,
  utcToShamsi,
  type FinanceWorkspace,
} from '@redmars/shared'
import { apiGet, apiPost, ApiError } from '@/lib/api'
import { useAuth } from '@/auth/authContext'
import { FinanceDateInput } from './FinanceDateInput'
import { Form, Grid, FinanceSource } from './FinanceRevenue'
import { download } from '@/lib/financeCsv'
import { Button } from './ui/button'
import { Card } from './ui/card'

type Perform = (
  path: string,
  input: Record<string, unknown>,
) => Promise<boolean>
type Props = { data: FinanceWorkspace; perform: Perform; busy: boolean }
type Workspace = z.infer<typeof payablesWorkspaceSchema>
const cls =
  'h-9 w-full rounded-md border border-input bg-background px-2 text-sm'
const today = () => shamsiToGregorian(utcToShamsi(new Date()))
const option = (id: string, label: string) => ({ value: id, label })
const usePayables = () =>
  useQuery({
    queryKey: ['finance', 'payables'],
    queryFn: () => apiGet('/finance/payables', payablesWorkspaceSchema),
  })

export function FinanceCharges(props: Props) {
  const q = usePayables()
  if (!q.data)
    return (
      <p role={q.isError ? 'alert' : undefined}>
        {q.isError
          ? 'Could not load expense mappings.'
          : 'Loading expense mappings…'}
      </p>
    )
  return <ChargeForm {...props} workspace={q.data} />
}
function ChargeForm({
  data,
  workspace,
  perform,
  busy,
  initialMode = 'cash',
}: Props & { workspace: Workspace; initialMode?: 'cash' | 'payable' }) {
  const [mode, setMode] = useState(initialMode),
    [selection, setSelection] = useState(
      workspace.mappings.length ? 'category' : 'account',
    )
  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <label>
          Payment method
          <select
            className={cls}
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="cash">Paid from cash / bank</option>
            <option value="payable">Unpaid supplier bill</option>
          </select>
        </label>
        <label>
          Expense classification
          <select
            className={cls}
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
          >
            <option value="category">Mapped expense category</option>
            <option value="account">Choose expense / asset account</option>
          </select>
        </label>
      </div>
      <Form
        key={mode + selection}
        title={
          mode === 'cash'
            ? 'Prepare expense or asset purchase'
            : 'Prepare supplier bill'
        }
        busy={busy}
        submit="Create draft for review"
        fields={[
          { name: 'date', label: 'Date', type: 'date', value: today() },
          { name: 'memo', label: 'Description' },
          selection === 'category'
            ? {
                name: 'category',
                label: 'Expense category',
                options: workspace.mappings.map((m) =>
                  option(m.category, m.category),
                ),
              }
            : {
                name: 'accountId',
                label: 'Expense / non-cash asset account',
                options: data.accounts
                  .filter(
                    (a) =>
                      a.isActive &&
                      a.isPosting &&
                      !a.isCash &&
                      !a.isControl &&
                      ['asset', 'expense'].includes(a.type),
                  )
                  .map((a) => option(a.id, `${a.code} · ${a.name}`)),
              },
          {
            name: 'costCentreId',
            label: 'Cost centre override (blank uses category default)',
            optional: true,
            options: workspace.centres
              .filter((c) => c.isActive)
              .map((c) => option(c.id, `${c.code} · ${c.name}`)),
          },
          ...(mode === 'cash'
            ? [
                {
                  name: 'cashAccountId',
                  label: 'Pay from',
                  options: data.accounts
                    .filter((a) => a.isCash && a.isActive && a.isPosting)
                    .map((a) => option(a.id, a.name)),
                },
              ]
            : [
                {
                  name: 'supplierId',
                  label: 'Supplier',
                  options: data.suppliers
                    .filter((s) => s.isActive)
                    .map((s) =>
                      option(s.id, `${s.name} · ${s.termsDays} day terms`),
                    ),
                },
                { name: 'reference', label: 'Supplier invoice reference' },
                {
                  name: 'dueOn',
                  label: 'Due date (blank uses supplier terms)',
                  type: 'date',
                  optional: true,
                },
              ]),
          { name: 'amount', label: 'Amount (AFN)', type: 'number' },
        ]}
        onSubmit={(v) =>
          perform('payables/charges', {
            ...v,
            mode,
            costCentreId: v.costCentreId || undefined,
            dueOn: v.dueOn || undefined,
          })
        }
      />
      <p className="text-sm text-muted-foreground">
        Expense accounts affect profit; asset accounts record inventory,
        prepayments or equipment. Review the draft in Journals using a different
        accountant.
      </p>
    </div>
  )
}

export function FinancePayables({ data, perform, busy }: Props) {
  const { roles } = useAuth(),
    canWrite = roles.some((r) =>
      ['admin', 'finance_manager', 'accountant'].includes(r),
    ),
    canConfigure = roles.some((r) => ['admin', 'finance_manager'].includes(r))
  const workspace = usePayables(),
    [section, setSection] = useState('balances'),
    [supplier, setSupplier] = useState(''),
    [asOf, setAsOf] = useState(today()),
    [from, setFrom] = useState(data.settings?.cutoverDate ?? today()),
    [source, setSource] = useState('')
  const report = useQuery({
    queryKey: ['finance', 'ap', asOf, supplier],
    queryFn: () =>
      apiGet(
        `/finance/payables/aging?asOf=${asOf}${supplier ? '&supplierId=' + supplier : ''}`,
        payablesReportSchema,
      ),
    enabled: !!asOf,
  })
  const statement = useQuery({
    queryKey: ['finance', 'supplier-statement', supplier, from, asOf],
    queryFn: () =>
      apiGet(
        `/finance/payables/suppliers/${supplier}/statement?from=${from}&to=${asOf}`,
        supplierStatementSchema,
      ),
    enabled: !!supplier && !!from && !!asOf && from <= asOf,
  })
  const w = workspace.data,
    r = report.data,
    selected = data.suppliers.find((s) => s.id === supplier)
  const open = (id: string, label: string) => (
    <button className="text-primary underline" onClick={() => setSource(id)}>
      {label}
    </button>
  )
  if (!w)
    return (
      <p role={workspace.isError ? 'alert' : undefined}>
        {workspace.isError
          ? 'Could not load supplier workspace.'
          : 'Loading supplier workspace…'}
      </p>
    )
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {[
          ['balances', 'AP aging & statements'],
          ['suppliers', 'Supplier records'],
          ['bills', 'Bills & payments'],
          ['procurement', 'Purchase receipts'],
          ['mapping', 'Expense mapping & cost centres'],
        ].map(([id, label]) => (
          <Button
            variant={section === id ? 'default' : 'outline'}
            key={id}
            onClick={() => setSection(id)}
          >
            {label}
          </Button>
        ))}
      </div>
      {source && (
        <>
          <Button variant="outline" onClick={() => setSource('')}>
            Close source details
          </Button>
          <FinanceSource journalId={source} />
        </>
      )}
      {['balances', 'suppliers', 'bills'].includes(section) && (
        <label className="block max-w-lg">
          Supplier
          <select
            className={cls}
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
          >
            <option value="">All suppliers</option>
            {data.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.isActive ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        </label>
      )}
      {section === 'balances' && (
        <>
          <label className="block max-w-xs">
            As of (Shamsi)
            <FinanceDateInput value={asOf} onChange={setAsOf} />
          </label>
          {report.isError && <p role="alert">Could not load AP aging.</p>}
          {r && (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <Card className="p-4">
                  Selected suppliers: {formatMoney(r.total)} AFN
                </Card>
                <Card className="p-4">
                  Facility AP control: {formatMoney(r.controlBalance)} AFN
                </Card>
                <Card className="p-4">
                  Unallocated difference: {formatMoney(r.difference)} AFN
                </Card>
              </div>
              <p className="text-sm">
                Aging uses days past the due date in Kabul. Draft bills are
                excluded ({r.pending} awaiting review). Draft payments reserve
                cash allocations but do not reduce posted AP. The control
                comparison always covers the whole facility.
              </p>
              <Button
                variant="outline"
                onClick={() =>
                  download('supplier-ap-aging.csv', [
                    [
                      'Supplier',
                      'Bill',
                      'Due date (Shamsi)',
                      'Outstanding AFN',
                      'Current',
                      '1–30',
                      '31–60',
                      '61–90',
                      'Over 90',
                    ],
                    ...r.rows.map((b) => [
                      b.supplierName,
                      b.reference,
                      gregorianToShamsi(b.dueOn),
                      b.outstanding,
                      b.current,
                      b.days1to30,
                      b.days31to60,
                      b.days61to90,
                      b.over90,
                    ]),
                  ])
                }
              >
                Export aging CSV
              </Button>
              <Grid
                headers={[
                  'Supplier / bill',
                  'Due (Shamsi)',
                  'Outstanding',
                  'Current',
                  '1–30',
                  '31–60',
                  '61–90',
                  'Over 90',
                ]}
                rows={r.rows.map((b) => [
                  <>
                    {b.supplierName}
                    <br />
                    {open(b.journalId, b.reference)}
                  </>,
                  gregorianToShamsi(b.dueOn),
                  formatMoney(b.outstanding),
                  formatMoney(b.current),
                  formatMoney(b.days1to30),
                  formatMoney(b.days31to60),
                  formatMoney(b.days61to90),
                  formatMoney(b.over90),
                ])}
              />
            </>
          )}
          {supplier && (
            <>
              <label className="block max-w-xs">
                Statement from (Shamsi)
                <FinanceDateInput value={from} onChange={setFrom} />
              </label>
              {statement.isError && (
                <p role="alert">Could not load supplier statement.</p>
              )}
              {statement.data && (
                <>
                  <p>
                    {statement.data.supplierName} · Opening{' '}
                    {formatMoney(statement.data.opening)} · Closing{' '}
                    {formatMoney(statement.data.closing)} AFN
                  </p>
                  <Button
                    variant="outline"
                    onClick={() =>
                      download('supplier-statement.csv', [
                        [
                          'Date (Shamsi)',
                          'Journal',
                          'Bill',
                          'Type',
                          'AP movement',
                          'Balance',
                        ],
                        ['', '', '', 'Opening', '', statement.data!.opening],
                        ...statement.data!.lines.map((l) => [
                          gregorianToShamsi(l.date),
                          l.number ?? 'Draft',
                          l.reference,
                          l.kind,
                          l.movement,
                          l.balance,
                        ]),
                      ])
                    }
                  >
                    Export statement CSV
                  </Button>
                  <Grid
                    headers={[
                      'Date (Shamsi)',
                      'Journal / bill',
                      'Type',
                      'AP movement',
                      'Balance',
                    ]}
                    rows={statement.data.lines.map((l) => [
                      gregorianToShamsi(l.date),
                      open(
                        l.journalId,
                        `${l.number ?? 'Draft'} · ${l.reference}`,
                      ),
                      l.kind,
                      formatMoney(l.movement),
                      formatMoney(l.balance),
                    ])}
                  />
                </>
              )}
            </>
          )}
        </>
      )}
      {section === 'suppliers' && (
        <>
          <Grid
            headers={['Supplier', 'Reference / contact', 'Terms', 'Status']}
            rows={data.suppliers.map((s) => [
              <button
                key={s.id}
                className="underline"
                onClick={() => setSupplier(s.id)}
              >
                {s.name}
              </button>,
              `${s.reference ?? ''} ${s.contact}`,
              `${s.termsDays} days · ${s.terms}`,
              s.isActive ? 'Active' : 'Inactive',
            ])}
          />
          {canWrite && (
            <Form
              title={selected ? 'Edit selected supplier' : 'Add supplier'}
              key={selected?.id ?? 'new'}
              busy={busy}
              submit={selected ? 'Save supplier' : 'Add supplier'}
              fields={[
                { name: 'name', label: 'Supplier name', value: selected?.name },
                {
                  name: 'reference',
                  label: 'Supplier reference',
                  optional: true,
                  value: selected?.reference ?? '',
                },
                {
                  name: 'contact',
                  label: 'Contact details',
                  optional: true,
                  value: selected?.contact,
                },
                {
                  name: 'termsDays',
                  label: 'Payment terms (days, 0–365)',
                  type: 'number',
                  value: String(selected?.termsDays ?? 0),
                },
                {
                  name: 'terms',
                  label: 'Terms / notes',
                  optional: true,
                  value: selected?.terms,
                },
                ...(selected
                  ? [
                      {
                        name: 'isActive',
                        label: 'Status',
                        value: String(selected.isActive),
                        options: [
                          option('true', 'Active'),
                          option('false', 'Inactive'),
                        ],
                      },
                    ]
                  : []),
              ]}
              onSubmit={(v) =>
                perform(
                  selected ? `payables/suppliers/${selected.id}` : 'suppliers',
                  {
                    ...v,
                    termsDays: Number(v.termsDays),
                    ...(selected ? { isActive: v.isActive === 'true' } : {}),
                  },
                )
              }
            />
          )}
          {canWrite && (
            <>
              <p className="text-sm">
                Opening balances create an opening equity debit and supplier AP
                credit at{' '}
                {data.settings
                  ? gregorianToShamsi(data.settings.cutoverDate)
                  : 'cutover'}
                . Enter each unpaid opening invoice once. Exclude these amounts
                from the general opening CSV to avoid counting them twice.
              </p>
              <Form
                title="Opening supplier invoice"
                busy={busy}
                submit="Create opening draft"
                fields={[
                  {
                    name: 'supplierId',
                    label: 'Supplier',
                    value: supplier,
                    options: data.suppliers
                      .filter((s) => s.isActive)
                      .map((s) => option(s.id, s.name)),
                  },
                  {
                    name: 'reference',
                    label: 'Original invoice / opening reference',
                  },
                  {
                    name: 'dueOn',
                    label: 'Original due date',
                    type: 'date',
                    value: data.settings?.cutoverDate ?? today(),
                  },
                  {
                    name: 'amount',
                    label: 'Outstanding amount (AFN)',
                    type: 'number',
                  },
                ]}
                onSubmit={(v) => perform('payables/opening', v)}
              />
            </>
          )}
        </>
      )}
      {section === 'bills' && (
        <>
          {canWrite && (
            <ChargeForm
              data={data}
              workspace={w}
              perform={perform}
              busy={busy}
              initialMode="payable"
            />
          )}
          <Grid
            headers={[
              'Supplier / invoice',
              'Date / due (Shamsi)',
              'Status',
              'Amount',
              'Paid',
              'Reserved drafts',
              'Available',
              'Source',
            ]}
            rows={data.bills
              .filter((b) => !supplier || b.supplierId === supplier)
              .map((b) => [
                `${b.supplierName} · ${b.reference}`,
                `${gregorianToShamsi(b.date)} / ${gregorianToShamsi(b.dueOn)}`,
                b.reversed ? 'Reversed' : b.status,
                formatMoney(b.amount),
                formatMoney(b.paid),
                formatMoney(b.reserved),
                formatMoney(b.available),
                open(b.journalId, 'View bill'),
              ])}
          />
          {canWrite && (
            <MultiPayment
              data={data}
              supplierId={supplier}
              perform={perform}
              busy={busy}
            />
          )}
          <Grid
            headers={[
              'Bill',
              'Payment date (Shamsi)',
              'Allocation',
              'Status',
              'Source',
            ]}
            rows={data.bills
              .filter((b) => !supplier || b.supplierId === supplier)
              .flatMap((b) =>
                b.settlements.map((s) => [
                  b.reference,
                  gregorianToShamsi(s.date),
                  formatMoney(s.amount),
                  s.reversed ? 'Reversed' : s.status,
                  open(s.journalId, 'View payment'),
                ]),
              )}
          />
        </>
      )}
      {section === 'procurement' && (
        <>
          <p>
            Record received goods from Excel or paper, keeping the PO and GRN
            references. Each received-goods record can create one supplier bill.
            The bill uses your expense mappings and remains a draft for review.
          </p>
          {canWrite && (
            <ReceiptForm
              data={data}
              workspace={w}
              perform={perform}
              busy={busy}
            />
          )}
          <Grid
            headers={[
              'Supplier',
              'PO / GRN',
              'Received (Shamsi)',
              'Amount',
              'Bill',
            ]}
            rows={w.receipts.map((r) => [
              r.supplierName,
              `${r.poReference} / ${r.grnReference}`,
              gregorianToShamsi(r.receivedOn),
              formatMoney(r.amount),
              r.journalId ? (
                open(r.journalId, 'View bill')
              ) : (
                <>
                  <span>Ready for billing</span>
                  {canWrite && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            'Remove this unbilled goods receipt? Its audit history will remain.',
                          )
                        )
                          void perform(`payables/receipts/${r.id}/remove`, {})
                      }}
                    >
                      Remove receipt
                    </Button>
                  )}
                </>
              ),
            ])}
          />
          {canWrite && (
            <Form
              title="Create bill from goods received"
              busy={busy}
              submit="Create bill draft"
              fields={[
                {
                  name: 'receiptId',
                  label: 'Unbilled goods receipt',
                  options: w.receipts
                    .filter((r) => !r.billId)
                    .map((r) =>
                      option(
                        r.id,
                        `${r.supplierName} · ${r.poReference} / ${r.grnReference} · ${formatMoney(r.amount)} AFN`,
                      ),
                    ),
                },
                { name: 'reference', label: 'Supplier invoice number' },
                {
                  name: 'date',
                  label: 'Bill date',
                  type: 'date',
                  value: today(),
                },
                {
                  name: 'dueOn',
                  label: 'Due date (blank uses supplier terms)',
                  type: 'date',
                  optional: true,
                },
              ]}
              onSubmit={({ receiptId, ...v }) =>
                perform(`payables/receipts/${receiptId}/bill`, {
                  ...v,
                  dueOn: v.dueOn || undefined,
                })
              }
            />
          )}
        </>
      )}
      {section === 'mapping' && (
        <>
          <Grid
            headers={['Category', 'COA account', 'Default cost centre']}
            rows={w.mappings.map((m) => [
              m.category,
              data.accounts.find((a) => a.id === m.accountId)?.name ??
                m.accountId,
              w.centres.find((c) => c.id === m.costCentreId)?.name ??
                'Unassigned',
            ])}
          />
          <Grid
            headers={['Centre code', 'Department / cost centre']}
            rows={w.centres.map((c) => [c.code, c.name])}
          />
          {canConfigure && (
            <>
              <Form
                title="Add department / cost centre"
                busy={busy}
                submit="Add cost centre"
                fields={[
                  { name: 'code', label: 'Code' },
                  { name: 'name', label: 'Department / cost centre name' },
                ]}
                onSubmit={(v) => perform('payables/centres', v)}
              />
              <Form
                title="Set expense category mapping"
                busy={busy}
                submit="Save mapping"
                fields={[
                  {
                    name: 'category',
                    label: 'Category (for example, Rent or Pharmacy purchases)',
                  },
                  {
                    name: 'accountId',
                    label: 'Expense / asset account',
                    options: data.accounts
                      .filter(
                        (a) =>
                          a.isActive &&
                          a.isPosting &&
                          !a.isControl &&
                          !a.isCash &&
                          ['asset', 'expense'].includes(a.type),
                      )
                      .map((a) => option(a.id, `${a.code} · ${a.name}`)),
                  },
                  {
                    name: 'costCentreId',
                    label: 'Default department / cost centre',
                    optional: true,
                    options: w.centres
                      .filter((c) => c.isActive)
                      .map((c) => option(c.id, c.name)),
                  },
                ]}
                onSubmit={(v) =>
                  perform('payables/mappings', {
                    ...v,
                    costCentreId: v.costCentreId || null,
                  })
                }
              />
            </>
          )}
        </>
      )}
    </div>
  )
}

function MultiPayment({
  data,
  supplierId,
  perform,
  busy,
}: Props & { supplierId: string }) {
  const [allocations, setAllocations] = useState<Record<string, string>>({}),
    [on, setOn] = useState(today()),
    [cash, setCash] = useState(''),
    [reference, setReference] = useState('')
  const bills = data.bills.filter(
    (b) =>
      b.supplierId === supplierId &&
      b.status === 'posted' &&
      !b.reversed &&
      /[1-9]/.test(b.available) &&
      !b.available.startsWith('-'),
  )
  const entries = bills.flatMap((b) =>
    allocations[b.id] && /[1-9]/.test(allocations[b.id])
      ? [{ billId: b.id, amount: allocations[b.id] }]
      : [],
  )
  const valid = entries.every((a) => /^\d{1,12}(\.\d{1,2})?$/.test(a.amount))
  return (
    <Card className="space-y-4 p-5">
      <h3 className="font-semibold">One payment across multiple bills</h3>
      {!supplierId ? (
        <p>Select a supplier above to allocate a payment.</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            void perform('payables/payments', {
              supplierId,
              date: on,
              reference,
              cashAccountId: cash,
              allocations: entries,
            }).then((ok) => {
              if (ok) {
                setAllocations({})
                setReference('')
              }
            })
          }}
        >
          <div className="grid gap-3 md:grid-cols-3">
            <label>
              Date (Shamsi)
              <FinanceDateInput value={on} onChange={setOn} required />
            </label>
            <label>
              Payment reference
              <input
                required
                className={cls}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            <label>
              Pay from
              <select
                required
                className={cls}
                value={cash}
                onChange={(e) => setCash(e.target.value)}
              >
                <option value="">Select…</option>
                {data.accounts
                  .filter((a) => a.isCash && a.isActive && a.isPosting)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <Grid
            headers={['Bill', 'Available AFN', 'Allocate AFN']}
            rows={bills.map((b) => [
              b.reference,
              formatMoney(b.available),
              <input
                key={b.id}
                aria-label={`Allocate ${b.reference}`}
                className={cls}
                type="number"
                step="0.01"
                min="0"
                max={b.available}
                value={allocations[b.id] ?? ''}
                onChange={(e) =>
                  setAllocations({ ...allocations, [b.id]: e.target.value })
                }
              />,
            ])}
          />
          <p>
            Total payment:{' '}
            {valid
              ? formatMoney(
                  entries.reduce((n, a) => n.add(a.amount), moneyDecimal('0')),
                )
              : 'Check amounts'}{' '}
            AFN
          </p>
          <Button disabled={busy || !entries.length || !valid}>
            Prepare payment draft
          </Button>
        </form>
      )}
    </Card>
  )
}

type ReceiptLine = z.infer<typeof procurementReceiptSchema>['lines'][number]
const emptyLine = (): ReceiptLine => ({
  sourceLineId: '1',
  description: '',
  quantity: '1',
  unitCost: '',
  category: '',
})
function ReceiptForm({
  data,
  workspace,
  perform,
  busy,
}: Props & { workspace: Workspace }) {
  const [lines, setLines] = useState<ReceiptLine[]>([emptyLine()]),
    [error, setError] = useState('')
  const [supplier, setSupplier] = useState(''),
    [system, setSystem] = useState('Excel / paper'),
    [po, setPo] = useState(''),
    [grn, setGrn] = useState(''),
    [on, setOn] = useState(today())
  const update = (i: number, key: keyof ReceiptLine, value: string) =>
    setLines(lines.map((l, n) => (n === i ? { ...l, [key]: value } : l)))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const input = {
      supplierId: supplier,
      sourceSystem: system,
      poReference: po,
      grnReference: grn,
      receivedOn: on,
      lines,
    }
    const validation = procurementReceiptSchema.safeParse({
      ...input,
      idempotencyKey: crypto.randomUUID(),
    })
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? 'Check the receipt.')
      return
    }
    if (await perform('payables/receipts', input)) {
      setLines([emptyLine()])
      setPo('')
      setGrn('')
    }
  }
  return (
    <Card className="space-y-4 p-5">
      <h3 className="font-semibold">Record a goods-received note</h3>
      <p className="text-sm">
        Enter paper records below, or upload the CSV template saved from Excel.
        Review the imported rows before saving. Unit costs use AFN; each line
        rounds to two decimals.
      </p>
      <Button
        variant="outline"
        onClick={() =>
          download('goods-received-template.csv', [
            ['sourceLineId', 'description', 'quantity', 'unitCost', 'category'],
          ])
        }
      >
        Download Excel CSV template
      </Button>
      <label className="block">
        Import receipt lines
        <input
          className="block"
          type="file"
          accept=".csv"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            setError('')
            if (f.size > 80000) {
              setError('CSV must be below 80 KB.')
              return
            }
            void f
              .text()
              .then((csv) =>
                apiPost(
                  '/finance/payables/receipts/preview',
                  { csv },
                  z.object({ lines: procurementReceiptSchema.shape.lines }),
                ),
              )
              .then((result) => setLines(result.lines))
              .catch((e) =>
                setError(
                  e instanceof ApiError &&
                    e.body &&
                    typeof e.body === 'object' &&
                    'message' in e.body
                    ? String(e.body.message)
                    : 'Could not read this CSV.',
                ),
              )
          }}
        />
      </label>
      {error && (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      )}
      <form className="space-y-3" onSubmit={(e) => void submit(e)}>
        <div className="grid gap-3 md:grid-cols-3">
          <label>
            Supplier
            <select
              required
              className={cls}
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            >
              <option value="">Select…</option>
              {data.suppliers
                .filter((s) => s.isActive)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Source / register
            <input
              required
              className={cls}
              value={system}
              onChange={(e) => setSystem(e.target.value)}
            />
          </label>
          <label>
            PO reference
            <input
              required
              className={cls}
              value={po}
              onChange={(e) => setPo(e.target.value)}
            />
          </label>
          <label>
            GRN reference
            <input
              required
              className={cls}
              value={grn}
              onChange={(e) => setGrn(e.target.value)}
            />
          </label>
          <label>
            Received (Shamsi)
            <FinanceDateInput required value={on} onChange={setOn} />
          </label>
        </div>
        <Grid
          headers={[
            'Line reference',
            'Description',
            'Quantity',
            'Unit cost AFN',
            'Mapped category',
            '',
          ]}
          rows={lines.map((l, i) => [
            ...(
              ['sourceLineId', 'description', 'quantity', 'unitCost'] as const
            ).map((key) => (
              <input
                key={key}
                aria-label={`${key} row ${i + 1}`}
                required
                className={cls}
                value={l[key]}
                onChange={(e) => update(i, key, e.target.value)}
              />
            )),
            <select
              key="category"
              aria-label={`Category row ${i + 1}`}
              required
              className={cls}
              value={l.category}
              onChange={(e) => update(i, 'category', e.target.value)}
            >
              <option value="">Select…</option>
              {workspace.mappings.map((m) => (
                <option key={m.category}>{m.category}</option>
              ))}
              {l.category &&
                !workspace.mappings.some((m) => m.category === l.category) && (
                  <option>{l.category}</option>
                )}
            </select>,
            <Button
              key="remove"
              type="button"
              variant="outline"
              disabled={lines.length === 1}
              onClick={() => setLines(lines.filter((_, n) => n !== i))}
            >
              Remove
            </Button>,
          ])}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={lines.length >= 50}
            onClick={() =>
              setLines([
                ...lines,
                { ...emptyLine(), sourceLineId: String(lines.length + 1) },
              ])
            }
          >
            Add line
          </Button>
          <Button disabled={busy}>Save received goods</Button>
        </div>
      </form>
    </Card>
  )
}
