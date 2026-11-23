import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import {
  inventoryDashboardSchema,
  movementPageSchema,
  receiptPackSchema,
  priceForUnits,
  unitsPerPack,
  packetEquivalent,
  type ReceiptPack,
  type PackBasis,
} from '@redmars/shared'
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
      {query.isError && (
        <p role="status">Refresh failed. Showing the last available inventory counts.</p>
      )}
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

function packFromForm(form: HTMLFormElement) {
  const f = new FormData(form)
  const receivedAs = f.get('receivedAs')
  const sellBy = f.get('sellBy')
  const looseOnly = receivedAs === 'unit' && sellBy === 'unit'
  return receiptPackSchema.safeParse({
    unitName: f.get('unitName'),
    receivedAs,
    sellBy,
    receivedCount: Number(f.get('receivedCount')),
    unitsPerPacket: Number(f.get('unitsPerPacket') || (looseOnly ? 1 : 0)),
    packetsPerBox: f.get('packetsPerBox') ? Number(f.get('packetsPerBox')) : null,
    purchasePrice: f.get('purchasePrice'),
    sellPrice: f.get('sellPrice'),
  })
}

function ReceiptPrices({ pack }: { pack: ReceiptPack }) {
  const boughtSize = unitsPerPack(pack.receivedAs, pack)
  const soldSize = unitsPerPack(pack.sellBy, pack)
  return (
    <div className="rounded border p-2 text-sm">
      <p>
        Received {pack.receivedCount} × {pack.receivedAs} ({pack.receivedCount * boughtSize} ×{' '}
        {pack.unitName})
      </p>
      <p>Purchase total: {priceForUnits(pack.purchasePrice, 1, pack.receivedCount)} AFN</p>
      <table className="mt-1 w-full text-start">
        <thead>
          <tr>
            <th scope="col" className="text-start">
              Basis
            </th>
            <th scope="col">Buy (AFN)</th>
            <th scope="col">Sell (AFN)</th>
          </tr>
        </thead>
        <tbody>
          {(['unit', 'packet', 'box'] as const)
            .filter(
              (b) =>
                b === 'unit' ||
                (b === 'packet' ? pack.unitsPerPacket > 1 : pack.packetsPerBox !== null),
            )
            .map((b) => {
              const size = unitsPerPack(b, pack)
              return (
                <tr key={b}>
                  <th scope="row" className="text-start">
                    {b === 'unit' ? pack.unitName : b + ' (' + size + ')'}
                  </th>
                  <td className="text-center">
                    {priceForUnits(pack.purchasePrice, boughtSize, size)}
                  </td>
                  <td className="text-center">{priceForUnits(pack.sellPrice, soldSize, size)}</td>
                </tr>
              )
            })}
        </tbody>
      </table>
    </div>
  )
}

