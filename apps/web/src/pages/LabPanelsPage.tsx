import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import {
  createLabPanelRequestSchema,
  updateLabPanelRequestSchema,
  type LabPanelSummary,
  type LabTestSummary,
} from '@redmars/shared'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLabTests } from '@/hooks/useLabTests'
import {
  useCreateLabPanel,
  useLabPanels,
  useSetLabPanelActive,
  useSetLabPanelTests,
  useUpdateLabPanel,
} from '@/hooks/useLabPanels'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * Admin-only lab panel catalog (task 2.7). A LabPanel groups lab tests for one-click
 * ordering — "LFT" expands to its member liver tests. Membership is the many-to-many
 * (LabPanelTest); the API enforces panel.manage on every route.
 */
export function LabPanelsPage() {
  const { t } = useTranslation()
  const panelsQuery = useLabPanels()
  const testsQuery = useLabTests()

  const tests = testsQuery.data?.tests ?? []
  const activeTests = tests.filter((tst) => tst.isActive)
  const testName = (id: string) => tests.find((tst) => tst.id === id)?.name ?? id

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.labPanels')} description={t('labPanels.subtitle')} />

      <CreateLabPanelForm tests={activeTests} />

      <section className="space-y-3">
        <h2 className="font-medium text-foreground">{t('labPanels.list.title')}</h2>

        {panelsQuery.isPending && (
          <p className="text-muted-foreground">{t('labPanels.list.loading')}</p>
        )}
        {panelsQuery.isError && <p className="text-destructive">{t('labPanels.list.error')}</p>}

        {panelsQuery.data &&
          (panelsQuery.data.panels.length === 0 ? (
            <p className="text-muted-foreground">{t('labPanels.list.empty')}</p>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="w-10 p-3" />
                    <th className="p-3 text-start font-medium">{t('labPanels.list.code')}</th>
                    <th className="p-3 text-start font-medium">{t('labPanels.list.name')}</th>
                    <th className="p-3 text-start font-medium">{t('labPanels.list.tests')}</th>
                    <th className="p-3 text-end font-medium">{t('labPanels.list.price')}</th>
                    <th className="p-3 text-start font-medium">{t('labPanels.list.status')}</th>
                    <th className="p-3 text-end font-medium">{t('labPanels.list.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {panelsQuery.data.panels.map((panel) => (
                    <LabPanelRow
                      key={panel.id}
                      panel={panel}
                      tests={activeTests}
                      testName={testName}
                    />
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
      </section>
    </div>
  )
}

// --- A checkbox group of tests, the m2m picker -------------------------------

function TestPicker({
  tests,
  selected,
  onToggle,
}: {
  tests: LabTestSummary[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  const { t } = useTranslation()
  if (tests.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('labPanels.create.noTests')}</p>
  }
  return (
    <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
      {tests.map((test) => (
        <label
          key={test.id}
          className="flex items-center gap-2 rounded px-2 py-1 text-sm text-foreground hover:bg-muted"
        >
          <input
            type="checkbox"
            checked={selected.includes(test.id)}
            onChange={() => onToggle(test.id)}
          />
          <span className="font-mono text-xs text-muted-foreground">{test.code}</span>
          <span>{test.name}</span>
        </label>
      ))}
    </div>
  )
}

// --- Create ------------------------------------------------------------------

function CreateLabPanelForm({ tests }: { tests: LabTestSummary[] }) {
  const { t } = useTranslation()
  const createPanel = useCreateLabPanel()

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [testIds, setTestIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  function toggle(id: string) {
    setTestIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  function resetForm() {
    setCode('')
    setName('')
    setPrice('')
    setTestIds([])
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const parsed = createLabPanelRequestSchema.safeParse({ code, name, price, testIds })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('labPanels.create.invalid'))
      return
    }

    createPanel.mutate(parsed.data, {
      onSuccess: resetForm,
      onError: (err) => {
        setError(
          err instanceof ApiError && err.status === 409
            ? t('labPanels.create.duplicate')
            : t('labPanels.create.failed'),
        )
      },
    })
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t('labPanels.create.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="lp-code">{t('labPanels.create.code')}</Label>
              <Input id="lp-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lp-name">{t('labPanels.create.name')}</Label>
              <Input id="lp-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lp-price">
                {t('labPanels.create.price')} ({t('labPanels.currency')})
              </Label>
              <Input
                id="lp-price"
                inputMode="decimal"
                dir="ltr"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('labPanels.create.tests')}</Label>
            <TestPicker tests={tests} selected={testIds} onToggle={toggle} />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={createPanel.isPending}>
            {createPanel.isPending ? t('labPanels.create.submitting') : t('labPanels.create.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// --- List row + inline editor ------------------------------------------------

function LabPanelRow({
  panel,
  tests,
  testName,
}: {
  panel: LabPanelSummary
  tests: LabTestSummary[]
  testName: (id: string) => string
}) {
  const { t } = useTranslation()
  const setActive = useSetLabPanelActive()
  const [isEditing, setIsEditing] = useState(false)

  return (
    <>
      <tr className="border-b border-border last:border-0">
        <td className="p-3">
          <button
            type="button"
            onClick={() => setIsEditing((v) => !v)}
            aria-expanded={isEditing}
            aria-label={t('labPanels.edit.toggle')}
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
        <td className="p-3 font-mono text-foreground">{panel.code}</td>
        <td className="p-3 text-foreground">{panel.name}</td>
        <td className="p-3 text-muted-foreground">
          {panel.testIds.length === 0 ? (
            <span className="text-xs">{t('labPanels.list.noTests')}</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {panel.testIds.map((id) => (
                <Badge key={id} variant="outline">
                  {testName(id)}
                </Badge>
              ))}
            </div>
          )}
        </td>
        <td className="p-3 text-end font-mono text-foreground" dir="ltr">
          {panel.price ?? '—'}
        </td>
        <td className="p-3">
          <Badge variant={panel.isActive ? 'active' : 'muted'}>
            {panel.isActive ? t('labPanels.list.active') : t('labPanels.list.inactive')}
          </Badge>
        </td>
        <td className="p-3 text-end">
          <Button
            variant={panel.isActive ? 'destructive' : 'outline'}
            size="sm"
            disabled={setActive.isPending}
            onClick={() => setActive.mutate({ id: panel.id, isActive: !panel.isActive })}
          >
            {panel.isActive ? t('labPanels.list.deactivate') : t('labPanels.list.reactivate')}
          </Button>
        </td>
      </tr>
      {isEditing && (
        <tr className="border-b border-border last:border-0 bg-muted/30">
          <td />
          <td colSpan={6} className="p-3">
            <LabPanelEditor panel={panel} tests={tests} onDone={() => setIsEditing(false)} />
          </td>
        </tr>
      )}
    </>
  )
}

function LabPanelEditor({
  panel,
  tests,
  onDone,
}: {
  panel: LabPanelSummary
  tests: LabTestSummary[]
  onDone: () => void
}) {
  const { t } = useTranslation()
  const updatePanel = useUpdateLabPanel()
  const setTests = useSetLabPanelTests()

  const [name, setName] = useState(panel.name)
  const [price, setPrice] = useState(panel.price ?? '')
  const [testIds, setTestIds] = useState<string[]>(panel.testIds)
  const [error, setError] = useState<string | null>(null)

  function toggle(id: string) {
    setTestIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const parsed = updateLabPanelRequestSchema.safeParse({ name, price })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('labPanels.edit.invalid'))
      return
    }

    // Two writes: the panel's own fields, then its membership. Sequenced so a
    // failure in either surfaces before the row closes.
    updatePanel.mutate(
      { id: panel.id, input: parsed.data },
      {
        onError: () => setError(t('labPanels.edit.failed')),
        onSuccess: () => {
          setTests.mutate(
            { id: panel.id, testIds },
            { onSuccess: onDone, onError: () => setError(t('labPanels.edit.failed')) },
          )
        },
      },
    )
  }

  const saving = updatePanel.isPending || setTests.isPending

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`lp-name-${panel.id}`} className="text-xs text-muted-foreground">
            {t('labPanels.create.name')}
          </Label>
          <Input id={`lp-name-${panel.id}`} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`lp-price-${panel.id}`} className="text-xs text-muted-foreground">
            {t('labPanels.create.price')} ({t('labPanels.currency')})
          </Label>
          <Input
            id={`lp-price-${panel.id}`}
            inputMode="decimal"
            dir="ltr"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{t('labPanels.create.tests')}</Label>
        <TestPicker tests={tests} selected={testIds} onToggle={toggle} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? t('labPanels.edit.saving') : t('labPanels.edit.save')}
      </Button>
    </form>
  )
}
