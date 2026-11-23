import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { inventoryDashboardSchema, movementPageSchema } from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { apiGet, apiPost, serverMessage } from '@/lib/api'
import { StockBadge } from '@/components/StockAvailability'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Dashboard = z.infer<typeof inventoryDashboardSchema>
type Drug = Dashboard['drugs'][number]
const root = '/pharmacy/inventory'
const success = z.object({ ok: z.boolean() })
const expiryAlert = (d: Drug, limit: string) =>
  d.batches.some((b) => b.quantity > 0 && !b.quarantined && b.expiresOn <= limit)
const selectClass = 'rounded border border-input bg-background px-2 py-1'

export function InventoryPage() {
  const { roles, user } = useAuth()
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState('')
  const query = useQuery({
    queryKey: ['inventory', user?.id],
    queryFn: () => apiGet(root, inventoryDashboardSchema),
    refetchInterval: 15000,
  })
  const data = query.data
  const drug = data?.drugs.find((d) => d.id === selected)
  if (query.isError && !data)
    return (
      <p role="alert">
        {serverMessage(query.error) ?? 'Inventory unavailable.'}{' '}
        <Button onClick={() => query.refetch()}>Retry</Button>
      </p>
    )
  if (!data) return <p>Loading inventory…</p>
  const shortages = data.drugs.filter((d) => d.available <= d.reorderThreshold)
  const expiring = data.drugs.filter((d) => expiryAlert(d, data.expiryLimit))
  const rows = (
    filter === 'stock' ? shortages : filter === 'expiry' ? expiring : data.drugs
  ).filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
  return (
    <main className="space-y-5 p-4">
      <h1 className="text-2xl font-semibold">{t('nav.inventory')}</h1>
      {query.isError && <p role="status">Refresh failed. Showing the last available inventory counts.</p>}
      <div className="flex flex-wrap gap-2">
        {[
          ['all', 'All medications', data.drugs.length],
          ['stock', 'Low or out of stock', shortages.length],
          ['expiry', 'Expired or due within 30 days', expiring.length],
        ].map(([value, label, count]) => (
          <Button
            key={value}
            aria-pressed={filter === value}
            variant={filter === value ? 'default' : 'outline'}
            onClick={() => setFilter(String(value))}
          >
            {label} ({count})
          </Button>
        ))}
      </div>
      <Input
        aria-label="Search medications"
        placeholder="Search medications"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="max-h-[70vh] overflow-auto rounded border">
          {rows.map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={selected === d.id}
              className="flex w-full items-center justify-between gap-2 border-b p-3 text-start hover:bg-muted aria-pressed:bg-muted"
              onClick={() => setSelected(d.id)}
            >
              <span>{d.name}</span>
              <StockBadge stock={d} />
            </button>
          ))}
          {!rows.length && <p className="p-3">No matching medications.</p>}
        </section>
        {drug && (
          <StockDetail
            key={drug.id}
            drug={drug}
            data={data}
            manage={roles.includes('admin') || roles.includes('pharmacist')}
          />
        )}
      </div>
    </main>
  )
}

