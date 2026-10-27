import { FinanceStatements } from '@/components/FinanceStatements'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  useQuery,
  useQueryClient,
  useInfiniteQuery,
} from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import {
  financeWorkspaceSchema,
  formatMoney,
  moneyDecimal,
  gregorianToShamsi,
  shamsiToGregorian,
  utcToShamsi,
  financeReportSchema,
  financeLedgerSchema,
  financeSyncSchema,
  financeJournalPageSchema,
  financeJournalSchema,
  financeAuditPageSchema,
  financeOpeningPreviewSchema,
  type FinanceJournal,
  type FinanceWorkspace,
} from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { apiGet, apiPost, ApiError } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FinanceDateInput } from '@/components/FinanceDateInput'
import { ShamsiCalendar } from '@/components/ShamsiCalendar'
import { FinancePayables, FinanceCharges } from '@/components/FinancePayables'
import { FinancePayroll } from '@/components/FinancePayroll'
import { FinanceAssets, FinanceBudgets, FinanceTransfers } from '@/components/FinanceAssets'
import { FinanceRevenue, FinanceSource } from '@/components/FinanceRevenue'

type Account = FinanceWorkspace['accounts'][number]
type Field = {
  key: string
  label: string
  type?: string
  options?: { value: string; label: string }[]
  initial?: string
  optional?: boolean
}
type Perform = (
  path: string,
  input: Record<string, unknown>,
) => Promise<boolean>
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kabul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
const accountOptions = (accounts: Account[]) =>
  accounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))
const inputClass =
  'h-9 w-full rounded-md border border-input bg-background px-2 text-sm'
