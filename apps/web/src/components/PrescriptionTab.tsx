import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, BookmarkPlus, Copy, Plus, Trash2 } from 'lucide-react'
import {
  DOSE_PRESETS,
  DURATION_PRESETS,
  FREQUENCY_CODES,
  INSTRUCTION_CODES,
  INTERACTION_SEVERITY_RANK,
  ROUTE_CODES,
  createTemplateRequestSchema,
  interactionNeedsAck,
  isPrescriptionTemplate,
  isVisitOpen,
  matchCode,
  savePrescriptionRequestSchema,
  type AllergyConflict,
  type DrugSummary,
  type InteractionWarning,
  type LastPrescription,
  type PrescriptionTemplate,
  type VisitSummary,
} from '@redmars/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CodePicker } from '@/components/ui/code-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useConsultSaver } from '@/hooks/useConsultSave'
import { useCreateTemplate, useDeleteTemplate, useTemplates } from '@/hooks/useTemplates'
import { useInteractionCheck } from '@/hooks/useInteractionCheck'
import {
  allergyConflictsFromError,
  interactionWarningsFromError,
  useFormulary,
  useLastPrescription,
  usePrescription,
  useSavePrescription,
} from '@/hooks/usePrescription'
import { serverMessage } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * Task 4.7 — the prescription table. "4 drugs prescribed in under 30 seconds."
 *
 * Everything here is arranged around that number.
 *
 * THE AUTOCOMPLETE AUTOFILLS. Picking duloxetine fills route, frequency and duration from
 * the formulary's defaults (task 2.6) in the same keystroke — so the common case is type
 * three letters, press Enter, and the row is already complete. The defaults are STARTERS:
 * every one of them is an editable box, because a default the prescriber cannot override is
 * worse than no default at all.
 *
 * THE WHOLE SHEET SAVES AT ONCE, so adding a row costs nothing until F2. The server diffs
 * what it is sent, which is why a row keeps its id across saves and why saving three times
 * does not leave three prescriptions.
 *
 * The formulary is fetched once and filtered in the browser. A request per keystroke is how
 * you lose the thirty seconds.
 */

interface Row {
  /** Server id when the row is already stored; undefined for a new one. */
  id?: string
  drugId: string
  drugLabel: string
  dose: string
  frequency: string
  duration: string
  route: string
  /**
   * How many to hand over. A STRING while it is being typed, a number on the wire — an
   * empty box is not the number zero, and a half-typed "3" on the way to "30" must not
   * become a quantity of 3 if the doctor saves mid-keystroke.
   */
  quantity: string
  instructions: string
  /** Already-recorded override, so re-saving does not re-prompt for the same one. */
  allergyOverrideReason: string | null
}

function drugLabel(drug: DrugSummary): string {
  return [drug.brandName ?? drug.genericName, drug.strength].filter(Boolean).join(' ')
}

