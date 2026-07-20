import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Trash2 } from 'lucide-react'
import {
  createLabTestRequestSchema,
  createReferenceRangeRequestSchema,
  updateLabTestRequestSchema,
  type LabTestSummary,
  type ReferenceRangeSummary,
} from '@redmars/shared'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useCreateLabTest, useLabTests, useSetLabTestActive, useUpdateLabTest } from '@/hooks/useLabTests'
import {
  useCreateReferenceRange,
  useDeleteReferenceRange,
  useReferenceRanges,
} from '@/hooks/useReferenceRanges'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * Admin + lab-tech lab test catalog (task 2.7). A LabTest is an orderable test with
 * an optional price — the one place a lab price is allowed to live. The API enforces
 * labtest.manage on every route.
 */
export function LabTestsPage() {
  const { t } = useTranslation()
  const testsQuery = useLabTests()

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.labTests')} description={t('labTests.subtitle')} />

      <CreateLabTestForm />

      <section className="space-y-3">
        <h2 className="font-medium text-foreground">{t('labTests.list.title')}</h2>

        {testsQuery.isPending && <p className="text-muted-foreground">{t('labTests.list.loading')}</p>}
        {testsQuery.isError && <p className="text-destructive">{t('labTests.list.error')}</p>}

        {testsQuery.data &&
          (testsQuery.data.tests.length === 0 ? (
            <p className="text-muted-foreground">{t('labTests.list.empty')}</p>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="w-10 p-3" />
                    <th className="p-3 text-start font-medium">{t('labTests.list.code')}</th>
                    <th className="p-3 text-start font-medium">{t('labTests.list.name')}</th>
                    <th className="p-3 text-start font-medium">{t('labTests.list.specimen')}</th>
                    <th className="p-3 text-end font-medium">{t('labTests.list.price')}</th>
                    <th className="p-3 text-start font-medium">{t('labTests.list.status')}</th>
                    <th className="p-3 text-end font-medium">{t('labTests.list.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {testsQuery.data.tests.map((test) => (
                    <LabTestRow key={test.id} test={test} />
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
      </section>
    </div>
  )
}

// --- Create ------------------------------------------------------------------

function CreateLabTestForm() {
  const { t } = useTranslation()
  const createTest = useCreateLabTest()

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [nameLocalPrs, setNameLocalPrs] = useState('')
  const [nameLocalPs, setNameLocalPs] = useState('')
  const [specimen, setSpecimen] = useState('')
  const [unit, setUnit] = useState('')
  const [loincCode, setLoincCode] = useState('')
  const [price, setPrice] = useState('')
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setCode('')
    setName('')
    setNameLocalPrs('')
    setNameLocalPs('')
    setSpecimen('')
    setUnit('')
    setLoincCode('')
    setPrice('')
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const parsed = createLabTestRequestSchema.safeParse({
      code,
      name,
      nameLocalPrs,
      nameLocalPs,
      specimen,
      unit,
      loincCode,
      price,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('labTests.create.invalid'))
      return
    }

    createTest.mutate(parsed.data, {
      onSuccess: resetForm,
      onError: (err) => {
        setError(
          err instanceof ApiError && err.status === 409
            ? t('labTests.create.duplicate')
            : t('labTests.create.failed'),
        )
      },
    })
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t('labTests.create.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lt-code">{t('labTests.create.code')}</Label>
              <Input id="lt-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-name">{t('labTests.create.name')}</Label>
              <Input id="lt-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lt-name-prs">{t('labTests.create.nameLocalPrs')}</Label>
              <Input
                id="lt-name-prs"
                dir="rtl"
                value={nameLocalPrs}
                onChange={(e) => setNameLocalPrs(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-name-ps">{t('labTests.create.nameLocalPs')}</Label>
              <Input
                id="lt-name-ps"
                dir="rtl"
                value={nameLocalPs}
                onChange={(e) => setNameLocalPs(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="lt-specimen">{t('labTests.create.specimen')}</Label>
              <Input
                id="lt-specimen"
                value={specimen}
                onChange={(e) => setSpecimen(e.target.value)}
                placeholder="blood"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-unit">{t('labTests.create.unit')}</Label>
              <Input
                id="lt-unit"
                dir="ltr"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="mg/dL"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-loinc">{t('labTests.create.loincCode')}</Label>
              <Input
                id="lt-loinc"
                dir="ltr"
                value={loincCode}
                onChange={(e) => setLoincCode(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-price">
                {t('labTests.create.price')} ({t('labTests.currency')})
              </Label>
              <Input
                id="lt-price"
                inputMode="decimal"
                dir="ltr"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={createTest.isPending}>
            {createTest.isPending ? t('labTests.create.submitting') : t('labTests.create.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// --- List row + inline editor ------------------------------------------------

function LabTestRow({ test }: { test: LabTestSummary }) {
  const { t } = useTranslation()
  const setActive = useSetLabTestActive()
  const [isEditing, setIsEditing] = useState(false)

  return (
    <>
      <tr className="border-b border-border last:border-0">
        <td className="p-3">
          <button
            type="button"
            onClick={() => setIsEditing((v) => !v)}
            aria-expanded={isEditing}
            aria-label={t('labTests.edit.toggle')}
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
        <td className="p-3 font-mono text-foreground">{test.code}</td>
        <td className="p-3 text-foreground">
          {test.name}
          {test.nameLocalPrs && (
            <div className="text-xs text-muted-foreground" dir="rtl">
              {test.nameLocalPrs}
            </div>
          )}
        </td>
        <td className="p-3 text-muted-foreground">{test.specimen ?? '—'}</td>
        <td className="p-3 text-end font-mono text-foreground" dir="ltr">
          {test.price ?? '—'}
        </td>
        <td className="p-3">
          <Badge variant={test.isActive ? 'active' : 'muted'}>
            {test.isActive ? t('labTests.list.active') : t('labTests.list.inactive')}
          </Badge>
        </td>
        <td className="p-3 text-end">
          <Button
            variant={test.isActive ? 'destructive' : 'outline'}
            size="sm"
            disabled={setActive.isPending}
            onClick={() => setActive.mutate({ id: test.id, isActive: !test.isActive })}
          >
            {test.isActive ? t('labTests.list.deactivate') : t('labTests.list.reactivate')}
          </Button>
        </td>
      </tr>
      {isEditing && (
        <tr className="border-b border-border last:border-0 bg-muted/30">
          <td />
          <td colSpan={6} className="space-y-5 p-3">
            <LabTestEditor test={test} onDone={() => setIsEditing(false)} />
            <ReferenceRangesPanel test={test} />
          </td>
        </tr>
      )}
    </>
  )
}

function LabTestEditor({ test, onDone }: { test: LabTestSummary; onDone: () => void }) {
  const { t } = useTranslation()
  const updateTest = useUpdateLabTest()

  const [name, setName] = useState(test.name)
  const [nameLocalPrs, setNameLocalPrs] = useState(test.nameLocalPrs ?? '')
  const [nameLocalPs, setNameLocalPs] = useState(test.nameLocalPs ?? '')
  const [specimen, setSpecimen] = useState(test.specimen ?? '')
  const [unit, setUnit] = useState(test.unit ?? '')
  const [loincCode, setLoincCode] = useState(test.loincCode ?? '')
  const [price, setPrice] = useState(test.price ?? '')
  const [error, setError] = useState<string | null>(null)

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const parsed = updateLabTestRequestSchema.safeParse({
      name,
      nameLocalPrs,
      nameLocalPs,
      specimen,
      unit,
      loincCode,
      price,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('labTests.edit.invalid'))
      return
    }

    updateTest.mutate(
      { id: test.id, input: parsed.data },
      { onSuccess: onDone, onError: () => setError(t('labTests.edit.failed')) },
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={`lt-name-${test.id}`} className="text-xs text-muted-foreground">
            {t('labTests.create.name')}
          </Label>
          <Input id={`lt-name-${test.id}`} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`lt-prs-${test.id}`} className="text-xs text-muted-foreground">
            {t('labTests.create.nameLocalPrs')}
          </Label>
          <Input
            id={`lt-prs-${test.id}`}
            dir="rtl"
            value={nameLocalPrs}
            onChange={(e) => setNameLocalPrs(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`lt-ps-${test.id}`} className="text-xs text-muted-foreground">
            {t('labTests.create.nameLocalPs')}
          </Label>
          <Input
            id={`lt-ps-${test.id}`}
            dir="rtl"
            value={nameLocalPs}
            onChange={(e) => setNameLocalPs(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`lt-specimen-${test.id}`} className="text-xs text-muted-foreground">
            {t('labTests.create.specimen')}
          </Label>
          <Input
            id={`lt-specimen-${test.id}`}
            value={specimen}
            onChange={(e) => setSpecimen(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`lt-unit-${test.id}`} className="text-xs text-muted-foreground">
            {t('labTests.create.unit')}
          </Label>
          <Input
            id={`lt-unit-${test.id}`}
            dir="ltr"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`lt-loinc-${test.id}`} className="text-xs text-muted-foreground">
            {t('labTests.create.loincCode')}
          </Label>
          <Input
            id={`lt-loinc-${test.id}`}
            dir="ltr"
            value={loincCode}
            onChange={(e) => setLoincCode(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`lt-price-${test.id}`} className="text-xs text-muted-foreground">
            {t('labTests.create.price')} ({t('labTests.currency')})
          </Label>
          <Input
            id={`lt-price-${test.id}`}
            inputMode="decimal"
            dir="ltr"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="sm" disabled={updateTest.isPending}>
        {updateTest.isPending ? t('labTests.edit.saving') : t('labTests.edit.save')}
      </Button>
    </form>
  )
}

// --- Reference ranges (task 2.8) ---------------------------------------------

const GENDERS = ['male', 'female', 'other', 'unknown'] as const

// A band's normal value, formatted for the list: numeric bounds (either side may be
// open) with the test's unit, or the text result. The result screen (a later phase)
// reads these bands to flag a value high or low — here we only define them.
function formatValue(range: ReferenceRangeSummary, unit: string | null): string {
  if (range.low !== null || range.high !== null) {
    const lo = range.low ?? '…'
    const hi = range.high ?? '…'
    return `${lo} – ${hi}${unit ? ` ${unit}` : ''}`
  }
  return range.textValue ?? '—'
}

function ReferenceRangesPanel({ test }: { test: LabTestSummary }) {
  const { t } = useTranslation()
  const rangesQuery = useReferenceRanges(test.id, true)
  const deleteRange = useDeleteReferenceRange(test.id)

  function ageText(range: ReferenceRangeSummary): string {
    if (range.minAge === null && range.maxAge === null) return t('referenceRanges.allAges')
    return `${range.minAge ?? '0'}–${range.maxAge ?? '∞'}`
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div>
        <h3 className="text-sm font-medium text-foreground">{t('referenceRanges.title')}</h3>
        <p className="text-xs text-muted-foreground">{t('referenceRanges.hint')}</p>
      </div>

      {rangesQuery.isPending && (
        <p className="text-sm text-muted-foreground">{t('referenceRanges.loading')}</p>
      )}
      {rangesQuery.isError && (
        <p className="text-sm text-destructive">{t('referenceRanges.error')}</p>
      )}

      {rangesQuery.data &&
        (rangesQuery.data.ranges.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('referenceRanges.empty')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {rangesQuery.data.ranges.map((range) => (
              <li key={range.id} className="flex items-center gap-3 p-2 text-sm">
                <Badge variant="muted">
                  {range.gender
                    ? t(`referenceRanges.gender.${range.gender}`)
                    : t('referenceRanges.genderAny')}
                </Badge>
                <span className="text-muted-foreground">{ageText(range)}</span>
                <span className="flex-1 font-mono text-foreground" dir="ltr">
                  {formatValue(range, test.unit)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('referenceRanges.delete')}
                  disabled={deleteRange.isPending}
                  onClick={() => deleteRange.mutate(range.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        ))}

      <AddReferenceRangeForm test={test} />
    </div>
  )
}

function AddReferenceRangeForm({ test }: { test: LabTestSummary }) {
  const { t } = useTranslation()
  const createRange = useCreateReferenceRange(test.id)

  const [gender, setGender] = useState('')
  const [minAge, setMinAge] = useState('')
  const [maxAge, setMaxAge] = useState('')
  const [low, setLow] = useState('')
  const [high, setHigh] = useState('')
  const [textValue, setTextValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setGender('')
    setMinAge('')
    setMaxAge('')
    setLow('')
    setHigh('')
    setTextValue('')
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const parsed = createReferenceRangeRequestSchema.safeParse({
      gender,
      minAge,
      maxAge,
      low,
      high,
      textValue,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('referenceRanges.invalid'))
      return
    }

    createRange.mutate(parsed.data, {
      onSuccess: resetForm,
      onError: () => setError(t('referenceRanges.failed')),
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 border-t border-border pt-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-1">
          <Label htmlFor={`rr-gender-${test.id}`} className="text-xs text-muted-foreground">
            {t('referenceRanges.genderLabel')}
          </Label>
          <Select
            id={`rr-gender-${test.id}`}
            value={gender}
            onChange={(e) => setGender(e.target.value)}
          >
            <option value="">{t('referenceRanges.genderAny')}</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {t(`referenceRanges.gender.${g}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`rr-minage-${test.id}`} className="text-xs text-muted-foreground">
            {t('referenceRanges.minAge')}
          </Label>
          <Input
            id={`rr-minage-${test.id}`}
            inputMode="numeric"
            dir="ltr"
            value={minAge}
            onChange={(e) => setMinAge(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`rr-maxage-${test.id}`} className="text-xs text-muted-foreground">
            {t('referenceRanges.maxAge')}
          </Label>
          <Input
            id={`rr-maxage-${test.id}`}
            inputMode="numeric"
            dir="ltr"
            value={maxAge}
            onChange={(e) => setMaxAge(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`rr-low-${test.id}`} className="text-xs text-muted-foreground">
            {t('referenceRanges.low')}
          </Label>
          <Input
            id={`rr-low-${test.id}`}
            inputMode="decimal"
            dir="ltr"
            value={low}
            onChange={(e) => setLow(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`rr-high-${test.id}`} className="text-xs text-muted-foreground">
            {t('referenceRanges.high')}
          </Label>
          <Input
            id={`rr-high-${test.id}`}
            inputMode="decimal"
            dir="ltr"
            value={high}
            onChange={(e) => setHigh(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`rr-text-${test.id}`} className="text-xs text-muted-foreground">
            {t('referenceRanges.textValue')}
          </Label>
          <Input
            id={`rr-text-${test.id}`}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            placeholder={t('referenceRanges.textPlaceholder')}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="sm" disabled={createRange.isPending}>
        {createRange.isPending ? t('referenceRanges.adding') : t('referenceRanges.add')}
      </Button>
    </form>
  )
}