const money = formatMoney
const displayDate = gregorianToShamsi
const monthStart = () =>
  shamsiToGregorian(utcToShamsi(new Date()).slice(0, 8) + '01')

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">
        {field.label}
        {field.type === 'date' ? ' (Shamsi)' : ''}
      </span>
      {field.options ? (
        <select
          aria-label={field.label}
          className={inputClass}
          value={value}
          required={!field.optional}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select…</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === 'date' ? (
        <FinanceDateInput
          aria-label={field.label + ' (Shamsi)'}
          value={value}
          onChange={onChange}
          required={!field.optional}
        />
      ) : (
        <Input
          aria-label={field.label}
          type={field.type ?? 'text'}
          step={field.type === 'number' ? '0.01' : undefined}
          value={value}
          required={!field.optional}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  )
}

function SimpleForm({
  title,
  fields,
  submit,
  onSubmit,
  busy,
  children,
}: {
  title: string
  fields: Field[]
  submit: string
  onSubmit: (values: Record<string, string>) => Promise<boolean>
  busy: boolean
  children?: ReactNode
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  async function save(e: FormEvent) {
    e.preventDefault()
    const body = Object.fromEntries(
      fields.map((f) => [f.key, values[f.key] ?? f.initial ?? '']),
    )
    if (await onSubmit(body)) setValues({})
  }
  return (
    <Card className="p-5">
      <form
        onSubmit={(e) => {
          void save(e)
        }}
        className="space-y-4"
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {fields.map((f) => (
            <FieldInput
              key={f.key}
              field={f}
              value={values[f.key] ?? f.initial ?? ''}
              onChange={(v) => setValues((old) => ({ ...old, [f.key]: v }))}
            />
          ))}
        </div>
        {children}
        <Button type="submit" disabled={busy}>
          {submit}
        </Button>
      </form>
    </Card>
  )
}

function Table({
  headings,
  children,
}: {
  headings: string[]
  children: ReactNode
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-start text-sm">
        <thead className="bg-muted">
          <tr>
            {headings.map((h) => (
              <th className="p-3 text-start font-medium" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  )
}
const Cell = ({ children }: { children?: ReactNode }) => (
  <td className="p-3 align-top">{children}</td>
)
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

export function FinancePage() {
  const { t } = useTranslation()
  const { roles } = useAuth()
  const canPost = roles.some((r) =>
    ['admin', 'finance_manager', 'accountant'].includes(r),
  )
  const canConfigure = roles.some((r) =>
    ['admin', 'finance_manager'].includes(r),
  )
  const canWrite = canPost || roles.includes('accountant')
  const client = useQueryClient()
  const workspace = useQuery({
    queryKey: ['finance'],
    queryFn: () => apiGet('/finance', financeWorkspaceSchema),
  })
  const [tab, setTab] = useState(() => {
    const q = new URLSearchParams(window.location.search)
    return q.has('asset') ? 'assets' : q.has('journal') ? 'journals' : q.has('payrollRun') ? 'payroll' : q.get('tab') === 'reports' ? 'reports' : 'overview'
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [syncResult, setSyncResult] = useState<z.infer<
    typeof financeSyncSchema
  > | null>(null)
  const keys = useRef(new Map<string, string>())
  const perform: Perform = async (path, input) => {
    if (busy) return false
    const fingerprint = path + JSON.stringify(input)
    const idempotencyKey = keys.current.get(fingerprint) ?? crypto.randomUUID()
    keys.current.set(fingerprint, idempotencyKey)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await apiPost(
        '/finance/' + path,
        { ...input, idempotencyKey },
        z.unknown(),
      )
      if (path === 'sync') setSyncResult(financeSyncSchema.parse(result))
      keys.current.delete(fingerprint)
      await client.invalidateQueries({ queryKey: ['finance'] })
      setNotice('Saved successfully.')
      return true
    } catch (e) {
      const body = e instanceof ApiError ? e.body : null
      setError(
        body &&
          typeof body === 'object' &&
          'message' in body &&
          typeof body.message === 'string'
          ? body.message
          : 'Could not confirm the save. Check your connection, then retry this form.',
      )
      return false
    } finally {
      setBusy(false)
    }
  }
  if (workspace.isPending) return <p className="p-6">Loading finance…</p>
  if (!workspace.data)
    return (
      <div className="space-y-3">
        <PageHeader title={t('nav.finance')} />
        <p role="alert">
          Finance is unavailable. Enable Finance in Modules and use an account
          with finance access.
        </p>
        <Button
          onClick={() => {
            void workspace.refetch()
          }}
        >
          Retry
        </Button>
      </div>
    )
  const data = workspace.data
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'journals', label: 'Journals' },
    { id: 'accounts', label: 'Accounts & periods' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'suppliers', label: 'Suppliers & payables' },
    { id: 'payroll', label: 'Payroll' },
    { id: 'assets', label: 'Fixed assets' },
    { id: 'budgets', label: 'Budgets & variance' },
    { id: 'reconcile', label: 'Cash & bank' },
    { id: 'reports', label: 'Financial reports' },
    { id: 'ledger', label: 'General ledger & trial balance' },
    { id: 'revenue', label: 'Revenue, AR & tills' },
  ]
  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title={t('nav.finance')}
        description="AFN books · Hospital finance and accounting"
      />
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      <ShamsiCalendar />
      {!data.settings ? (
        canPost ? (
          <SimpleForm
            title="Initialize the hospital books"
            fields={[
              {
                key: 'cutoverDate',
                label: 'Start date for these books',
                type: 'date',
                initial: today(),
              },
            ]}
            submit="Create AFN chart of accounts"
            busy={busy}
            onSubmit={(v) => perform('setup', v)}
          >
            <p className="text-sm text-muted-foreground">
              Creates the chart and complete Shamsi fiscal years. Review them
              with your accountant, and enter approved opening balances. This
              start date cannot be changed after setup. Earlier hospital
              transactions are not imported.
            </p>
          </SimpleForm>
        ) : (
          <p>A finance manager must initialize the books.</p>
        )
      ) : (
        <>
          <nav
            aria-label="Finance sections"
            className="flex flex-wrap gap-2 border-b pb-3"
          >
            {tabs.map((x) => (
              <Button
                key={x.id}
                variant={tab === x.id ? 'default' : 'ghost'}
                aria-current={tab === x.id ? 'page' : undefined}
                onClick={() => setTab(x.id)}
              >
                {x.label}
              </Button>
            ))}
          </nav>
          {tab === 'overview' && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  ['Base currency', 'AFN'],
                  [
                    'Open periods',
                    String(data.periods.filter((p) => !p.closedAt).length),
                  ],
                  [
                    'Hospital updates awaiting posting',
                    String(data.pendingEvents),
                  ],
                ].map(([label, value]) => (
                  <Card className="p-5" key={label}>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="mt-2 text-3xl font-semibold">{value}</p>
                  </Card>
                ))}
              </div>
              <Card className="space-y-3 p-5">
                <h2 className="text-lg font-semibold">
                  Hospital billing integration
                </h2>
                <p className="text-sm text-muted-foreground">
                  New invoices, collections, discounts, cancellations and
                  refunds generate drafts automatically every ten seconds. Each
                  event is processed once. Review and post drafts in Journals;
                  reports include posted entries only.
                </p>
                {canPost && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      void perform('sync', {})
                    }}
                  >
                    Process hospital activity
                  </Button>
                )}
                {syncResult && (
                  <div className="space-y-2 text-sm">
                    <p>
                      {syncResult.drafted} drafted · {syncResult.skipped}{' '}
                      skipped / already processed · {syncResult.remaining}{' '}
                      remaining
                    </p>
                    {syncResult.failures.map((f) => (
                      <p key={f.eventId} className="text-destructive">
                        {f.type} · {f.message}{' '}
                        <span className="font-mono text-xs">{f.eventId}</span>
                      </p>
                    ))}
                  </div>
                )}
              </Card>
              <Card className="space-y-2 p-5">
                <h2 className="font-semibold">Getting started</h2>
                <ol className="list-decimal space-y-2 ps-5 text-sm">
                  <li>
                    Review Accounts & periods and create the current accounting
                    period.
                  </li>
                  <li>
                    Enter approved opening balances as a draft journal; a
                    finance manager posts it.
                  </li>
                  <li>
                    Record expenses and supplier bills, then process hospital
                    activity.
                  </li>
                  <li>
                    Match cash/bank statements and review financial reports
                    before closing a period.
                  </li>
                </ol>
                <p className="text-sm text-muted-foreground">
                  Books start on {displayDate(data.settings.cutoverDate)}.
                  Historical receivables require a separately reconciled opening
                  import.
                </p>
              </Card>
            </>
          )}
          {tab === 'journals' && (
            <Journals
              data={data}
              perform={perform}
              busy={busy}
              canPost={canPost}
              canWrite={canWrite}
            />
          )}
          {tab === 'accounts' && (
            <>
              <Panel title="Chart of accounts">
                <Table
                  headings={[
                    'Code',
                    'Account',
                    'Parent',
                    'Type / normal balance',
                    'Use',
                  ]}
                >
                  {data.accounts.map((a) => (
                    <tr key={a.id}>
                      <Cell>{a.code}</Cell>
                      <Cell>{a.name}</Cell>
                      <Cell>
                        {data.accounts.find((p) => p.id === a.parentId)?.name ??
                          'Root'}
                      </Cell>
                      <Cell>
                        {a.type} · {a.normalBalance}
                      </Cell>
                      <Cell>
                        {!a.isPosting
                          ? 'Group'
                          : a.isControl
                            ? 'System control'
                            : a.isCash
                              ? 'Cash / bank'
                              : 'Manual posting'}
                      </Cell>
                    </tr>
                  ))}
                </Table>
              </Panel>
              {canConfigure && (
                <SimpleForm
                  title="Add an account"
                  fields={[
                    { key: 'code', label: 'Account code' },
                    { key: 'name', label: 'Account name' },
                    {
                      key: 'parentId',
                      label: 'Parent group',
                      optional: true,
                      options: accountOptions(
                        data.accounts.filter((a) => !a.isPosting),
                      ),
                    },
                    {
                      key: 'normalBalance',
                      label: 'Normal balance',
                      optional: true,
                      options: ['debit', 'credit'].map((value) => ({
                        value,
                        label: value,
                      })),
                    },
                    {
                      key: 'isPosting',
                      label: 'Use',
                      initial: 'true',
                      options: [
                        { value: 'true', label: 'Posting account' },
                        { value: 'false', label: 'Group' },
                      ],
                    },
                    {
                      key: 'type',
                      label: 'Account type',
                      options: [
                        'asset',
                        'liability',
                        'equity',
                        'revenue',
                        'expense',
                      ].map((value) => ({ value, label: value })),
                    },
                    {
                      key: 'isCash',
                      label: 'Cash / bank account',
                      initial: 'false',
                      options: [
                        { value: 'false', label: 'No' },
                        { value: 'true', label: 'Yes (asset accounts only)' },
                      ],
                    },
                  ]}
                  submit="Add account"
                  busy={busy}
                  onSubmit={(v) =>
                    perform('accounts', {
                      ...v,
                      parentId: v.parentId || null,
                      normalBalance: v.normalBalance || undefined,
                      isPosting: v.isPosting === 'true',
                      isCash: v.isCash === 'true',
                    })
                  }
                />
              )}
              <FiscalPeriods
                data={data}
                busy={busy}
                perform={perform}
                canPost={canConfigure}
              />
              {canWrite && <OpeningBalances perform={perform} busy={busy} />}
            </>
          )}
          {tab === 'expenses' && canWrite && (
            <FinanceCharges data={data} perform={perform} busy={busy} />
          )}
          {tab === 'suppliers' && (
            <FinancePayables data={data} perform={perform} busy={busy} />
          )}
          {tab === 'payroll' && <FinancePayroll data={data} perform={perform} busy={busy} />}
          {tab === 'assets' && <FinanceAssets data={data} perform={perform} busy={busy} />}
          {tab === 'budgets' && <FinanceBudgets data={data} perform={perform} busy={busy} />}
          {tab === 'reconcile' && <FinanceTransfers data={data} perform={perform} busy={busy} />}
          {tab === 'reconcile' && (
            <Reconciliation
              data={data}
              busy={busy}
              perform={perform}
              canWrite={canWrite}
            />
          )}
          {tab === 'reports' && <FinanceStatements data={data} perform={perform} busy={busy} />}
          {tab === 'ledger' && <FinanceReports data={data} />}
          {tab === 'revenue' && (
            <FinanceRevenue data={data} perform={perform} busy={busy} />
          )}
        </>
      )}
    </div>
  )
}

