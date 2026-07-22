import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import {
  DOSE_PRESETS,
  DURATION_PRESETS,
  FREQUENCY_CODES,
  INSTRUCTION_CODES,
  INTERACTION_SEVERITY_RANK,
  ROUTE_CODES,
  interactionNeedsAck,
  isVisitOpen,
  matchCode,
  savePrescriptionRequestSchema,
  type AllergyConflict,
  type DrugSummary,
  type InteractionWarning,
  type VisitSummary,
} from '@redmars/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CodePicker } from '@/components/ui/code-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useConsultSaver } from '@/hooks/useConsultSave'
import { useInteractionCheck } from '@/hooks/useInteractionCheck'
import {
  allergyConflictsFromError,
  interactionWarningsFromError,
  useFormulary,
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

  const [rows, setRows] = useState<Row[]>([])
  const [advice, setAdvice] = useState('')
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Reasons typed against the block, keyed by drug. Cleared once the save goes through. */
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  /** Task 4.9 — one acknowledgement for the sheet, typed BEFORE the save is attempted. */
  const [interactionAck, setInteractionAck] = useState('')

  const open = isVisitOpen(visit.status)
  const stored = listQuery.data?.prescription ?? null

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
      }),
    [stored],
  )

  const currentSignature = useMemo(
    () =>
      JSON.stringify({
        items: rows.map(({ drugLabel: _label, allergyOverrideReason: _reason, ...rest }) => rest),
        advice,
      }),
    [rows, advice],
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
  }, [rows, advice, overrides, interactionAck, stored, save, t])

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

  return (
    <div className="space-y-4">
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