function StockDetail({ drug, data, manage }: { drug: Drug; data: Dashboard; manage: boolean }) {
  const client = useQueryClient()
  const [key, setKey] = useState(() => crypto.randomUUID())
  const [message, setMessage] = useState('')
  const [receivedAs, setReceivedAs] = useState<PackBasis>('box')
  const [sellBy, setSellBy] = useState<PackBasis>('packet')
  const [preview, setPreview] = useState<ReceiptPack | null>(null)
  const [receiptError, setReceiptError] = useState('')
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      apiPost(root + path, body, success),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['inventory'] }),
        client.invalidateQueries({ queryKey: ['inventory-history'] }),
        client.invalidateQueries({ queryKey: ['stock-availability'] }),
        client.invalidateQueries({ queryKey: ['pharmacy', 'prescription'] }),
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
          {b.packaging && (
            <details>
              <summary>Packaging and prices</summary>
              <p>
                {b.packaging.unitsPerPacket} × {b.packaging.unitName} per packet
                {b.packaging.packetsPerBox &&
                  ' · ' + b.packaging.packetsPerBox + ' packets per box'}
              </p>
              <p>
                On hand:{' '}
                {packetEquivalent(b.quantity, b.packaging.unitsPerPacket, b.packaging.unitName)}
              </p>
              <ReceiptPrices pack={b.packaging} />
            </details>
          )}
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
              onChange={(e) => {
                const parsed = packFromForm(e.currentTarget)
                setPreview(parsed.success ? parsed.data : null)
                setReceiptError('')
              }}
              onSubmit={async (e) => {
                e.preventDefault()
                const form = e.currentTarget
                const f = new FormData(form)
                const parsed = packFromForm(form)
                if (!parsed.success) {
                  setReceiptError(parsed.error.issues[0].message)
                  return
                }
                const pack = parsed.data
                const quantity = pack.receivedCount * unitsPerPack(pack.receivedAs, pack)
                if (quantity > 1000000000) {
                  setReceiptError('Received units exceed the stock limit.')
                  return
                }
                if (
                  await submit(
                    '/receipts',
                    {
                      drugId: drug.id,
                      receiptKey: key,
                      lot: f.get('lot'),
                      location: f.get('location'),
                      expiresOn: f.get('expiresOn'),
                      quantity,
                      packaging: pack,
                      supplierId: f.get('supplier') || null,
                    },
                    'Stock received.',
                  )
                ) {
                  form.reset()
                  setPreview(null)
                  setReceivedAs('box')
                  setSellBy('packet')
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
              <fieldset className="grid gap-2 rounded border p-3 sm:grid-cols-2">
                <legend className="px-1 font-medium">Package contents</legend>
                <label>
                  Dispensing unit
                  <Input
                    name="unitName"
                    defaultValue={drug.dispensingUnit ?? ''}
                    readOnly={!!drug.dispensingUnit}
                    placeholder="Tablet, capsule, vial…"
                    maxLength={32}
                    required
                  />
                </label>
                <label>
                  Units per packet
                  <Input
                    name="unitsPerPacket"
                    type="number"
                    min={1}
                    max={1000000000}
                    required={receivedAs !== 'unit' || sellBy !== 'unit'}
                  />
                </label>
                <label>
                  Packets per box
                  <Input
                    name="packetsPerBox"
                    type="number"
                    min={1}
                    max={1000000000}
                    required={receivedAs === 'box' || sellBy === 'box'}
                  />
                </label>
              </fieldset>
              <fieldset className="grid gap-2 rounded border p-3 sm:grid-cols-2">
                <legend className="px-1 font-medium">Purchase</legend>
                <label>
                  Received as{' '}
                  <select
                    className={selectClass}
                    name="receivedAs"
                    value={receivedAs}
                    onChange={(e) => setReceivedAs(e.target.value as PackBasis)}
                  >
                    <option value="box">Boxes</option>
                    <option value="packet">Packets</option>
                    <option value="unit">Loose units</option>
                  </select>
                </label>
                <label>
                  Number received
                  <Input name="receivedCount" type="number" min={1} max={1000000000} required />
                </label>
                <label>
                  Buy price per {receivedAs} (AFN)
                  <Input type="number" name="purchasePrice" min="0" step="0.01" required />
                </label>
              </fieldset>
              <fieldset className="grid gap-2 rounded border p-3 sm:grid-cols-2">
                <legend className="px-1 font-medium">Retail</legend>
                <label>
                  Sell by{' '}
                  <select
                    className={selectClass}
                    name="sellBy"
                    value={sellBy}
                    onChange={(e) => setSellBy(e.target.value as PackBasis)}
                  >
                    <option value="packet">Packet</option>
                    <option value="box">Box</option>
                    <option value="unit">Loose unit</option>
                  </select>
                </label>
                <label>
                  Sell price per {sellBy} (AFN)
                  <Input type="number" name="sellPrice" min="0" step="0.01" required />
                </label>
              </fieldset>
              {preview && <ReceiptPrices pack={preview} />}
              {receiptError && <p role="alert">{receiptError}</p>}
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
          {m.packaging && (
            <span className="block">
              Bought {m.packaging.receivedCount} × {m.packaging.receivedAs} at{' '}
              {m.packaging.purchasePrice} AFN each · Retail {m.packaging.sellPrice} AFN/
              {m.packaging.sellBy} · {m.packaging.unitsPerPacket} units/packet
              {m.packaging.packetsPerBox && ' · ' + m.packaging.packetsPerBox + ' packets/box'}
            </span>
          )}
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