function JournalList({
  rows,
  select,
}: {
  rows: FinanceJournal[]
  select?: (j: FinanceJournal) => void
}) {
  return (
    <Table
      headings={[
        'Date',
        'Journal',
        'Description',
        'Source',
        'Status',
        'Details',
      ]}
    >
      {rows.length ? (
        rows.map((j) => (
          <tr key={j.id}>
            <Cell>
              {displayDate(j.date)}
              <p className="text-xs text-muted-foreground">{j.periodLabel}</p>
            </Cell>
            <Cell>{j.number ?? 'Draft'}</Cell>
            <Cell>{j.memo}</Cell>
            <Cell>{j.sourceType.replaceAll('_', ' ')}</Cell>
            <Cell>
              {j.reversalStatus === 'posted'
                ? 'Reversed'
                : j.reversalStatus === 'draft'
                  ? 'Reversal awaiting review'
                  : j.status}
            </Cell>
            <Cell>
              {select && (
                <Button variant="outline" onClick={() => select(j)}>
                  Open
                </Button>
              )}
            </Cell>
          </tr>
        ))
      ) : (
        <tr>
          <td colSpan={6} className="p-6 text-center text-muted-foreground">
            No entries yet.
          </td>
        </tr>
      )}
    </Table>
  )
}

function Journals({
  data,
  perform,
  busy,
  canPost,
  canWrite,
}: {
  data: FinanceWorkspace
  perform: Perform
  busy: boolean
  canPost: boolean
  canWrite: boolean
}) {
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(window.location.search).get('journal'))
  const [editing, setEditing] = useState<string | null>(null)
  const [newDraft, setNewDraft] = useState(false)
  const { user } = useAuth()
  const [page, setPage] = useState(1),
    [status, setStatus] = useState('draft')
  const entries = useQuery({
    queryKey: ['finance', 'journals', page, status],
    queryFn: () =>
      apiGet(
        `/finance/journals?page=${page}${status ? '&status=' + status : ''}`,
        financeJournalPageSchema,
      ),
  })
  const rows = entries.data?.journals ?? []
  const detail = useQuery({queryKey: ['finance', 'journal', selected], queryFn: () => apiGet(`/finance/journals/${selected}`, financeJournalSchema), enabled: !!selected})
  const journal = detail.data ?? rows.find((j) => j.id === selected)
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Showing {rows.length} of {entries.data?.total ?? 0} entries. A
          different accountant reviews and posts each draft.
        </p>
        {canWrite && (
          <Button
            onClick={() => {
              setNewDraft((v) => !v)
              setEditing(null)
            }}
          >
            New journal
          </Button>
        )}
      </div>
      {(newDraft || editing) && (
        <JournalEditor
          key={editing ?? 'new'}
          accounts={data.accounts.filter(
            (a) => !a.isControl && a.isActive && a.isPosting,
          )}
          existing={rows.find((j) => j.id === editing)}
          busy={busy}
          onSave={async (input) => {
            const success = await perform(
              editing ? `journals/${editing}/edit` : 'journals',
              input,
            )
            if (success) {
              setNewDraft(false)
              setEditing(null)
            }
            return success
          }}
        />
      )}
      <div className="flex gap-3 items-center">
        <label>
          Status
          <select
            className={inputClass}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
              setSelected(null)
            }}
          >
            <option value="draft">Awaiting review</option>
            <option value="posted">Posted</option>
            <option value="">All</option>
          </select>
        </label>
        <Button
          variant="outline"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <span>Page {page}</span>
        <Button
          variant="outline"
          disabled={page * 50 >= (entries.data?.total ?? 0)}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
      {entries.isError && <p role="alert">Could not load journal entries.</p>}
      <JournalList rows={rows} select={(j) => setSelected(j.id)} />
      {journal && (
        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">
            {journal.number ?? 'Draft journal'} · {displayDate(journal.date)}
          </h2>
          <p>{journal.memo}</p>
          <p className="text-sm">
            Prepared by {journal.createdByName} · Posted by{' '}
            {journal.postedByName ?? 'Awaiting review'}
          </p>
          <Table
            headings={['Account', 'Description', 'Debit (AFN)', 'Credit (AFN)']}
          >
            {journal.lines.map((l) => (
              <tr key={l.id}>
                <Cell>
                  {l.accountCode} · {l.accountName}
                </Cell>
                <Cell>
                  {l.description}
                  {l.costCentreName && (
                    <div className="text-muted-foreground">
                      {l.costCentreName}
                    </div>
                  )}
                </Cell>
                <Cell>{money(l.debit)}</Cell>
                <Cell>{money(l.credit)}</Cell>
              </tr>
            ))}
          </Table>
          {journal.status === 'draft' && (
            <div className="flex gap-2">
              {canWrite &&
                [
                  'manual',
                  'opening_import',
                  'expense',
                  'supplier_bill',
                  'supplier_payment',
                  'payroll_payment',
                  'payroll_loan',
                  'bank_transfer',
                  'asset_acquisition',
                  'asset_depreciation',
                  'asset_disposal',
                ].includes(journal.sourceType) && (
                  <>
                    {journal.sourceType === 'manual' && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setEditing(journal.id)
                          setNewDraft(false)
                        }}
                      >
                        Edit draft
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('Remove this unposted draft?'))
                          void perform(`journals/${journal.id}/remove`, {
                            expectedVersion: journal.version,
                          })
                      }}
                    >
                      Remove draft
                    </Button>
                  </>
                )}
              {canPost && (
                <Button
                  disabled={busy || journal.createdBy === user?.id}
                  onClick={() => {
                    void perform(`journals/${journal.id}/post`, {
                      expectedVersion: journal.version,
                    })
                  }}
                >
                  Post balanced journal
                </Button>
              )}
            </div>
          )}
          {canPost &&
            journal.status === 'posted' &&
            !journal.reversalId &&
            !journal.reversalOfId &&
            journal.sourceType !== 'hospital' && (
              <SimpleForm
                title="Reverse this posting"
                fields={[
                  {
                    key: 'date',
                    label: 'Reversal date',
                    type: 'date',
                    initial: today(),
                  },
                  { key: 'reason', label: 'Reason for reversal' },
                ]}
                submit="Prepare reversal for review"
                busy={busy}
                onSubmit={(v) => perform(`journals/${journal.id}/reverse`, v)}
              />
            )}
          {journal.sourceType === 'hospital' && (
            <p className="text-sm text-muted-foreground">
              Correct this transaction in hospital billing and process the
              resulting finance event.
            </p>
          )}
          <FinanceSource journalId={journal.id} />
          <JournalAudit journalId={journal.id} />
        </Card>
      )}
    </div>
  )
}