function StockDetail({ drug, data, manage }: { drug: Drug; data: Dashboard; manage: boolean }) {
  const client = useQueryClient()
  const [key, setKey] = useState(() => crypto.randomUUID())
  const [message, setMessage] = useState('')
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      apiPost(root + path, body, success),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['inventory'] }),
        client.invalidateQueries({ queryKey: ['inventory-history'] }),
        client.invalidateQueries({ queryKey: ['stock-availability'] }),
      ])
    },
  })
  async function submit(path: string, body: unknown, done: string) {
    setMessage('')
    try {
      await action.mutateAsync({ path, body })
      setMessage(done)
      return true
    } catch {
      return false
    }
  }
  return (
    <section className="space-y-4 rounded border p-4">
      <h2 className="text-lg font-semibold">{drug.name}</h2>
      <div>
        <StockBadge stock={drug} /> · Reorder at {drug.reorderThreshold} units
      </div>
      <h3 className="font-medium">Batches</h3>
      {!drug.batches.length && <p>No units on hand.</p>}
      {drug.batches.map((b) => (
        <div key={b.id} className="space-y-1 border-b pb-2 text-sm">
          <p>
            <strong>{b.lot}</strong> · {b.quantity} units · {b.location}
          </p>
          <p>
            {b.supplier ?? 'Supplier unspecified'} · Expires {b.expiresOn}
            {b.quarantined
              ? ' · Quarantined'
              : b.expiresOn < data.today
                ? ' · Expired'
                : b.expiresOn <= data.expiryLimit
                  ? ' · Expiring soon'
                  : ''}
          </p>
          {manage && !b.quarantined && b.quantity > 0 && (
            <details>
              <summary>Quarantine batch</summary>
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const reason = new FormData(e.currentTarget).get('reason')
                  await submit('/batches/' + b.id + '/quarantine', { reason }, 'Batch quarantined.')
                }}
              >
                <Input
                  required
                  name="reason"
                  maxLength={250}
                  aria-label="Quarantine reason"
                  placeholder="Reason"
                />
                <Button type="submit" disabled={action.isPending}>
                  Confirm quarantine
                </Button>
              </form>
            </details>
          )}
        </div>
      ))}
      <MovementHistory drugId={drug.id} />
      {manage && (
        <>
          <details>
            <summary>Receive stock</summary>
            <form
              className="grid gap-2 pt-2"
              onSubmit={async (e) => {
                e.preventDefault()
                const form = e.currentTarget
                const f = new FormData(form)
                if (
                  await submit(
                    '/receipts',
                    {
                      drugId: drug.id,
                      receiptKey: key,
                      lot: f.get('lot'),
                      location: f.get('location'),
                      expiresOn: f.get('expiresOn'),
                      quantity: Number(f.get('quantity')),
                      supplierId: f.get('supplier') || null,
                    },
                    'Stock received.',
                  )
                ) {
                  form.reset()
                  setKey(crypto.randomUUID())
                }
              }}
            >
              <label>
                Batch number
                <Input name="lot" maxLength={100} required />
              </label>
              <label>
                Storage location
                <Input name="location" maxLength={100} defaultValue="Main pharmacy" required />
              </label>
              <label>
                Expiration date
                <Input type="date" name="expiresOn" required />
              </label>
              <label>
                Units received
                <Input type="number" min={1} max={1000000000} name="quantity" required />
              </label>
              <label>
                Supplier{' '}
                <select className={selectClass} name="supplier">
                  <option value="">Unspecified</option>
                  {data.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" disabled={action.isPending}>
                Record receipt
              </Button>
            </form>
          </details>
          <details>
            <summary>Reorder threshold and approved alternatives</summary>
            <form
              className="grid gap-2 pt-2"
              onSubmit={async (e) => {
                e.preventDefault()
                const f = new FormData(e.currentTarget)
                await submit(
                  '/drugs/' + drug.id + '/settings',
                  {
                    reorderThreshold: Number(f.get('threshold')),
                    alternativeIds: f.getAll('alternative'),
                  },
                  'Settings saved.',
                )
              }}
            >
              <label>
                Reorder threshold (units)
                <Input
                  name="threshold"
                  type="number"
                  min={0}
                  max={1000000000}
                  defaultValue={drug.reorderThreshold}
                  required
                />
              </label>
              <label>
                Clinically approved alternatives{' '}
                <select
                  multiple
                  name="alternative"
                  className={selectClass}
                  defaultValue={drug.alternativeIds}
                >
                  {data.drugs
                    .filter((d) => d.id !== drug.id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </label>
              <Button type="submit" disabled={action.isPending}>
                Save settings
              </Button>
            </form>
          </details>
        </>
      )}
      {action.isError && (
        <p role="alert">{serverMessage(action.error) ?? 'Could not save. Please retry.'}</p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  )
}

function MovementHistory({ drugId }: { drugId: string }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState('')
  const query = useQuery({
    queryKey: ['inventory-history', user?.id, drugId, cursor],
    enabled: open,
    queryFn: () =>
      apiGet(
        root + '/drugs/' + drugId + '/movements' + (cursor ? '?cursor=' + cursor : ''),
        movementPageSchema,
      ),
  })
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Stock movement history</summary>
      {query.isLoading && <p>Loading movements…</p>}
      {query.isError && <p role="alert">Could not load movements.</p>}
      {query.data?.movements.map((m) => (
        <p key={m.id} className="border-b py-2 text-sm">
          {new Date(m.at).toLocaleString()} · {m.kind} · {m.quantity} units · {m.lot} · {m.location}{' '}
          {m.reason && ' · ' + m.reason}
        </p>
      ))}
      {query.data?.movements.length === 0 && <p>No movements recorded.</p>}
      {cursor && <Button onClick={() => setCursor('')}>Latest</Button>}
      {query.data?.next && (
        <Button onClick={() => setCursor(query.data!.next!)}>Older movements</Button>
      )}
    </details>
  )
}
