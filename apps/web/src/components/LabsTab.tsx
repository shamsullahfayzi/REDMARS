import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import {
  isVisitOpen,
  saveLabOrderRequestSchema,
  type LabOrderItemStatus,
  type LabTestSummary,
  type VisitSummary,
} from '@redmars/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useConsultSaver } from '@/hooks/useConsultSave'
import { useLabOrder, useOrderableTests, useSaveLabOrder } from '@/hooks/useLabOrder'
import { serverMessage } from '@/lib/api'

/**
 * Phase 5 — the doctor orders lab tests from the consulting room.
 *
 * The mirror of the prescription tab, and deliberately so: the doctor builds a list, the
 * whole list saves at once, and saving twice leaves one order. What is different is what a
 * lab order IS — a bill. The tests picked here become priced lines the patient settles at
 * reception before a sample is taken, so the running total is on screen the moment a test is
 * added, and the tab says plainly that nothing is paid yet. A doctor who cannot see the cost
 * cannot tell the patient it, and at Farhat that conversation happens in this room.
 *
 * Only what can be ordered is offered: the picker lists active catalog tests, and a test
 * already on the order is not shown again — ordering CBC twice is not a quantity the lab
 * has. A line whose sample has already been taken can no longer be removed here; the lab's
 * state has moved past the doctor's edit.
 */

interface Row {
  /** Server id once stored; undefined for a test just added and not yet saved. */
  id?: string
  testId: string
  code: string
  name: string
  /** Snapshot price as a decimal string, or null for a test that bills nothing on its own. */
  price: string | null
  status: LabOrderItemStatus
}

/** Sum of the selected lines, to two places. A null price counts as nothing. */
function sumPrices(rows: Row[]): string {
  const total = rows.reduce((acc, row) => acc + (row.price ? Number(row.price) : 0), 0)
  return total.toFixed(2)
}