function OpeningBalances({
  perform,
  busy,
}: {
  perform: Perform
  busy: boolean
}) {
  const [file, setFile] = useState<{ filename: string; csv: string } | null>(
    null,
  )
  const [preview, setPreview] = useState<z.infer<
    typeof financeOpeningPreviewSchema
  > | null>(null)
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(false)
  return (
    <Card className="space-y-3 p-5">
      <h2 className="text-lg font-semibold">Opening balances from Excel</h2>
      <p>
        Save the accountant’s opening trial balance as UTF-8 CSV. Headings:
        accountCode,debit,credit,description. One row per posting account, plain
        decimal amounts. The preview must balance before a draft can be created
        at the finance cutover date.
      </p>
      <Button
        variant="outline"
        onClick={() => {
          const url = URL.createObjectURL(
            new Blob(['accountCode,debit,credit,description\r\n'], {
              type: 'text/csv',
            }),
          )
          const a = document.createElement('a')
          a.href = url
          a.download = 'opening-balances-template.csv'
          a.click()
          URL.revokeObjectURL(url)
        }}
      >
        Download empty template
      </Button>
      <input
        aria-label="Opening balance CSV"
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          setPreview(null)
          setError('')
          setFile(null)
          const f = e.target.files?.[0]
          if (f) {
            if (f.size > 80000) {
              setError('Use a CSV file no larger than 80 KB.')
              return
            }
            void f
              .text()
              .then((csv) => setFile({ filename: f.name, csv }))
              .catch(() => setError('Could not read this file.'))
          }
        }}
      />
      <Button
        disabled={!file || loading || busy}
        onClick={() => {
          if (!file) return
          setLoading(true)
          setError('')
          void apiPost(
            '/finance/opening/preview',
            { ...file, idempotencyKey: crypto.randomUUID() },
            financeOpeningPreviewSchema,
          )
            .then(setPreview)
            .catch((e: unknown) =>
              setError(
                e instanceof ApiError &&
                  e.body &&
                  typeof e.body === 'object' &&
                  'message' in e.body
                  ? String(e.body.message)
                  : 'Could not validate the file.',
              ),
            )
            .finally(() => setLoading(false))
        }}
      >
        Validate and preview
      </Button>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {preview && (
        <>
          <p>
            {preview.rows.length} accounts · {displayDate(preview.date)} · Debit{' '}
            {money(preview.debit)} = Credit {money(preview.credit)} AFN
          </p>
          <div className="max-h-96 overflow-auto">
            <Table headings={['Account', 'Debit', 'Credit', 'Description']}>
              {preview.rows.map((r) => (
                <tr key={r.accountId}>
                  <Cell>
                    {r.code} · {r.name}
                  </Cell>
                  <Cell>{money(r.debit)}</Cell>
                  <Cell>{money(r.credit)}</Cell>
                  <Cell>{r.description}</Cell>
                </tr>
              ))}
            </Table>
          </div>
          <Button
            disabled={busy}
            onClick={() => {
              if (file)
                void perform('opening/import', file).then((ok) => {
                  if (ok) {
                    setPreview(null)
                    setFile(null)
                  }
                })
            }}
          >
            Create opening draft for review
          </Button>
        </>
      )}
    </Card>
  )
}

