import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Printer, Trash2 } from 'lucide-react'
import {
  isVisitOpen,
  saveLabOrderRequestSchema,
  type LabOrderItemStatus,
  type LabTestSummary,
  type VisitLabResultItem,
  type VisitSummary,
} from '@redmars/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useConsultSaver } from '@/hooks/useConsultSave'
import { useLabPrintSelection } from '@/hooks/useLabPrintSelection'
import {
  useLabOrder,
  useOrderableTests,
  useSaveLabOrder,
  useVisitLabResults,
} from '@/hooks/useLabOrder'
import { serverMessage } from '@/lib/api'
import { printTarget } from '@/lib/print'
import { cn } from '@/lib/utils'

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
  /** Whether reception has taken money for this line. False for a test just added and not
   *  yet saved — there is nothing to have paid yet. */
  isPaid: boolean
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
        isPaid: item.isPaid,
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
        isPaid: item.isPaid,
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
        isPaid: false,
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
            // Only a test still merely ordered, and not yet paid for, may be pulled off
            // here — once its sample is taken the lab has moved on, and once reception has
            // taken money for it the doctor's edit no longer reaches it either (the
            // backend enforces the same rule on save; this is the button matching it).
            const removable = open && row.status === 'ordered' && !row.isPaid
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

      <LabResultsView visitId={visit.id} />
    </div>
  )
}

/**
 * The loop closing — the results the doctor ordered, come home. Read-only: a VERIFIED test
 * shows its value and flag, anything earlier shows only where it is in the pipeline, because a
 * doctor should not act on a number the lab has not signed off. The report the patient carries
 * prints from here (the hidden sheet on the consult page renders the same verified results).
 *
 * Task 6b.6's other half: three verified results does not mean three results belong on the
 * paper the patient carries out — a doctor un-ticks the ones that are not the point of this
 * visit's report. Ticked is the default (see `useLabPrintSelection`), so a doctor who never
 * touches the control gets everything, which is the common case.
 */
function LabResultsView({ visitId }: { visitId: string }) {
  const { t } = useTranslation()
  const resultsQuery = useVisitLabResults(visitId, true)
  const { isExcluded, toggle } = useLabPrintSelection()
  const items = resultsQuery.data?.items ?? []
  if (items.length === 0) return null

  const anyIncluded = items.some((item) => item.value != null && !isExcluded(item.itemId))

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{t('labs.resultsTitle')}</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!anyIncluded}
          onClick={() => printTarget('lab')}
        >
          <Printer className="size-4" aria-hidden />
          {t('labs.print')}
        </Button>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {items.map((item) => (
          <li key={item.itemId} className="flex items-center gap-3 px-3 py-2">
            {item.value != null && (
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={!isExcluded(item.itemId)}
                onChange={() => toggle(item.itemId)}
                aria-label={t('labs.includeInPrint', { test: item.testName })}
              />
            )}
            <span className="flex-1 text-sm text-foreground">
              {item.testName}
              <span dir="ltr" className="ms-2 font-mono text-xs text-muted-foreground">
                {item.code}
              </span>
            </span>
            {item.value != null ? (
              <ResultValue item={item} />
            ) : (
              <span className="text-xs text-muted-foreground">
                {t(`labQueue.status.${item.status}`)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ResultValue({ item }: { item: VisitLabResultItem }) {
  const reference =
    item.referenceLow != null || item.referenceHigh != null
      ? `${item.referenceLow ?? ''}–${item.referenceHigh ?? ''}`
      : item.referenceText
  return (
    <span className="flex items-center gap-2">
      {reference && (
        <span dir="ltr" className="text-xs text-muted-foreground">
          {reference}
        </span>
      )}
      <span
        className={cn('text-sm font-semibold tabular-nums', item.isAbnormal && 'text-destructive')}
        dir="ltr"
      >
        {item.value}
        {item.unit ? ` ${item.unit}` : ''}
      </span>
      {(item.flag === 'H' || item.flag === 'L') && (
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-xs font-bold',
            item.flag === 'H' ? 'bg-destructive/15 text-destructive' : 'bg-info/15 text-info',
          )}
        >
          {item.flag}
        </span>
      )}
    </span>
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