export function LabsTab({ visit }: { visit: VisitSummary }) {
  const { t } = useTranslation()
  const open = isVisitOpen(visit.status)
  const orderQuery = useLabOrder(visit.id)
  const catalog = useOrderableTests(open)
  const save = useSaveLabOrder(visit.id)

  const [rows, setRows] = useState<Row[]>([])
  const [note, setNote] = useState('')
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const stored = orderQuery.data?.order ?? null

  // Load the saved order once — not on every refetch, which would wipe a test the doctor
  // just added while looking at it.
  useEffect(() => {
    if (!orderQuery.isSuccess || loadedFor === visit.id) return
    setRows(
      (stored?.items ?? []).map((item) => ({
        id: item.id,
        testId: item.testId,
        code: item.code,
        name: item.name,
        price: item.price,
        status: item.status,
      })),
    )
    setNote(stored?.clinicalNote ?? '')
    setLoadedFor(visit.id)
  }, [orderQuery.isSuccess, stored, loadedFor, visit.id])

  const savedSignature = useMemo(
    () =>
      JSON.stringify({
        testIds: (stored?.items ?? []).map((item) => item.testId),
        note: stored?.clinicalNote ?? '',
      }),
    [stored],
  )
  const currentSignature = useMemo(
    () => JSON.stringify({ testIds: rows.map((row) => row.testId), note }),
    [rows, note],
  )
  const isDirty = loadedFor === visit.id && currentSignature !== savedSignature

  const doSave = useCallback(async () => {
    const parsed = saveLabOrderRequestSchema.safeParse({
      testIds: rows.map((row) => row.testId),
      clinicalNote: note,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('labs.failed'))
      // Thrown so F9 cannot finish a visit over a half-entered order.
      throw new Error('invalid lab order')
    }
    setError(null)
    const result = await save.mutateAsync(parsed.data)
    // Re-seed from the server so new rows pick up their ids and status, and the next save
    // is a diff rather than a second order.
    setRows(
      (result.order?.items ?? []).map((item) => ({
        id: item.id,
        testId: item.testId,
        code: item.code,
        name: item.name,
        price: item.price,
        status: item.status,
      })),
    )
    setNote(result.order?.clinicalNote ?? '')
  }, [rows, note, save, t])

  useConsultSaver('labs', { isDirty, save: doSave })

  function addTest(test: LabTestSummary) {
    setRows((current) => [
      ...current,
      {
        testId: test.id,
        code: test.code,
        name: test.name,
        price: test.price,
        status: 'ordered',
      },
    ])
  }

  const chosen = new Set(rows.map((row) => row.testId))
  const total = sumPrices(rows)

  return (
    <div className="space-y-4">
      {open && (
        <TestPicker
          tests={(catalog.data?.tests ?? []).filter((test) => !chosen.has(test.id))}
          onPick={addTest}
        />
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('labs.none')}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, index) => {
            // Only a test still merely ordered may be pulled off here — once its sample is
            // taken the lab has moved on and the doctor's edit no longer reaches it.
            const removable = open && row.status === 'ordered'
            return (
              <li key={row.id ?? `new-${index}`}>
                <Card className="flex items-center gap-3 p-3">
                  <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                    {row.code}
                  </span>
                  <span className="text-sm font-medium text-foreground">{row.name}</span>
                  <span className="ms-auto font-mono text-sm tabular-nums" dir="ltr">
                    {row.price ?? t('labs.noCharge')}
                  </span>
                  {removable && (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('labs.removeRow')}
                      onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="size-4 text-destructive" aria-hidden />
                    </Button>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {rows.length > 0 && (
        <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-foreground">{t('labs.total')}</span>
            <span className="font-mono text-base font-bold tabular-nums" dir="ltr">
              {total}
            </span>
          </div>
          {/* The one thing this tab must not let the doctor assume: it is not paid. */}
          <p className="text-xs text-muted-foreground">
            {stored?.invoice
              ? t('labs.billed', { invoiceNo: stored.invoice.invoiceNo })
              : t('labs.willBill')}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="labClinicalNote">{t('labs.clinicalNote')}</Label>
        <Textarea
          id="labClinicalNote"
          rows={2}
          value={note}
          disabled={!open}
          placeholder={t('labs.clinicalNotePlaceholder')}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {open && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={!isDirty || save.isPending}
            onClick={() => void doSave().catch(() => undefined)}
          >
            {save.isPending ? t('labs.saving') : t('labs.save')}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {save.isError && (
            <p className="text-sm text-destructive">
              {serverMessage(save.error) ?? t('labs.failed')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Type to find a test, Enter to add the first match — the same shape as the drug picker, so
 * a doctor moving between the two tabs uses one muscle memory. The price rides along in the
 * suggestion so the cost is known before the test is chosen, not after.
 */
function TestPicker({
  tests,
  onPick,
}: {
  tests: LabTestSummary[]
  onPick: (test: LabTestSummary) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return tests
      .filter(
        (test) =>
          test.name.toLowerCase().includes(q) || test.code.toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [tests, query])

  function pick(test: LabTestSummary) {
    onPick(test)
    setQuery('')
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="labTestSearch">{t('labs.addTest')}</Label>
      <Input
        id="labTestSearch"
        value={query}
        placeholder={t('labs.addTestPlaceholder')}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || matches.length === 0) return
          e.preventDefault()
          pick(matches[0])
        }}
      />
      {matches.length > 0 && (
        <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
          {matches.map((test) => (
            <li key={test.id}>
              <button
                type="button"
                onClick={() => pick(test)}
                className="flex w-full items-baseline gap-3 rounded px-2 py-1.5 text-start text-sm hover:bg-muted"
              >
                <Plus className="size-3.5 shrink-0 text-primary" aria-hidden />
                <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                  {test.code}
                </span>
                <span className="font-medium text-foreground">{test.name}</span>
                <span className="ms-auto font-mono text-xs text-muted-foreground" dir="ltr">
                  {test.price ?? t('labs.noCharge')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