function JournalAudit({ journalId }: { journalId: string }) {
  const [page, setPage] = useState(1)
  const audit = useQuery({
    queryKey: ['finance', 'audit', journalId, page],
    queryFn: () =>
      apiGet(
        `/finance/journals/${journalId}/audit?page=${page}`,
        financeAuditPageSchema,
      ),
  })
  return (
    <details>
      <summary className="cursor-pointer font-medium">
        Append-only audit history
      </summary>
      {audit.isError && <p role="alert">Could not load audit history.</p>}
      {audit.data && (
        <>
          <Table headings={['When', 'Who', 'Action', 'Before / after']}>
            {audit.data.rows.map((r) => (
              <tr key={r.id}>
                <Cell>
                  {utcToShamsi(new Date(r.occurredAt))} ·{' '}
                  {new Date(r.occurredAt).toLocaleTimeString('en-GB', {
                    timeZone: 'Asia/Kabul',
                  })}
                </Cell>
                <Cell>{r.actorName}</Cell>
                <Cell>
                  {r.action} · {r.entity}
                </Cell>
                <Cell>
                  <details>
                    <summary>Show changes</summary>
                    <pre className="max-w-lg overflow-auto text-xs">
                      {JSON.stringify(
                        { before: r.before, after: r.after },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </Cell>
              </tr>
            ))}
          </Table>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={page * 50 >= audit.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </details>
  )
}

function JournalEditor({
  accounts,
  existing,
  busy,
  onSave,
}: {
  accounts: Account[]
  existing?: FinanceJournal
  busy: boolean
  onSave: (v: Record<string, unknown>) => Promise<boolean>
}) {
  const [on, setOn] = useState(existing?.date ?? today()),
    [memo, setMemo] = useState(existing?.memo ?? '')
  const empty = () => ({
    accountId: '',
    description: '',
    debit: '0',
    credit: '0',
  })
  const [lines, setLines] = useState(
    existing?.lines.map((l) => ({
      accountId: l.accountId,
      description: l.description,
      debit: l.debit,
      credit: l.credit,
    })) ?? [empty(), empty()],
  )
  const update = (
    index: number,
    key: keyof (typeof lines)[number],
    value: string,
  ) =>
    setLines((old) =>
      old.map((l, i) => (i === index ? { ...l, [key]: value } : l)),
    )
  return (
    <Card className="p-5">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void onSave({
            date: on,
            memo,
            lines,
            ...(existing ? { expectedVersion: existing.version } : {}),
          })
        }}
      >
        <h2 className="text-lg font-semibold">
          {existing ? 'Edit draft' : 'New manual journal'}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <FieldInput
            field={{ key: 'date', label: 'Posting date', type: 'date' }}
            value={on}
            onChange={setOn}
          />
          <FieldInput
            field={{ key: 'memo', label: 'Description / purpose' }}
            value={memo}
            onChange={setMemo}
          />
        </div>
        <Table headings={['Account', 'Description', 'Debit', 'Credit', '']}>
          {lines.map((l, i) => (
            <tr key={i}>
              <Cell>
                <select
                  aria-label={`Account line ${i + 1}`}
                  className={inputClass}
                  required
                  value={l.accountId}
                  onChange={(e) => update(i, 'accountId', e.target.value)}
                >
                  <option value="">Choose account</option>
                  {accountOptions(accounts).map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </Cell>
              <Cell>
                <Input
                  aria-label={`Description line ${i + 1}`}
                  value={l.description}
                  onChange={(e) => update(i, 'description', e.target.value)}
                />
              </Cell>
              <Cell>
                <Input
                  aria-label={`Debit line ${i + 1}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={l.debit}
                  onChange={(e) => update(i, 'debit', e.target.value)}
                />
              </Cell>
              <Cell>
                <Input
                  aria-label={`Credit line ${i + 1}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={l.credit}
                  onChange={(e) => update(i, 'credit', e.target.value)}
                />
              </Cell>
              <Cell>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={lines.length <= 2}
                  onClick={() =>
                    setLines((old) => old.filter((_, index) => index !== i))
                  }
                >
                  Remove
                </Button>
              </Cell>
            </tr>
          ))}
        </Table>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={lines.length >= 100}
            onClick={() => setLines((old) => [...old, empty()])}
          >
            Add line
          </Button>
          <Button type="submit" disabled={busy}>
            Save draft
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Saving a draft does not change the books. A finance manager must post
          it after reviewing the balanced debit and credit lines.
        </p>
      </form>
    </Card>
  )
}

function FinanceReports({ data }: { data: FinanceWorkspace }) {
  const [page, setPage] = useState(1),
    [source, setSource] = useState('')
  const [from, setFrom] = useState(monthStart()),
    [to, setTo] = useState(today()),
    [account, setAccount] = useState('')
  const valid = !!from && !!to && from <= to
  const report = useQuery({
    queryKey: ['finance', 'report', from, to],
    queryFn: () =>
      apiGet(`/finance/reports?from=${from}&to=${to}`, financeReportSchema),
    enabled: valid,
  })
  const ledger = useQuery({
    queryKey: ['finance', 'ledger', account, from, to, page],
    queryFn: () =>
      apiGet(
        `/finance/ledger?accountId=${account}&from=${from}&to=${to}&page=${page}`,
        financeLedgerSchema,
      ),
    enabled: valid && !!account,
  })
  const r = report.data
  return (
    <div className="space-y-5">
      <label className="grid gap-1.5 text-sm">
        Fiscal period
        <select
          className={inputClass}
          aria-label="Report fiscal period"
          value={
            data.periods.find((p) => p.startsOn === from && p.endsOn === to)
              ?.id ?? ''
          }
          onChange={(e) => {
            const p = data.periods.find((p) => p.id === e.target.value)
            if (p) {
              setFrom(p.startsOn)
              setTo(p.endsOn)
            }
          }}
        >
          <option value="">Custom Shamsi date range</option>
          {data.periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} · {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <FieldInput
          field={{ key: 'from', label: 'From', type: 'date' }}
          value={from}
          onChange={(v) => {
            setFrom(v)
            setPage(1)
          }}
        />
        <FieldInput
          field={{ key: 'to', label: 'Through', type: 'date' }}
          value={to}
          onChange={(v) => {
            setTo(v)
            setPage(1)
          }}
        />
        <FieldInput
          field={{
            key: 'account',
            label: 'Account ledger (optional)',
            optional: true,
            options: accountOptions(data.accounts),
          }}
          value={account}
          onChange={(v) => {
            setAccount(v)
            setPage(1)
          }}
        />
      </div>
      {(report.isError || ledger.isError) && (
        <p role="alert" className="text-destructive">
          Could not load the report.
        </p>
      )}
      {r && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['Revenue', r.income],
              ['Expenses', r.expenses],
              ['Net income', r.netIncome],
            ].map(([label, value]) => (
              <Card className="p-5" key={label}>
                <p className="text-sm text-muted-foreground">{label} · AFN</p>
                <p className="mt-2 text-2xl font-semibold">{money(value)}</p>
              </Card>
            ))}
          </div>
          <Panel title="Trial balance">
            <Table
              headings={[
                'Account',
                'Type',
                'Opening (Dr − Cr)',
                'Debits',
                'Credits',
                'Closing (Dr − Cr)',
              ]}
            >
              {r.accounts.map((a) => (
                <tr key={a.accountId}>
                  <Cell>
                    {a.code} · {a.name}
                  </Cell>
                  <Cell>{a.type}</Cell>
                  <Cell>{money(a.opening)}</Cell>
                  <Cell>{money(a.debit)}</Cell>
                  <Cell>{money(a.credit)}</Cell>
                  <Cell>{money(a.closing)}</Cell>
                </tr>
              ))}
            </Table>
            <p
              className={
                r.balanced
                  ? 'text-sm text-muted-foreground'
                  : 'text-sm text-destructive'
              }
            >
              Period debits {money(r.debit)} · credits {money(r.credit)} ·{' '}
              {r.balanced ? 'Balanced' : 'Out of balance'} · Closing debit{' '}
              {money(r.closingDebit)} · closing credit {money(r.closingCredit)}
            </p>
          </Panel>
          <Panel title={`Balance sheet as of ${displayDate(to)}`}>
            <Table headings={['Category', 'AFN']}>
              {[
                ['Assets', r.assets],
                ['Liabilities', r.liabilities],
                ['Equity accounts', r.equity],
                ['Unclosed cumulative profit / loss', r.retainedResult],
                ['Balance check (must be zero)', r.balanceSheetDifference],
              ].map(([label, value]) => (
                <tr key={label}>
                  <Cell>{label}</Cell>
                  <Cell>{money(value)}</Cell>
                </tr>
              ))}
            </Table>
          </Panel>
        </>
      )}
      {account && ledger.data && (
        <Panel title="Account ledger">
          <p className="text-sm">
            Opening {money(ledger.data.opening)} · closing{' '}
            {money(ledger.data.closing)} AFN
          </p>
          <div className="flex gap-3 items-center">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page} · {ledger.data.total} lines
            </span>
            <Button
              variant="outline"
              disabled={!ledger.data.truncated}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
          <Table
            headings={[
              'Date',
              'Journal',
              'Description',
              'Debit',
              'Credit',
              'Balance',
            ]}
          >
            {ledger.data.lines.map((l) => (
              <tr key={l.id}>
                <Cell>{displayDate(l.date)}</Cell>
                <Cell>
                  <button
                    className="underline"
                    onClick={() => setSource(l.journalId)}
                  >
                    {l.number}
                  </button>
                </Cell>
                <Cell>{l.memo}</Cell>
                <Cell>{money(l.debit)}</Cell>
                <Cell>{money(l.credit)}</Cell>
                <Cell>{money(l.balance)}</Cell>
              </tr>
            ))}
          </Table>
          {source && <FinanceSource journalId={source} />}
        </Panel>
      )}
    </div>
  )
}

function Reconciliation({
  data,
  busy,
  perform,
  canWrite,
}: {
  data: FinanceWorkspace
  busy: boolean
  perform: Perform
  canWrite: boolean
}) {
  const [selected, setSelected] = useState(''),
    [creating, setCreating] = useState(false)
  const statement = data.statements.find((s) => s.id === selected)
  const entries = useInfiniteQuery<z.infer<typeof financeLedgerSchema>>({
    queryKey: ['finance', 'reconciliation-entries', statement?.id],
    initialPageParam: 1,
    getNextPageParam: (last) => (last.truncated ? last.page + 1 : undefined),
    queryFn: ({ pageParam }) =>
      apiGet(
        `/finance/ledger?accountId=${statement!.accountId}&from=${data.settings!.cutoverDate}&to=${statement!.endsOn}&page=${pageParam}`,
        financeLedgerSchema,
      ),
    enabled: !!statement,
  })
  return (
    <div className="space-y-5">
      {canWrite && (
        <Button onClick={() => setCreating((v) => !v)}>Add statement</Button>
      )}
      {creating && (
        <StatementEditor
          accounts={data.accounts.filter((a) => a.isCash)}
          busy={busy}
          save={async (v) => {
            const ok = await perform('statements', v)
            if (ok) setCreating(false)
            return ok
          }}
        />
      )}
      <Table
        headings={[
          'Statement',
          'Account',
          'Through',
          'Closing balance',
          'Status',
          '',
        ]}
      >
        {data.statements.map((s) => (
          <tr key={s.id}>
            <Cell>{s.reference}</Cell>
            <Cell>{data.accounts.find((a) => a.id === s.accountId)?.name}</Cell>
            <Cell>{displayDate(s.endsOn)}</Cell>
            <Cell>{money(s.closingBalance)}</Cell>
            <Cell>{s.reconciledAt ? 'Finalized' : 'In progress'}</Cell>
            <Cell>
              <Button variant="outline" onClick={() => setSelected(s.id)}>
                Match entries
              </Button>
            </Cell>
          </tr>
        ))}
      </Table>
      {statement && (
        <Panel title={statement.reference}>
          <p className="text-sm text-muted-foreground">
            Match each statement movement to the same amount in the ledger.
            Positive amounts are deposits; negative amounts are withdrawals.
          </p>
          {entries.hasNextPage && (
            <Button
              variant="outline"
              disabled={entries.isFetchingNextPage}
              onClick={() => void entries.fetchNextPage()}
            >
              Load more ledger entries
            </Button>
          )}
          <Table headings={['Date', 'Description', 'Amount', 'Ledger entry']}>
            {statement.lines.map((line) => (
              <tr key={line.id}>
                <Cell>{displayDate(line.date)}</Cell>
                <Cell>{line.description}</Cell>
                <Cell>{money(line.amount)}</Cell>
                <Cell>
                  <select
                    className={inputClass}
                    aria-label={`Match ${line.description}`}
                    disabled={busy || !canWrite || !!statement.reconciledAt}
                    value={line.journalLineId ?? ''}
                    onChange={(e) => {
                      void perform(`statement-lines/${line.id}/match`, {
                        journalLineId: e.target.value || null,
                      })
                    }}
                  >
                    <option value="">Unmatched</option>
                    {entries.data?.pages
                      .flatMap((p) => p.lines)
                      .filter(
                        (l) =>
                          l.id === line.journalLineId ||
                          (!l.matched &&
                            moneyDecimal(l.debit)
                              .sub(l.credit)
                              .eq(line.amount)),
                      )
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.number} · {displayDate(l.date)} · {l.memo}
                        </option>
                      ))}
                  </select>
                </Cell>
              </tr>
            ))}
          </Table>
          {canWrite && !statement.reconciledAt && (
            <Button
              disabled={busy || statement.lines.some((l) => !l.journalLineId)}
              onClick={() => {
                if (
                  window.confirm(
                    'Finalize this reconciliation? It cannot be edited afterward.',
                  )
                )
                  void perform(`statements/${statement.id}/finalize`, {})
              }}
            >
              Finalize reconciliation
            </Button>
          )}
        </Panel>
      )}
    </div>
  )
}