export function PrescriptionTab({ visit }: { visit: VisitSummary }) {
  const { t } = useTranslation()
  const listQuery = usePrescription(visit.id)
  const formulary = useFormulary()
  const save = useSavePrescription(visit.id)
  // Task 4.12. Shared plus this doctor's own — the narrowing is the server's.
  const templatesQuery = useTemplates('prescription')
  const createTemplate = useCreateTemplate('prescription')
  const deleteTemplate = useDeleteTemplate('prescription')

  const [rows, setRows] = useState<Row[]>([])
  const [advice, setAdvice] = useState('')
  /** Task 4.15 — YYYY-MM-DD, or '' for no review set. */
  const [followUpDate, setFollowUpDate] = useState('')
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Reasons typed against the block, keyed by drug. Cleared once the save goes through. */
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  /** Task 4.9 — one acknowledgement for the sheet, typed BEFORE the save is attempted. */
  const [interactionAck, setInteractionAck] = useState('')
  /** Task 4.12 — kept apart from `error`, which is rendered by the save button far below. */
  const [templateError, setTemplateError] = useState<string | null>(null)

  const open = isVisitOpen(visit.status)
  const stored = listQuery.data?.prescription ?? null
  // Doctor-only endpoint on an open visit — see the hook. Asking for it from a closed visit
  // or a nurse's screen would be a request that can only 403.
  const lastQuery = useLastPrescription(visit.id, open)
  const last = lastQuery.data?.last ?? null

  // Load the saved sheet once. Not on every refetch — that would overwrite a half-typed
  // row while the doctor is looking at it.
  useEffect(() => {
    if (!listQuery.isSuccess || loadedFor === visit.id) return
    setRows(
      (stored?.items ?? []).map((item) => ({
        id: item.id,
        drugId: item.drugId,
        drugLabel: item.drugNameAtTime,
        dose: item.dose ?? '',
        frequency: item.frequency,
        duration: item.duration,
        route: item.route,
        quantity: item.quantity === null ? '' : String(item.quantity),
        instructions: item.instructions ?? '',
        allergyOverrideReason: item.allergyOverrideReason,
      })),
    )
    setAdvice(stored?.advice ?? '')
    setFollowUpDate(stored?.followUpDate ?? '')
    setInteractionAck(stored?.interactionAckReason ?? '')
    setLoadedFor(visit.id)
  }, [listQuery.isSuccess, stored, loadedFor, visit.id])

  const savedSignature = useMemo(
    () =>
      JSON.stringify({
        items: (stored?.items ?? []).map((item) => ({
          id: item.id,
          drugId: item.drugId,
          dose: item.dose ?? '',
          frequency: item.frequency,
          duration: item.duration,
          route: item.route,
          quantity: item.quantity === null ? '' : String(item.quantity),
          instructions: item.instructions ?? '',
        })),
        advice: stored?.advice ?? '',
        followUpDate: stored?.followUpDate ?? '',
      }),
    [stored],
  )

  const currentSignature = useMemo(
    () =>
      JSON.stringify({
        items: rows.map(({ drugLabel: _label, allergyOverrideReason: _reason, ...rest }) => rest),
        advice,
        followUpDate,
      }),
    [rows, advice, followUpDate],
  )

  const isDirty = loadedFor === visit.id && currentSignature !== savedSignature
  const conflicts = allergyConflictsFromError(save.error)

  // Task 4.9 — the "before save" half. Re-checked as the rows change, so a contraindicated
  // pair is on screen the moment the second drug is added rather than at the moment a save
  // is refused. The 409 is the server having the last word, not the first.
  const interactionQuery = useInteractionCheck(rows.map((row) => row.drugId))
  const liveInteractions = [...(interactionQuery.data?.interactions ?? [])].sort(
    (a, b) => INTERACTION_SEVERITY_RANK[b.severity] - INTERACTION_SEVERITY_RANK[a.severity],
  )
  const refusedInteractions = interactionWarningsFromError(save.error)
  const interactions = refusedInteractions ?? liveInteractions
  const needsAck = interactions.some((warning) => interactionNeedsAck(warning.severity))

  const doSave = useCallback(async () => {
    const parsed = savePrescriptionRequestSchema.safeParse({
      items: rows.map((row) => ({
        id: row.id,
        drugId: row.drugId,
        dose: row.dose,
        frequency: row.frequency,
        duration: row.duration,
        route: row.route,
        // '' is a legal input meaning "no quantity"; the contract turns it into null.
        // Number('') is 0, which would be a quantity of nothing rather than no quantity.
        quantity: row.quantity === '' ? '' : Number(row.quantity),
        instructions: row.instructions,
        // A reason typed against the block, or one already stored on the row from an
        // earlier save — so pressing F2 twice does not re-prompt for the same override.
        allergyOverrideReason: overrides[row.drugId] || row.allergyOverrideReason || null,
      })),
      advice,
      // Typed in the warning panel, or carried from the stored sheet so re-saving an
      // already-acknowledged combination does not ask again.
      interactionAckReason: interactionAck || stored?.interactionAckReason || null,
      // '' means no review set. Sent as null so clearing the box actually removes the
      // recall rather than leaving yesterday's date on the sheet.
      followUpDate: followUpDate || null,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('prescription.failed'))
      // Thrown, so F9 cannot finish a visit over an incomplete drug order.
      throw new Error('invalid prescription')
    }
    setError(null)
    const result = await save.mutateAsync(parsed.data)
    // Re-seed from the server so new rows pick up their ids and the next save is a diff
    // rather than a second insert.
    setRows(
      (result.prescription?.items ?? []).map((item) => ({
        id: item.id,
        drugId: item.drugId,
        drugLabel: item.drugNameAtTime,
        dose: item.dose ?? '',
        frequency: item.frequency,
        duration: item.duration,
        route: item.route,
        quantity: item.quantity === null ? '' : String(item.quantity),
        instructions: item.instructions ?? '',
        allergyOverrideReason: item.allergyOverrideReason,
      })),
    )
    setOverrides({})
  }, [rows, advice, followUpDate, overrides, interactionAck, stored, save, t])

  useConsultSaver('prescription', { isDirty, save: doSave })

  function addDrug(drug: DrugSummary) {
    setRows((current) => [
      ...current,
      {
        drugId: drug.id,
        drugLabel: drugLabel(drug),
        dose: '',
        // THE AUTOFILL. The formulary stores its defaults as free text from task 2.6
        // ("oral", "OD"), so they are mapped onto codes on the way in — otherwise every
        // autofilled row would arrive holding a value the contract now refuses, and the
        // feature that exists to save time would cost it. No match leaves the field empty
        // for the prescriber to choose, rather than guessing.
        frequency: matchCode(drug.defaultFreq, FREQUENCY_CODES) ?? '',
        duration: drug.defaultDuration ?? '',
        route: matchCode(drug.defaultRoute, ROUTE_CODES) ?? '',
        // Not derived from frequency × duration. "OD for 1 month" is 30 tablets only if the
        // month has 30 days and the pack is tablets, and a quantity the pharmacy dispenses
        // against is not a number to arrive at by arithmetic nobody checked.
        quantity: '',
        instructions: '',
        allergyOverrideReason: null,
      },
    ])
  }

  function setRow(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  /**
   * Task 4.11 — the previous sheet, dropped into this one.
   *
   * APPENDS AND DE-DUPLICATES rather than replacing. A doctor who has already typed two
   * drugs and then remembers the repeat should not lose them, and a drug already on the
   * sheet should not arrive twice — the second line would be a double dose that reads as
   * two separate orders.
   *
   * Codes are re-mapped on the way in for the same reason the formulary autofill maps
   * them: an old sheet may hold a value written before route and frequency were closed
   * sets, and a row arriving with something the contract now refuses would fail the save
   * with an error about a drug the doctor did not type.
   */
  function copyLast() {
    const items = lastQuery.data?.last?.items ?? []
    setRows((current) => {
      const already = new Set(current.map((row) => row.drugId))
      const additions = items
        .filter((item) => !already.has(item.drugId))
        .map((item) => ({
          drugId: item.drugId,
          drugLabel: item.drugNameAtTime,
          dose: item.dose ?? '',
          frequency: matchCode(item.frequency, FREQUENCY_CODES) ?? '',
          duration: item.duration,
          route: matchCode(item.route, ROUTE_CODES) ?? '',
          quantity: item.quantity === null ? '' : String(item.quantity),
          instructions: item.instructions ?? '',
          // Never carried. Task 4.8's block must fire again on a sheet nobody has read.
          allergyOverrideReason: null,
        }))
      return [...current, ...additions]
    })
  }

  /**
   * Task 4.12 — a saved regimen, applied.
   *
   * The SAME append-and-de-duplicate as copy-last, deliberately: both drop a set of drugs
   * onto a sheet the doctor may already have started, and the two behaving differently
   * would be a thing to remember for no reason. A drug already present is skipped rather
   * than doubled — a second line is a double dose reading as two separate orders.
   *
   * The template's advice fills the box only when it is EMPTY. Overwriting something the
   * doctor typed for this patient with a stock sentence is the one way this feature could
   * lose work.
   */
  function applyTemplate(template: PrescriptionTemplate) {
    setRows((current) => {
      const already = new Set(current.map((row) => row.drugId))
      const additions = template.content.items
        .filter((item) => !already.has(item.drugId))
        // A drug withdrawn since the template was saved cannot be prescribed; the panel
        // names it, and adding a row the save would refuse helps nobody.
        .filter((item) => formulary.data?.drugs.find((drug) => drug.id === item.drugId)?.isActive)
        .map((item) => {
          const drug = formulary.data?.drugs.find((entry) => entry.id === item.drugId)
          return {
            drugId: item.drugId,
            drugLabel: drug ? drugLabel(drug) : item.drugId,
            dose: item.dose ?? '',
            frequency: item.frequency,
            duration: item.duration,
            route: item.route,
            quantity: item.quantity === null ? '' : String(item.quantity),
            instructions: item.instructions ?? '',
            allergyOverrideReason: null,
          }
        })
      return [...current, ...additions]
    })
    if (template.content.advice && !advice.trim()) setAdvice(template.content.advice)
  }

  /**
   * The sheet on screen, saved as a starting point.
   *
   * Parsed before it is sent, like the prescription save is — a half-filled row would
   * otherwise become a template that produces an unsaveable sheet every time it is used,
   * and the doctor would meet that error weeks later with no idea which template caused it.
   * Never the override reasons: a template applies to everybody.
   */
  function saveAsTemplate(name: string) {
    const parsed = createTemplateRequestSchema.safeParse({
      type: 'prescription',
      name,
      shared: false,
      content: {
        items: rows.map((row) => ({
          drugId: row.drugId,
          dose: row.dose,
          frequency: row.frequency,
          duration: row.duration,
          route: row.route,
          quantity: row.quantity === '' ? '' : Number(row.quantity),
          instructions: row.instructions,
        })),
        advice,
      },
    })

    if (!parsed.success) {
      setTemplateError(parsed.error.issues[0]?.message ?? t('prescription.templates.failed'))
      return
    }
    setTemplateError(null)
    createTemplate.mutate(parsed.data)
  }

  return (
    <div className="space-y-4">
      {open && (
        <PrescriptionTemplates
          templates={(templatesQuery.data?.templates ?? []).filter(isPrescriptionTemplate)}
          drugs={formulary.data?.drugs ?? []}
          onApply={applyTemplate}
          onSave={saveAsTemplate}
          onDelete={(id) => deleteTemplate.mutate(id)}
          canSave={rows.length > 0}
          busy={save.isPending || createTemplate.isPending || deleteTemplate.isPending}
          error={
            templateError ??
            (createTemplate.isError || deleteTemplate.isError
              ? (serverMessage(createTemplate.error ?? deleteTemplate.error) ??
                t('prescription.templates.failed'))
              : null)
          }
        />
      )}

      {open && last && (
        <CopyLast last={last} onCopy={copyLast} disabled={save.isPending} />
      )}

      {open && <DrugPicker drugs={formulary.data?.drugs ?? []} onPick={addDrug} />}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('prescription.none')}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, index) => (
            <li key={row.id ?? `new-${index}`}>
              <Card className="space-y-3 p-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-foreground">{row.drugLabel}</span>
                  {open && (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="ms-auto"
                      aria-label={t('prescription.removeRow')}
                      onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="size-4 text-destructive" aria-hidden />
                    </Button>
                  )}
                </div>

                {/* Column order follows Farhat's own prescription sheet — dose, frequency,
                    duration, qty, route, remarks — so a doctor moving off the old system
                    reads left to right in the order their hand already knows. */}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                  {/* Dose and duration are OPEN — presets over a free field, because
                      "½ tab" and "until review" are real answers no list contains. */}
                  <CodePicker
                    id={`rx-dose-${index}`}
                    label={t('prescription.dose')}
                    value={row.dose}
                    codes={DOSE_PRESETS}
                    allowFree
                    disabled={!open}
                    onChange={(dose) => setRow(index, { dose })}
                  />
                  {/* Frequency and route are CLOSED — the contract refuses anything else. */}
                  <CodePicker
                    id={`rx-freq-${index}`}
                    label={t('prescription.frequency')}
                    value={row.frequency}
                    codes={FREQUENCY_CODES}
                    disabled={!open}
                    invalid={open && !row.frequency}
                    onChange={(frequency) => setRow(index, { frequency })}
                  />
                  <CodePicker
                    id={`rx-duration-${index}`}
                    label={t('prescription.duration')}
                    value={row.duration}
                    codes={DURATION_PRESETS}
                    allowFree
                    disabled={!open}
                    invalid={open && !row.duration}
                    onChange={(duration) => setRow(index, { duration })}
                  />
                  {/* Farhat fills this on every line and the pharmacy dispenses against it.
                      Optional here because the strength and duration often say it, and a
                      required box the prescriber does not know the answer to gets a
                      guess typed into it. */}
                  <div className="space-y-1">
                    <label
                      htmlFor={`rx-qty-${index}`}
                      className="text-xs text-muted-foreground"
                    >
                      {t('prescription.quantity')}
                    </label>
                    <Input
                      id={`rx-qty-${index}`}
                      // inputMode over type="number": a spinner that changes a dispensed
                      // quantity on a stray scroll wheel is not wanted on this screen.
                      inputMode="numeric"
                      value={row.quantity}
                      disabled={!open}
                      onChange={(e) =>
                        setRow(index, { quantity: e.target.value.replace(/\D/g, '').slice(0, 4) })
                      }
                    />
                  </div>
                  <CodePicker
                    id={`rx-route-${index}`}
                    label={t('prescription.route')}
                    value={row.route}
                    codes={ROUTE_CODES}
                    disabled={!open}
                    invalid={open && !row.route}
                    onChange={(route) => setRow(index, { route })}
                  />
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">
                      {t('prescription.instructions')}
                    </span>
                    <Input
                      value={row.instructions}
                      disabled={!open}
                      aria-label={t('prescription.instructions')}
                      onChange={(e) => setRow(index, { instructions: e.target.value })}
                    />
                    {/* AC and PC change whether a drug works, so they are one click. The
                        box stays free text because "with plenty of water" has no code and
                        never will. */}
                    {open && (
                      <div className="flex flex-wrap gap-1">
                        {INSTRUCTION_CODES.map((entry) => (
                          <button
                            key={entry.code}
                            type="button"
                            title={entry.label}
                            onClick={() =>
                              setRow(index, {
                                instructions: row.instructions.includes(entry.code)
                                  ? row.instructions
                                  : [row.instructions.trim(), entry.code]
                                      .filter(Boolean)
                                      .join(' '),
                              })
                            }
                            className="rounded border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            {entry.code}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="prescriptionAdvice">{t('prescription.advice')}</Label>
        <Textarea
          id="prescriptionAdvice"
          rows={2}
          value={advice}
          disabled={!open}
          placeholder={t('prescription.advicePlaceholder')}
          onChange={(e) => setAdvice(e.target.value)}
        />
      </div>

      <FollowUp value={followUpDate} disabled={!open} onChange={setFollowUpDate} />

      {/* Task 4.9 — on screen as soon as the pair exists, long before anyone saves. */}
      {interactions.length > 0 && (
        <InteractionPanel
          interactions={interactions}
          needsAck={needsAck}
          reason={interactionAck}
          onReason={setInteractionAck}
          refused={refusedInteractions !== null}
        />
      )}

      {/* Task 4.8 — the hard block, shown where the doctor is looking. Nothing was saved,
          and the only way past is a reason per drug. */}
      {conflicts && (
        <AllergyBlock
          conflicts={conflicts}
          reasons={overrides}
          onReason={(drugId, reason) => setOverrides((current) => ({ ...current, [drugId]: reason }))}
        />
      )}

      {open && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={!isDirty || save.isPending}
            onClick={() => void doSave().catch(() => undefined)}
          >
            {save.isPending ? t('prescription.saving') : t('prescription.save')}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {save.isError && !conflicts && !refusedInteractions && (
            // The server's own sentence when it wrote one — "your account is not linked to
            // a practitioner" tells a doctor what to do, where "could not save" tells them
            // to find someone who can read a response body.
            <p className="text-sm text-destructive">
              {serverMessage(save.error) ?? t('prescription.failed')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Task 4.15 — when to come back.
 *
 * THE QUICK BUTTONS ARE THE FEATURE, not the date box. A doctor seeing forty patients does
 * not open a calendar widget and count weeks forty times; "in 4 weeks" is one click, and a
 * follow-up that takes one click is a follow-up that actually gets recorded. The intervals
 * are the ones a psychiatric clinic uses — a fortnight after starting an antidepressant, a
 * month or three once someone is stable.
 *
 * It is NOT an appointment. Task 3.10 books a slot; this records the intent to review,
 * which is what most outpatients here actually have. Setting one does not put the patient
 * in the book, and the screen says so rather than letting a doctor believe the desk has
 * been told.
 */
function FollowUp({
  value,
  disabled,
  onChange,
}: {
  value: string
  disabled: boolean
  onChange: (date: string) => void
}) {
  const { t } = useTranslation()

  // Whole weeks from today, in UTC — these are calendar days at the hospital, not instants,
  // and shifting them in the browser's zone is how "in 4 weeks" lands a day out for anyone
  // near midnight.
  function inDays(days: number): string {
    const at = new Date()
    at.setUTCDate(at.getUTCDate() + days)
    return at.toISOString().slice(0, 10)
  }

  const PRESETS = [
    { days: 7, key: 'week1' },
    { days: 14, key: 'week2' },
    { days: 28, key: 'week4' },
    { days: 84, key: 'month3' },
  ] as const

  return (
    <div className="space-y-1.5">
      <Label htmlFor="followUpDate">{t('prescription.followUp.label')}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="followUpDate"
          type="date"
          dir="ltr"
          className="w-44"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        {!disabled &&
          PRESETS.map((preset) => (
            <Button
              key={preset.key}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onChange(inDays(preset.days))}
            >
              {t(`prescription.followUp.${preset.key}`)}
            </Button>
          ))}
        {!disabled && value && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange('')}>
            {t('prescription.followUp.clear')}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t('prescription.followUp.hint')}</p>
    </div>
  )
}

/**
 * Task 4.12 — "Standard depression starter in one click."
 *
 * A whole regimen, unlike task 4.4's complaint templates which hold one phrase each and are
 * stacked. The difference is what the two things ARE: a phrase is a building block, a
 * starting regimen is a decision somebody already made.
 *
 * SHARED ONES FIRST and marked as the hospital's, because that is what a new doctor should
 * reach for before inventing their own — and because a shared template carries more weight
 * than a private one and the reader is entitled to know which they are applying.
 *
 * A DRUG NO LONGER IN THE FORMULARY IS NAMED, not silently dropped, exactly as task 4.11
 * does for a copied sheet. The template was valid when it was saved; a drug withdrawn since
 * makes it partly stale, and the doctor is the one who should decide what to do about that.
 */
function PrescriptionTemplates({
  templates,
  drugs,
  onApply,
  onSave,
  onDelete,
  canSave,
  busy,
  error,
}: {
  templates: PrescriptionTemplate[]
  drugs: DrugSummary[]
  onApply: (template: PrescriptionTemplate) => void
  onSave: (name: string) => void
  onDelete: (id: string) => void
  canSave: boolean
  busy: boolean
  error: string | null
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const byId = useMemo(() => new Map(drugs.map((drug) => [drug.id, drug])), [drugs])

  function withdrawnIn(template: PrescriptionTemplate): string[] {
    return template.content.items
      .map((item) => byId.get(item.drugId))
      .filter((drug) => drug && !drug.isActive)
      .map((drug) => drugLabel(drug as DrugSummary))
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-sm font-medium text-foreground">{t('prescription.templates.title')}</p>

      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('prescription.templates.none')}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {templates.map((template) => {
            const withdrawn = withdrawnIn(template)
            return (
              <li key={template.id} className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onApply(template)}
                  className="rounded-full border border-border bg-background px-3 py-1 text-sm text-foreground hover:border-primary hover:text-primary disabled:opacity-60"
                >
                  {template.name}
                  <span className="ms-2 text-xs text-muted-foreground">
                    {t('prescription.templates.drugCount', {
                      count: template.content.items.length,
                    })}
                  </span>
                  {template.isShared && (
                    <span className="ms-2 text-xs text-primary">
                      {t('prescription.templates.shared')}
                    </span>
                  )}
                </button>
                {/* Only your own. Hiding it is courtesy — the server refuses either way. */}
                {template.isMine && (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label={t('prescription.templates.remove', { name: template.name })}
                    onClick={() => onDelete(template.id)}
                  >
                    <Trash2 className="size-3.5 text-destructive" aria-hidden />
                  </Button>
                )}
                {withdrawn.length > 0 && (
                  <span className="text-xs text-warning">
                    {t('prescription.templates.withdrawn', { drugs: withdrawn.join('، ') })}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {saving ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="rxTemplateName">{t('prescription.templates.name')}</Label>
            <Input
              id="rxTemplateName"
              value={name}
              autoFocus
              placeholder={t('prescription.templates.namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button
            type="button"
            disabled={name.trim().length < 2 || busy}
            onClick={() => {
              onSave(name.trim())
              setName('')
              setSaving(false)
            }}
          >
            {t('prescription.templates.confirm')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setSaving(false)}>
            {t('prescription.templates.cancel')}
          </Button>
        </div>
      ) : (
        // Saving needs a sheet to save. Offering it against an empty table would produce a
        // template with no drugs in it, which the contract refuses anyway.
        canSave && (
          <Button type="button" variant="outline" size="sm" onClick={() => setSaving(true)}>
            <BookmarkPlus className="size-4" aria-hidden />
            {t('prescription.templates.save')}
          </Button>
        )
      )}
    </div>
  )
}

/**
 * Task 4.11 — "one click reloads last visit's drugs."
 *
 * The date and the drug count are ON the button, not behind it. A repeat prescription from
 * last month and one from three years ago deserve different amounts of thought, and a
 * doctor should know which they are about to copy before they copy it rather than after.
 *
 * WITHDRAWN DRUGS ARE NAMED HERE. The server leaves them out — they cannot be saved — and
 * saying which ones is the difference between the doctor noticing the patient is short a
 * medicine and finding out at the next visit. Silence would make their own memory the only
 * safety net, and not needing it is the reason the button exists.
 */
function CopyLast({
  last,
  onCopy,
  disabled,
}: {
  last: LastPrescription
  onCopy: () => void
  disabled: boolean
}) {
  const { t, i18n } = useTranslation()

  const written = new Date(last.writtenAt)
  const when = Number.isNaN(written.getTime())
    ? ''
    : new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(written)

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
      <Button type="button" variant="outline" disabled={disabled} onClick={onCopy}>
        <Copy className="size-4" aria-hidden />
        {t('prescription.copyLast.action', { count: last.items.length, date: when })}
      </Button>

      {last.skipped.length > 0 && (
        <p className="text-sm text-warning">
          {t('prescription.copyLast.skipped', {
            drugs: last.skipped.map((entry) => entry.drugName).join('، '),
          })}
        </p>
      )}

      {/* An override is a judgement made with a patient in the room; it does not travel.
          Said out loud so a doctor copying a sheet that needed one is not surprised by the
          block firing again. */}
      <p className="text-xs text-muted-foreground">{t('prescription.copyLast.hint')}</p>
    </div>
  )
}

/**
 * Type three letters, press Enter, the row appears complete.
 *
 * Filtered in the browser over the whole formulary — a request per keystroke is how the
 * thirty seconds get spent. Enter picks the first match, so a doctor who knows the drug
 * never has to look at the list.
 */
function DrugPicker({ drugs, onPick }: { drugs: DrugSummary[]; onPick: (drug: DrugSummary) => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return drugs
      // A withdrawn drug is not offered — the server refuses it anyway, and a suggestion
      // that 400s is worse than no suggestion.
      .filter((drug) => drug.isActive)
      .filter(
        (drug) =>
          drug.genericName.toLowerCase().includes(q) ||
          (drug.brandName?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 8)
  }, [drugs, query])

  function pick(drug: DrugSummary) {
    onPick(drug)
    setQuery('')
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="drugSearch">{t('prescription.addDrug')}</Label>
      <Input
        id="drugSearch"
        value={query}
        placeholder={t('prescription.addDrugPlaceholder')}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || matches.length === 0) return
          // Enter would submit an enclosing form; here it means "the first one".
          e.preventDefault()
          pick(matches[0])
        }}
      />
      {matches.length > 0 && (
        <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
          {matches.map((drug) => (
            <li key={drug.id}>
              <button
                type="button"
                onClick={() => pick(drug)}
                className="flex w-full items-baseline gap-3 rounded px-2 py-1.5 text-start text-sm hover:bg-muted"
              >
                <Plus className="size-3.5 shrink-0 text-primary" aria-hidden />
                <span className="font-medium text-foreground">{drugLabel(drug)}</span>
                {/* What will be filled in, shown before it is — so the doctor knows what
                    they are accepting rather than discovering it in five boxes. */}
                <span className="text-xs text-muted-foreground" dir="ltr">
                  {[drug.defaultRoute, drug.defaultFreq, drug.defaultDuration]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}


/**
 * Task 4.8 — the hard block, on the screen.
 *
 * Nothing was saved and the screen says so first, because the dangerous misreading of a
 * warning is "it went through but with a note". Each blocked drug gets its OWN reason box:
 * overriding penicillin and overriding aspirin are separate clinical decisions and one
 * sentence covering both is one sentence nobody wrote.
 *
 * `matchedOn` is shown because the doctor is entitled to judge the match. "Matched by
 * name" is a string comparison and sometimes it is wrong; hiding that would make the
 * system look more certain than it is.
 */
function AllergyBlock({
  conflicts,
  reasons,
  onReason,
}: {
  conflicts: AllergyConflict[]
  reasons: Record<string, string>
  onReason: (drugId: string, reason: string) => void
}) {
  const { t } = useTranslation()

  return (
    <div role="alert" className="space-y-3 rounded-lg border-2 border-destructive bg-destructive/12 p-4">
      <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-destructive">
        <AlertTriangle className="size-5 shrink-0" aria-hidden />
        {t('prescription.blocked.title')}
      </p>
      <p className="text-sm text-foreground">{t('prescription.blocked.nothingSaved')}</p>

      {conflicts.map((conflict) => (
        <div key={`${conflict.drugId}-${conflict.allergyId}`} className="space-y-1.5">
          <p className="text-sm">
            <span className="font-semibold text-foreground">{conflict.drugName}</span>
            {' — '}
            {t('prescription.blocked.allergicTo', { substance: conflict.substance })}
            <span className="ms-2 text-xs text-muted-foreground">
              {t(`allergies.severities.${conflict.severity}`)}
              {conflict.reaction ? ` · ${conflict.reaction}` : ''}
              {' · '}
              {t(`prescription.blocked.matchedOn.${conflict.matchedOn}`)}
            </span>
          </p>
          <Input
            value={reasons[conflict.drugId] ?? ''}
            placeholder={t('prescription.blocked.reasonPlaceholder')}
            aria-label={t('prescription.blocked.reasonFor', { drug: conflict.drugName })}
            onChange={(e) => onReason(conflict.drugId, e.target.value)}
          />
        </div>
      ))}

      <p className="text-xs text-muted-foreground">{t('prescription.blocked.hint')}</p>
    </div>
  )
}

/**
 * Task 4.9 - the soft warning.
 *
 * On screen as soon as the pair exists, which is the "warns BEFORE save" half of the
 * done-when: the doctor sees "Fluoxetine + Selegiline - CONTRAINDICATED" while adding the
 * second drug, not after being refused one.
 *
 * Minor and moderate pairs are shown and ask for nothing. A prescriber made to justify
 * every lesser pairing stops reading the ones that matter, which is the failure mode the
 * allergy check's docblock names. Major and contraindicated ask for one sentence about the
 * combination as a whole.
 *
 * THE HONEST LIMIT IS PRINTED HERE, not just left in a docblock, because the schema says to
 * say it in the UI: this is a curated seed and not a licensed interaction database, so no
 * warning means no seeded pair matched - never "safe".
 */
function InteractionPanel({
  interactions,
  needsAck,
  reason,
  onReason,
  refused,
}: {
  interactions: InteractionWarning[]
  needsAck: boolean
  reason: string
  onReason: (reason: string) => void
  refused: boolean
}) {
  const { t } = useTranslation()

  return (
    <div
      // Only the serious ones interrupt a screen reader. A moderate pairing is information.
      role={needsAck ? 'alert' : undefined}
      className={cn(
        'space-y-3 rounded-lg border p-4',
        needsAck ? 'border-2 border-warning bg-warning/12' : 'border-border bg-muted/40',
      )}
    >
      <p
        className={cn(
          'flex items-center gap-2 text-sm font-semibold',
          needsAck ? 'text-warning' : 'text-muted-foreground',
        )}
      >
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        {refused ? t('prescription.interactions.refused') : t('prescription.interactions.title')}
      </p>

      <ul className="space-y-1.5">
        {interactions.map((warning) => (
          <li key={`${warning.drugAId}-${warning.drugBId}`} className="text-sm">
            <span className="font-medium text-foreground">
              {warning.drugAName} + {warning.drugBName}
            </span>
            <span
              className={cn(
                'ms-2 rounded px-1.5 py-0.5 text-xs font-medium',
                interactionNeedsAck(warning.severity)
                  ? 'bg-warning text-warning-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {t(`interactions.severity.${warning.severity}`)}
            </span>
            <p className="text-muted-foreground">{warning.description}</p>
          </li>
        ))}
      </ul>

      {needsAck && (
        <div className="space-y-1.5">
          <Label htmlFor="interactionAck">{t('prescription.interactions.reason')}</Label>
          <Input
            id="interactionAck"
            value={reason}
            placeholder={t('prescription.interactions.reasonPlaceholder')}
            onChange={(e) => onReason(e.target.value)}
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t('prescription.interactions.limit')}</p>
    </div>
  )
}
