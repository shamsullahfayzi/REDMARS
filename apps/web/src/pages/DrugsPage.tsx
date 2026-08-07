import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Search } from 'lucide-react'
import {
  createDrugRequestSchema,
  updateDrugRequestSchema,
  type DrugSummary,
  type ImportDrugsResponse,
} from '@redmars/shared'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCreateDrug, useDrugs, useImportDrugs, useSetDrugActive, useUpdateDrug } from '@/hooks/useDrugs'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'

/**
 * Drug formulary (task 2.4). Visible to admin and pharmacist. Create one at a time,
 * import many by pasting CSV, and search the catalogue by code / generic / brand.
 */
export function DrugsPage() {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const drugsQuery = useDrugs(q)

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.drugs')} description={t('drugs.subtitle')} />

      <ImportDrugs />
      <CreateDrugForm />

      {/* List */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium text-foreground">{t('drugs.list.title')}</h2>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('drugs.list.search')}
              className="ps-9"
            />
          </div>
        </div>

        {drugsQuery.isPending && <p className="text-muted-foreground">{t('drugs.list.loading')}</p>}
        {drugsQuery.isError && <p className="text-destructive">{t('drugs.list.error')}</p>}

        {drugsQuery.data &&
          (drugsQuery.data.drugs.length === 0 ? (
            <p className="text-muted-foreground">
              {q ? t('drugs.list.noMatches') : t('drugs.list.empty')}
            </p>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="w-10 p-3" />
                    <th className="p-3 text-start font-medium">{t('drugs.list.code')}</th>
                    <th className="p-3 text-start font-medium">{t('drugs.list.genericName')}</th>
                    <th className="p-3 text-start font-medium">{t('drugs.list.strength')}</th>
                    <th className="p-3 text-start font-medium">{t('drugs.list.form')}</th>
                    <th className="p-3 text-end font-medium">{t('drugs.list.sellPrice')}</th>
                    <th className="p-3 text-start font-medium">{t('drugs.list.status')}</th>
                    <th className="p-3 text-end font-medium">{t('drugs.list.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {drugsQuery.data.drugs.map((drug) => (
                    <DrugRow key={drug.id} drug={drug} />
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        {drugsQuery.data && drugsQuery.data.drugs.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t('drugs.list.count', { count: drugsQuery.data.drugs.length })}
          </p>
        )}
      </section>
    </div>
  )
}

// --- CSV import --------------------------------------------------------------

function ImportDrugs() {
  const { t } = useTranslation()
  const importDrugs = useImportDrugs()
  const [csv, setCsv] = useState('')
  const [result, setResult] = useState<ImportDrugsResponse | null>(null)

  function onImport() {
    setResult(null)
    importDrugs.mutate(csv, {
      onSuccess: (res) => {
        setResult(res)
        if (res.errors.length === 0) setCsv('')
      },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('drugs.import.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t('drugs.import.hint')}</p>
        <code className="block overflow-x-auto rounded-lg bg-muted px-3 py-2 text-xs text-foreground" dir="ltr">
          code,genericName,brandName,strength,form,isControlled,sellPrice
        </code>
        <Textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={6}
          dir="ltr"
          placeholder={'code,genericName,strength,form,sellPrice\nPARA500,Paracetamol,500mg,tablet,25'}
          className="font-mono"
        />
        <div className="flex items-center gap-3">
          <Button onClick={onImport} disabled={importDrugs.isPending || csv.trim() === ''}>
            {importDrugs.isPending ? t('drugs.import.importing') : t('drugs.import.submit')}
          </Button>
          {importDrugs.isError && (
            <span className="text-sm text-destructive">{t('drugs.import.failed')}</span>
          )}
        </div>

        {result && (
          <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
            <p className="text-foreground">
              {t('drugs.import.result', {
                imported: formatNumber(result.imported),
                skipped: formatNumber(result.skipped),
              })}
            </p>
            {result.errors.length > 0 && (
              <ul className="space-y-0.5 text-destructive">
                {result.errors.map((err) => (
                  <li key={err.line}>
                    {t('drugs.import.errorLine', { line: err.line })}: {err.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// --- Create ------------------------------------------------------------------

function CreateDrugForm() {
  const { t } = useTranslation()
  const createDrug = useCreateDrug()

  const [code, setCode] = useState('')
  const [genericName, setGenericName] = useState('')
  const [brandName, setBrandName] = useState('')
  const [atcCode, setAtcCode] = useState('')
  const [strength, setStrength] = useState('')
  const [form, setForm] = useState('')
  const [defaultRoute, setDefaultRoute] = useState('')
  const [defaultFreq, setDefaultFreq] = useState('')
  const [defaultDuration, setDefaultDuration] = useState('')
  const [isControlled, setIsControlled] = useState(false)
  const [sellPrice, setSellPrice] = useState('')
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setCode('')
    setGenericName('')
    setBrandName('')
    setAtcCode('')
    setStrength('')
    setForm('')
    setDefaultRoute('')
    setDefaultFreq('')
    setDefaultDuration('')
    setIsControlled(false)
    setSellPrice('')
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const parsed = createDrugRequestSchema.safeParse({
      code,
      genericName,
      brandName,
      atcCode,
      strength,
      form,
      defaultRoute,
      defaultFreq,
      defaultDuration,
      isControlled,
      sellPrice,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('drugs.create.invalid'))
      return
    }

    createDrug.mutate(parsed.data, {
      onSuccess: resetForm,
      onError: (err) => {
        setError(
          err instanceof ApiError && err.status === 409
            ? t('drugs.create.duplicate')
            : t('drugs.create.failed'),
        )
      },
    })
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t('drugs.create.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="d-code">{t('drugs.create.code')}</Label>
              <Input id="d-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-generic">{t('drugs.create.genericName')}</Label>
              <Input
                id="d-generic"
                value={genericName}
                onChange={(e) => setGenericName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="d-brand">{t('drugs.create.brandName')}</Label>
              <Input id="d-brand" value={brandName} onChange={(e) => setBrandName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-atc">{t('drugs.create.atcCode')}</Label>
              <Input id="d-atc" value={atcCode} onChange={(e) => setAtcCode(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="d-strength">{t('drugs.create.strength')}</Label>
              <Input
                id="d-strength"
                value={strength}
                onChange={(e) => setStrength(e.target.value)}
                placeholder="500mg"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-form">{t('drugs.create.form')}</Label>
              <Input
                id="d-form"
                value={form}
                onChange={(e) => setForm(e.target.value)}
                placeholder="tablet"
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{t('drugs.create.defaultsHint')}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="d-route">{t('drugs.create.defaultRoute')}</Label>
                <Input
                  id="d-route"
                  value={defaultRoute}
                  onChange={(e) => setDefaultRoute(e.target.value)}
                  placeholder="oral"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d-freq">{t('drugs.create.defaultFreq')}</Label>
                <Input
                  id="d-freq"
                  value={defaultFreq}
                  onChange={(e) => setDefaultFreq(e.target.value)}
                  placeholder="OD"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d-duration">{t('drugs.create.defaultDuration')}</Label>
                <Input
                  id="d-duration"
                  value={defaultDuration}
                  onChange={(e) => setDefaultDuration(e.target.value)}
                  placeholder="1 month"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="d-price">{t('drugs.create.sellPrice')}</Label>
              <Input
                id="d-price"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                inputMode="decimal"
                dir="ltr"
                className="font-mono"
                placeholder={t('drugs.create.sellPricePlaceholder')}
              />
              <p className="text-xs text-muted-foreground">{t('drugs.create.sellPriceHint')}</p>
            </div>
            <label className="flex items-center gap-2 self-end pb-6 text-sm text-foreground">
              <input
                type="checkbox"
                checked={isControlled}
                onChange={(e) => setIsControlled(e.target.checked)}
              />
              {t('drugs.create.isControlled')}
            </label>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={createDrug.isPending}>
            {createDrug.isPending ? t('drugs.create.submitting') : t('drugs.create.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// --- List row + inline editor ------------------------------------------------

function DrugRow({ drug }: { drug: DrugSummary }) {
  const { t } = useTranslation()
  const setActive = useSetDrugActive()
  const [isEditing, setIsEditing] = useState(false)

  return (
    <>
      <tr className="border-b border-border last:border-0">
        <td className="p-3">
          <button
            type="button"
            onClick={() => setIsEditing((v) => !v)}
            aria-expanded={isEditing}
            aria-label={t('drugs.edit.toggle')}
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                'size-4 transition-transform rtl:rotate-180',
                isEditing && 'rotate-90 rtl:rotate-90',
              )}
            />
          </button>
        </td>
        <td className="p-3 font-mono text-foreground">{drug.code}</td>
        <td className="p-3 text-foreground">
          <div className="flex items-center gap-2">
            {drug.genericName}
            {drug.isControlled && <Badge variant="outline">{t('drugs.list.controlled')}</Badge>}
          </div>
          {drug.brandName && <div className="text-xs text-muted-foreground">{drug.brandName}</div>}
        </td>
        <td className="p-3 text-muted-foreground">{drug.strength ?? '—'}</td>
        <td className="p-3 text-muted-foreground">{drug.form ?? '—'}</td>
        <td className="p-3 text-end font-mono" dir="ltr">
          {drug.sellPrice ? (
            <span className="text-foreground">{drug.sellPrice}</span>
          ) : (
            <span className="text-warning" title={t('drugs.list.noPriceHint')}>
              {t('drugs.list.noPrice')}
            </span>
          )}
        </td>
        <td className="p-3">
          <Badge variant={drug.isActive ? 'active' : 'muted'}>
            {drug.isActive ? t('drugs.list.active') : t('drugs.list.inactive')}
          </Badge>
        </td>
        <td className="p-3 text-end">
          <Button
            variant={drug.isActive ? 'destructive' : 'outline'}
            size="sm"
            disabled={setActive.isPending}
            onClick={() => setActive.mutate({ id: drug.id, isActive: !drug.isActive })}
          >
            {drug.isActive ? t('drugs.list.deactivate') : t('drugs.list.reactivate')}
          </Button>
        </td>
      </tr>
      {isEditing && (
        <tr className="border-b border-border last:border-0 bg-muted/30">
          <td />
          <td colSpan={7} className="p-3">
            <DrugEditor drug={drug} onDone={() => setIsEditing(false)} />
          </td>
        </tr>
      )}
    </>
  )
}

function DrugEditor({ drug, onDone }: { drug: DrugSummary; onDone: () => void }) {
  const { t } = useTranslation()
  const updateDrug = useUpdateDrug()

  const [genericName, setGenericName] = useState(drug.genericName)
  const [brandName, setBrandName] = useState(drug.brandName ?? '')
  const [atcCode, setAtcCode] = useState(drug.atcCode ?? '')
  const [strength, setStrength] = useState(drug.strength ?? '')
  const [form, setForm] = useState(drug.form ?? '')
  const [defaultRoute, setDefaultRoute] = useState(drug.defaultRoute ?? '')
  const [defaultFreq, setDefaultFreq] = useState(drug.defaultFreq ?? '')
  const [defaultDuration, setDefaultDuration] = useState(drug.defaultDuration ?? '')
  const [isControlled, setIsControlled] = useState(drug.isControlled)
  const [sellPrice, setSellPrice] = useState(drug.sellPrice ?? '')
  const [error, setError] = useState<string | null>(null)

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const parsed = updateDrugRequestSchema.safeParse({
      genericName,
      brandName,
      atcCode,
      strength,
      form,
      defaultRoute,
      defaultFreq,
      defaultDuration,
      isControlled,
      sellPrice,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('drugs.edit.invalid'))
      return
    }

    updateDrug.mutate(
      { id: drug.id, input: parsed.data },
      { onSuccess: onDone, onError: () => setError(t('drugs.edit.failed')) },
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={`d-generic-${drug.id}`} className="text-xs text-muted-foreground">
            {t('drugs.create.genericName')}
          </Label>
          <Input
            id={`d-generic-${drug.id}`}
            value={genericName}
            onChange={(e) => setGenericName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`d-brand-${drug.id}`} className="text-xs text-muted-foreground">
            {t('drugs.create.brandName')}
          </Label>
          <Input
            id={`d-brand-${drug.id}`}
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`d-atc-${drug.id}`} className="text-xs text-muted-foreground">
            {t('drugs.create.atcCode')}
          </Label>
          <Input id={`d-atc-${drug.id}`} value={atcCode} onChange={(e) => setAtcCode(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`d-strength-${drug.id}`} className="text-xs text-muted-foreground">
            {t('drugs.create.strength')}
          </Label>
          <Input
            id={`d-strength-${drug.id}`}
            value={strength}
            onChange={(e) => setStrength(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`d-form-${drug.id}`} className="text-xs text-muted-foreground">
            {t('drugs.create.form')}
          </Label>
          <Input id={`d-form-${drug.id}`} value={form} onChange={(e) => setForm(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`d-price-${drug.id}`} className="text-xs text-muted-foreground">
            {t('drugs.create.sellPrice')}
          </Label>
          <Input
            id={`d-price-${drug.id}`}
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
            inputMode="decimal"
            dir="ltr"
            className="font-mono"
            placeholder={t('drugs.create.sellPricePlaceholder')}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`d-route-${drug.id}`} className="text-xs text-muted-foreground">
            {t('drugs.create.defaultRoute')}
          </Label>
          <Input
            id={`d-route-${drug.id}`}
            value={defaultRoute}
            onChange={(e) => setDefaultRoute(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`d-freq-${drug.id}`} className="text-xs text-muted-foreground">
            {t('drugs.create.defaultFreq')}
          </Label>
          <Input
            id={`d-freq-${drug.id}`}
            value={defaultFreq}
            onChange={(e) => setDefaultFreq(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`d-duration-${drug.id}`} className="text-xs text-muted-foreground">
            {t('drugs.create.defaultDuration')}
          </Label>
          <Input
            id={`d-duration-${drug.id}`}
            value={defaultDuration}
            onChange={(e) => setDefaultDuration(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={isControlled}
            onChange={(e) => setIsControlled(e.target.checked)}
          />
          {t('drugs.create.isControlled')}
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="sm" disabled={updateDrug.isPending}>
        {updateDrug.isPending ? t('drugs.edit.saving') : t('drugs.edit.save')}
      </Button>
    </form>
  )
}