function StatementEditor({
  accounts,
  busy,
  save,
}: {
  accounts: Account[]
  busy: boolean
  save: (v: Record<string, unknown>) => Promise<boolean>
}) {
  const fields: Field[] = [
    {
      key: 'accountId',
      label: 'Cash / bank account',
      options: accountOptions(accounts),
    },
    { key: 'reference', label: 'Statement reference' },
    {
      key: 'startsOn',
      label: 'First day',
      type: 'date',
      initial: monthStart(),
    },
    { key: 'endsOn', label: 'Last day', type: 'date', initial: today() },
    {
      key: 'openingBalance',
      label: 'Opening balance (AFN)',
      type: 'number',
      initial: '0',
    },
    {
      key: 'closingBalance',
      label: 'Closing balance (AFN)',
      type: 'number',
      initial: '0',
    },
  ]
  const [values, setValues] = useState<Record<string, string>>({})
  const [lines, setLines] = useState([
    { date: today(), description: '', amount: '' },
  ])
  return (
    <Card className="p-5">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save({
            ...Object.fromEntries(
              fields.map((f) => [f.key, values[f.key] ?? f.initial ?? '']),
            ),
            lines,
          })
        }}
      >
        <h2 className="text-lg font-semibold">Enter a cash / bank statement</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {fields.map((f) => (
            <FieldInput
              key={f.key}
              field={f}
              value={values[f.key] ?? f.initial ?? ''}
              onChange={(v) => setValues((old) => ({ ...old, [f.key]: v }))}
            />
          ))}
        </div>
        <Table headings={['Date', 'Description', 'Signed amount (AFN)', '']}>
          {lines.map((line, i) => (
            <tr key={i}>
              {(['date', 'description', 'amount'] as const).map((key) => (
                <Cell key={key}>
                  {key === 'date' ? (
                    <FinanceDateInput
                      aria-label={`Statement date ${i + 1} (Shamsi)`}
                      required
                      value={line.date}
                      onChange={(value) =>
                        setLines((old) =>
                          old.map((l, n) =>
                            n === i ? { ...l, date: value } : l,
                          ),
                        )
                      }
                    />
                  ) : (
                    <Input
                      aria-label={`Statement ${key} ${i + 1}`}
                      required
                      type={key === 'amount' ? 'number' : 'text'}
                      step={key === 'amount' ? '0.01' : undefined}
                      value={line[key]}
                      onChange={(e) =>
                        setLines((old) =>
                          old.map((l, n) =>
                            n === i ? { ...l, [key]: e.target.value } : l,
                          ),
                        )
                      }
                    />
                  )}
                </Cell>
              ))}
              <Cell>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setLines((old) => old.filter((_, n) => n !== i))
                  }
                >
                  Remove
                </Button>
              </Cell>
            </tr>
          ))}
        </Table>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setLines((old) => [
                ...old,
                { date: today(), description: '', amount: '' },
              ])
            }
          >
            Add movement
          </Button>
          <Button disabled={busy} type="submit">
            Save statement
          </Button>
        </div>
      </form>
    </Card>
  )
}

