import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, Boxes, CalendarClock, ListFilter, PackageMinus, PackageX, Pill, Search } from 'lucide-react'
import { CatalogPagination } from '@/components/CatalogPagination'
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
const selectClass = 'w-full rounded-lg border border-input bg-background px-3 py-2 focus-visible:outline-ring'
const pageSize = 15

export function InventoryPage() {
  const { roles, user } = useAuth()
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState('')
  const [page, setPage] = useState(1)
  const lastOpened = useRef('')
  useEffect(() => {
    if (selected) document.getElementById('inventory-drug-heading')?.focus()
    else if (lastOpened.current) document.getElementById('inventory-row-' + lastOpened.current)?.focus()
  }, [selected])
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
  const filters = [
    { id: 'all', icon: Boxes, count: data.drugs.length },
    { id: 'available', icon: Pill, count: data.drugs.filter(d => d.available > 0).length },
    { id: 'out', icon: PackageX, count: data.drugs.filter(d => d.available === 0).length },
    { id: 'low', icon: PackageMinus, count: data.drugs.filter(d => d.available > 0 && d.available <= d.reorderThreshold).length },
    { id: 'expiry', icon: CalendarClock, count: data.drugs.filter(d => expiryAlert(d, data.expiryLimit)).length },
  ]
  const term = search.trim().toLocaleLowerCase()
  const rows = data.drugs.filter(d => {
    if (filter === 'available' && d.available <= 0) return false
    if (filter === 'out' && d.available !== 0) return false
    if (filter === 'low' && (d.available === 0 || d.available > d.reorderThreshold)) return false
    if (filter === 'expiry' && !expiryAlert(d, data.expiryLimit)) return false
    return d.name.toLocaleLowerCase().includes(term) || d.batches.some(b =>
      [b.lot, b.supplier].some(value => value?.toLocaleLowerCase().includes(term)))
  })
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)))
  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 pb-8">
      {query.isError && <p role="status" className="rounded-xl bg-warning/10 p-3">{t('inventoryUi.stale')}</p>}
      {drug ? <>
        <Button type="button" variant="ghost" onClick={() => setSelected('')}>
          <ArrowLeft className="size-4 rtl:rotate-180" />{t('nav.inventory')}
        </Button>
        <StockDetail key={drug.id} drug={drug} data={data} manage={roles.includes('admin') || roles.includes('pharmacist')} />
      </> : <>
        <h1 className="text-3xl font-semibold tracking-tight">{t('nav.inventory')}</h1>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {filters.map(({ id, icon: Icon, count }) => (
            <button key={id} type="button" aria-pressed={filter === id}
              onClick={() => { setFilter(id); setPage(1) }}
              className="rounded-2xl border bg-card p-4 text-start transition-colors hover:border-primary/60 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-primary/5 sm:p-5">
              <span className="flex items-center justify-between gap-2">
                <span className="text-3xl font-semibold tabular-nums">{count}</span>
                <Icon aria-hidden className="size-5 text-muted-foreground" />
              </span>
              <span className="mt-2 block text-sm font-medium">{t('inventoryUi.' + id)}</span>
            </button>
          ))}
        </div>
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><ListFilter className="size-5 text-primary" />{t('inventoryUi.directory')}</h2>
            <label className="relative w-full sm:w-80">
              <Search aria-hidden className="absolute start-3 top-3 size-4 text-muted-foreground" />
              <Input className="h-10 ps-9" value={search} aria-label={t('inventoryUi.search')} placeholder={t('inventoryUi.search')}
                onChange={e => { setSearch(e.target.value); setPage(1) }} />
            </label>
          </div>
          <div className="hidden grid-cols-[2fr_1fr_1fr_1rem] gap-4 border-b bg-muted/50 px-6 py-3 text-sm font-medium text-muted-foreground sm:grid">
            <span>{t('inventoryUi.medicine')}</span><span>{t('inventoryUi.availability')}</span><span>{t('inventoryUi.nextExpiry')}</span>
          </div>
          {rows.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(d => {
            const expiry = d.batches.reduce<string | null>((first, batch) =>
              batch.quantity > 0 && !batch.quarantined && (!first || batch.expiresOn < first) ? batch.expiresOn : first, null)
            return <button key={d.id} type="button" id={'inventory-row-' + d.id}
              className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 border-b px-4 py-4 text-start hover:bg-muted/50 focus-visible:outline-ring focus-visible:-outline-offset-2 sm:grid-cols-[2fr_1fr_1fr_1rem] sm:px-6"
              onClick={() => { lastOpened.current = d.id; setSelected(d.id) }}>
              <span className="flex min-w-0 items-center gap-3"><Pill aria-hidden className="size-5 shrink-0 text-primary" /><strong className="break-words font-medium">{d.name}</strong></span>
              <span><StockBadge stock={d} /></span>
              <span className="text-sm tabular-nums text-muted-foreground"><span className="sm:hidden">{t('inventoryUi.nextExpiry')} · </span>{expiry ?? '—'}</span>
              <ArrowRight aria-hidden className="size-4 justify-self-end text-muted-foreground rtl:rotate-180" />
            </button>
          })}
          {!rows.length && <p className="p-8 text-center text-muted-foreground">{t('inventoryUi.empty')}</p>}
          {rows.length > pageSize && <div className="p-4"><CatalogPagination page={currentPage} pageSize={pageSize} total={rows.length} onChange={setPage} /></div>}
        </section>
      </>}
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
    <div className="space-y-2 rounded-xl border bg-muted/30 p-4 text-sm tabular-nums sm:col-span-2">
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
  const { t } = useTranslation()
  const [section, setSection] = useState('batches')
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
    <section className="space-y-5">
      <header className="rounded-2xl border border-s-primary border-s-4 bg-card p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 id="inventory-drug-heading" tabIndex={-1} className="text-2xl font-semibold tracking-tight">{drug.name}</h1>
          <StockBadge stock={drug} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t('inventoryUi.reorder', { count: drug.reorderThreshold })}</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {(manage ? ['batches', 'receive', 'movements', 'settings'] : ['batches', 'movements']).map(id =>
          <Button key={id} type="button" aria-pressed={section === id} variant={section === id ? 'default' : 'outline'}
            className="min-h-10" onClick={() => setSection(id)}>{t('inventoryUi.' + id)}</Button>)}
      </div>
      <div hidden={section !== 'batches'} className="space-y-4 rounded-2xl border bg-card p-5 sm:p-7">
      <h2 className="text-lg font-semibold">{t('inventoryUi.batches')}</h2>
      {!drug.batches.length && <p>No units on hand.</p>}
      {drug.batches.map((b) => (
        <div key={b.id} className="space-y-3 rounded-xl border bg-background p-4 text-sm [&_summary]:cursor-pointer [&_summary]:py-1 [&_summary]:font-medium">
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
          {manage && (
            <details>
              <summary>Adjust stock</summary>
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={async e => {
                e.preventDefault()
                const form = e.currentTarget
                const fields = new FormData(form)
                const delta = Number(fields.get('quantity')) * Number(fields.get('direction'))
                const reason = String(fields.get('reason')).trim()
                const signature = JSON.stringify([delta, reason])
                if (form.dataset.signature !== signature) {
                  form.dataset.reference = crypto.randomUUID()
                  form.dataset.signature = signature
                }
                if (await submit('/batches/' + b.id + '/adjustments',
                  { reference: form.dataset.reference, delta, reason }, 'Stock adjusted.')) {
                  delete form.dataset.signature
                  form.reset()
                }
              }}>
                <label>Action<select name="direction" className="block rounded border p-2"><option value="1">Add stock</option><option value="-1">Remove stock</option></select></label>
                <label>Quantity ({drug.dispensingUnit || 'units'})<Input name="quantity" type="number" min="1" max="1000000000" step="1" required /></label>
                <label>Reason<Input name="reason" required maxLength={250} placeholder="e.g. Damaged during handling" /></label>
                <Button type="submit" className="self-end" disabled={action.isPending}>Save adjustment</Button>
              </form>
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
      </div>
      {section === 'movements' && <MovementHistory drugId={drug.id} />}
      {manage && (
        <>
          <div hidden={section !== 'receive'} className="rounded-2xl border bg-card p-5 sm:p-7">
            <h2 className="mb-4 text-xl font-semibold">{t('inventoryUi.receive')}</h2>
            <form
              className="grid gap-5 sm:grid-cols-2 [&_label]:grid [&_label]:content-start [&_label]:gap-2 [&_label]:text-sm [&_label]:font-medium [&>button]:w-fit [&>button]:self-end"
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
              <fieldset className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:col-span-2 sm:grid-cols-3">
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
              <fieldset className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:col-span-2 sm:grid-cols-2 xl:col-span-1">
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
              <fieldset className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:col-span-2 sm:grid-cols-2 xl:col-span-1">
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

              <Button type="submit" disabled={action.isPending}>
                Record receipt
              </Button>
            </form>
          </div>
          <div hidden={section !== 'settings'} className="rounded-2xl border bg-card p-5 sm:p-7">
            <h2 className="mb-4 text-xl font-semibold">{t('inventoryUi.settings')}</h2>
            <form
              className="grid gap-5 sm:grid-cols-2 [&_label]:grid [&_label]:content-start [&_label]:gap-2 [&_label]:text-sm [&_label]:font-medium [&>button]:w-fit [&>button]:self-end"
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
          </div>
        </>
      )}
      {action.isError && (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">{serverMessage(action.error) ?? 'Could not save. Please retry.'}</p>
      )}
      {message && <p role="status" className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">{message}</p>}
    </section>
  )
}

function MovementHistory({ drugId }: { drugId: string }) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [cursor, setCursor] = useState('')
  const query = useQuery({
    queryKey: ['inventory-history', user?.id, drugId, cursor],

    queryFn: () =>
      apiGet(
        root + '/drugs/' + drugId + '/movements' + (cursor ? '?cursor=' + cursor : ''),
        movementPageSchema,
      ),
  })
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5 sm:p-7">
      <h2 className="text-lg font-semibold">{t('inventoryUi.movements')}</h2>
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
    </section>
  )
}