function FiscalPeriods({
  data,
  busy,
  perform,
  canPost,
}: {
  data: FinanceWorkspace
  busy: boolean
  perform: Perform
  canPost: boolean
}) {
  const [year, setYear] = useState(() => {
    const current = utcToShamsi(new Date()).slice(0, 4)
    return data.fiscalYears.some((y) => String(y.year) === current)
      ? current
      : String(data.fiscalYears.at(-1)?.year ?? 1404)
  })
  return (
    <div className="space-y-5">
      <Panel title="Shamsi fiscal years & periods">
        <label className="grid gap-1.5 text-sm">
          Fiscal year
          <select
            aria-label="Fiscal year"
            className={inputClass}
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            {data.fiscalYears.map((y) => (
              <option key={y.id} value={String(y.year)}>
                {y.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-muted-foreground">
          Months run from midnight in Kabul to the start of the next month. All
          dates below use Shamsi.
        </p>
        <Table headings={['Period', 'From', 'Through', 'Status', 'Action']}>
          {data.periods
            .filter((p) => String(p.year) === year)
            .map((p) => (
              <tr key={p.id}>
                <Cell>
                  <strong>{p.label}</strong>
                  <p>{p.name}</p>
                </Cell>
                <Cell>{displayDate(p.startsOn)}</Cell>
                <Cell>{displayDate(p.endsOn)}</Cell>
                <Cell>{p.closedAt ? 'Closed' : 'Open'}</Cell>
                <Cell>
                  <a className="underline" href="/finance?tab=reports">Open closing checklist in Financial reports</a>
                </Cell>
              </tr>
            ))}
        </Table>
        {data.legacyClosedPeriods.length > 0 && (
          <div className="rounded border p-3 text-sm">
            <p>Previously closed date ranges remain closed:</p>
            {data.legacyClosedPeriods.map((p) => (
              <p key={p.name}>
                {p.name}: {displayDate(p.startsOn)} — {displayDate(p.endsOn)}
              </p>
            ))}
          </div>
        )}
      </Panel>
      {canPost && (
        <SimpleForm
          title="Create a Shamsi fiscal year"
          fields={[
            {
              key: 'year',
              label: 'Shamsi year (1350–1499)',
              initial: String(Number(year) + 1),
            },
          ]}
          submit="Create all 12 periods"
          busy={busy}
          onSubmit={async (v) => {
            const ok = await perform('fiscal-years', { year: Number(v.year) })
            if (ok) setYear(v.year)
            return ok
          }}
        />
      )}
    </div>
  )
}
