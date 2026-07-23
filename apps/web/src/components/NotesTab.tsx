import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Plus } from 'lucide-react'
import {
  MSE_FIELDS,
  MSE_QUICK_PICKS,
  NOTE_TYPES,
  PROGRESS_FIELDS,
  PSYCH_ASSESSMENT_FIELDS,
  RISK_DOMAINS,
  RISK_LEVELS,
  highestRiskLevel,
  isVisitOpen,
  saveClinicalNoteRequestSchema,
  type ClinicalNote,
  type NoteType,
  type RiskAssessmentContent,
  type RiskLevel,
  type SaveClinicalNoteRequest,
  type VisitSummary,
} from '@redmars/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/auth/authContext'
import { useConsultSaver } from '@/hooks/useConsultSave'
import { useClinicalNotes, useSaveClinicalNote } from '@/hooks/useClinicalNotes'
import { serverMessage } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * Task 4.13 — the psychiatric note.
 *
 * FOUR SECTIONS, ONE TAB. They are one screen because they are one act: a doctor writes
 * the history, examines the mental state and assesses risk in a single consultation, and
 * making them four tabs in the strip would put the risk assessment four keystrokes from
 * the assessment that motivated it.
 *
 * ALL FOUR STAY IN STATE AT ONCE and F2 saves every section that changed. Only the sections
 * that changed — an untouched risk assessment defaults to nil across the board, and saving
 * it unchanged would file "no risk anywhere" on the strength of a doctor opening the tab.
 * The server refuses that too (see the contract); this makes sure it is never asked.
 *
 * Textareas grow rather than scroll, because a formulation is not a caption and a box that
 * shows three lines of eleven encourages a note that is three lines long.
 */

type TextDraft = Record<string, string>
type RiskDraft = {
  domains: Record<(typeof RISK_DOMAINS)[number], { level: RiskLevel; detail: string }>
  protectiveFactors: string
  plan: string
}

interface Drafts {
  psych_assessment: TextDraft
  mse: TextDraft
  risk_assessment: RiskDraft
  progress: TextDraft
}

/** The free-text sections, so the three of them are described once rather than three times. */
const TEXT_SECTIONS = {
  psych_assessment: PSYCH_ASSESSMENT_FIELDS,
  mse: MSE_FIELDS,
  progress: PROGRESS_FIELDS,
} as const

type TextSection = keyof typeof TEXT_SECTIONS

const blankText = (fields: readonly string[]): TextDraft =>
  Object.fromEntries(fields.map((field) => [field, '']))

const blankRisk = (): RiskDraft => ({
  domains: {
    selfHarm: { level: 'none', detail: '' },
    harmToOthers: { level: 'none', detail: '' },
    selfNeglect: { level: 'none', detail: '' },
    vulnerability: { level: 'none', detail: '' },
  },
  protectiveFactors: '',
  plan: '',
})

const blankDrafts = (): Drafts => ({
  psych_assessment: blankText(PSYCH_ASSESSMENT_FIELDS),
  mse: blankText(MSE_FIELDS),
  risk_assessment: blankRisk(),
  progress: blankText(PROGRESS_FIELDS),
})

/** An empty box is "not written", never an empty string — the same rule as the contract. */
const clean = (value: string): string | null => (value.trim() ? value.trim() : null)

/**
 * The risk draft as the wire wants it — typed rather than a bag, because `highestRiskLevel`
 * takes it and the badge on the section strip is computed from the DRAFT, not from what was
 * last saved. A doctor who has just set self-harm to high should see that on the button
 * before they press save, not after.
 */
function toRiskContent(draft: RiskDraft): RiskAssessmentContent {
  return {
    selfHarm: { level: draft.domains.selfHarm.level, detail: clean(draft.domains.selfHarm.detail) },
    harmToOthers: {
      level: draft.domains.harmToOthers.level,
      detail: clean(draft.domains.harmToOthers.detail),
    },
    selfNeglect: {
      level: draft.domains.selfNeglect.level,
      detail: clean(draft.domains.selfNeglect.detail),
    },
    vulnerability: {
      level: draft.domains.vulnerability.level,
      detail: clean(draft.domains.vulnerability.detail),
    },
    protectiveFactors: clean(draft.protectiveFactors),
    plan: clean(draft.plan),
  }
}

/** A draft as the wire wants it. One place, so what is compared is what is sent. */
function toContent(noteType: NoteType, drafts: Drafts): Record<string, unknown> {
  if (noteType === 'risk_assessment') return toRiskContent(drafts.risk_assessment)
  return Object.fromEntries(
    Object.entries(drafts[noteType]).map(([field, value]) => [field, clean(value)]),
  )
}

/**
 * What an untouched section serialises to — every text field null, every risk domain 'none'.
 *
 * This is the baseline for a note that does NOT exist yet. Comparing against '' instead
 * would mark every section dirty the instant the screen opened (a blank draft is not the
 * empty string), and F2/F4/F9 would then try to save four empty notes — which the contract
 * rightly refuses, taking save, print and finish down with it. A note is optional; a blank
 * one is clean, not unsaved.
 */
const EMPTY_SIGNATURE = Object.fromEntries(
  NOTE_TYPES.map((noteType) => [noteType, JSON.stringify(toContent(noteType, blankDrafts()))]),
) as Record<NoteType, string>

export function NotesTab({ visit }: { visit: VisitSummary }) {
  const { t } = useTranslation()
  const { roles } = useAuth()
  const notesQuery = useClinicalNotes(visit.id)
  const saveNote = useSaveClinicalNote(visit.id)

  const [section, setSection] = useState<NoteType>('psych_assessment')
  const [drafts, setDrafts] = useState<Drafts>(blankDrafts)
  /** What is currently on the server, as JSON, per type. Dirty is a comparison against this. */
  const [baseline, setBaseline] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<NoteType, string>>>({})

  const open = isVisitOpen(visit.status)
  const notes = notesQuery.data?.notes

  /**
   * Fill the forms from the server ONCE. A refetch that landed mid-sentence and replaced
   * what the doctor was typing would be the single worst bug this screen could have — the
   * same reason task 4.4 keeps its own baseline rather than reading off the visit.
   */
  useEffect(() => {
    if (loaded || !notes) return
    setDrafts(fromNotes(notes))
    setBaseline(baselineOf(notes))
    setLoaded(true)
  }, [loaded, notes])

  const dirtyTypes = useMemo(
    () =>
      NOTE_TYPES.filter(
        (noteType) =>
          JSON.stringify(toContent(noteType, drafts)) !==
          (baseline[noteType] ?? EMPTY_SIGNATURE[noteType]),
      ),
    [drafts, baseline],
  )

  /**
   * Saves only what changed, one section at a time.
   *
   * Sequential rather than parallel: four PUTs racing at the same visit produce four audit
   * rows in an order that does not match what the doctor did, and a failure in the middle
   * of a Promise.all leaves nobody able to say which sections landed. Each section that
   * refuses keeps its own message under its own heading.
   */
  const save = useCallback(async () => {
    const failures: Partial<Record<NoteType, string>> = {}
    const saved: NoteType[] = []

    for (const noteType of NOTE_TYPES) {
      if (JSON.stringify(toContent(noteType, drafts)) === (baseline[noteType] ?? EMPTY_SIGNATURE[noteType]))
        continue

      const parsed = saveClinicalNoteRequestSchema.safeParse({
        noteType,
        content: toContent(noteType, drafts),
      })
      if (!parsed.success) {
        failures[noteType] = parsed.error.issues[0]?.message ?? t('notes.failed')
        continue
      }

      try {
        await saveNote.mutateAsync(parsed.data as SaveClinicalNoteRequest)
        saved.push(noteType)
      } catch (error) {
        failures[noteType] = serverMessage(error) ?? t('notes.failed')
      }
    }

    setErrors(failures)
    if (saved.length > 0) {
      setBaseline((current) => {
        const next = { ...current }
        for (const noteType of saved) next[noteType] = JSON.stringify(toContent(noteType, drafts))
        return next
      })
    }
    // Thrown, so F9 cannot finish the visit over a risk assessment that never saved.
    if (Object.keys(failures).length > 0) throw new Error('clinical note refused')
  }, [drafts, baseline, saveNote, t])

  useConsultSaver('notes', { isDirty: dirtyTypes.length > 0, save })

  /**
   * Doctor only, and this is courtesy — the server answers 403 to everyone else including
   * the admin, which is the one place R2 stops. Saying so beats rendering eleven boxes
   * that refuse at the save button.
   */
  if (!roles.includes('doctor')) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">{t('notes.denied')}</p>
      </Card>
    )
  }

  if (notesQuery.isPending) {
    return <p className="text-sm text-muted-foreground">{t('notes.loading')}</p>
  }
  if (notesQuery.isError) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-destructive">{t('notes.error')}</p>
      </Card>
    )
  }

  const author = notes?.find((note) => note.noteType === section)

  return (
    <div className="space-y-4">
      <SectionStrip
        active={section}
        onChange={setSection}
        dirty={dirtyTypes}
        written={NOTE_TYPES.filter((noteType) => Boolean(baseline[noteType]))}
        risk={highestRiskLevel(toRiskContent(drafts.risk_assessment))}
      />

      <Card className="space-y-5 p-4">
        <p className="text-sm text-muted-foreground">{t(`notes.hint.${section}`)}</p>

        {section === 'risk_assessment' ? (
          <RiskForm
            draft={drafts.risk_assessment}
            disabled={!open}
            onChange={(next) => setDrafts((current) => ({ ...current, risk_assessment: next }))}
          />
        ) : (
          <TextForm
            section={section}
            draft={drafts[section]}
            disabled={!open}
            onChange={(field, value) =>
              setDrafts((current) => ({
                ...current,
                [section]: { ...current[section], [field]: value },
              }))
            }
          />
        )}

        {errors[section] && <p className="text-sm text-destructive">{errors[section]}</p>}

        <div className="flex flex-wrap items-center gap-3">
          {open && (
            <Button
              type="button"
              disabled={dirtyTypes.length === 0 || saveNote.isPending}
              onClick={() => void save().catch(() => undefined)}
            >
              {saveNote.isPending ? t('notes.saving') : t('notes.save')}
            </Button>
          )}
          {author?.practitionerName && (
            <span className="text-xs text-muted-foreground">
              {t('notes.author', { name: author.practitionerName })}
            </span>
          )}
          {!open && <span className="text-sm text-muted-foreground">{t('notes.closed')}</span>}
        </div>
      </Card>
    </div>
  )
}

/**
 * The four sections. A dot marks one that has something in it, so a doctor picking up
 * someone else's half-finished consultation can see where to look without opening each.
 */
function SectionStrip({
  active,
  onChange,
  dirty,
  written,
  risk,
}: {
  active: NoteType
  onChange: (noteType: NoteType) => void
  dirty: readonly NoteType[]
  written: readonly NoteType[]
  risk: RiskLevel
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap gap-2">
      {NOTE_TYPES.map((noteType) => (
        <button
          key={noteType}
          type="button"
          onClick={() => onChange(noteType)}
          aria-pressed={active === noteType}
          className={cn(
            'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            active === noteType
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          {t(`notes.type.${noteType}`)}
          {(written.includes(noteType) || dirty.includes(noteType)) && (
            <span
              aria-label={t(dirty.includes(noteType) ? 'notes.unsaved' : 'notes.written')}
              className={cn(
                'size-1.5 rounded-full',
                dirty.includes(noteType) ? 'bg-warning' : 'bg-primary',
              )}
            />
          )}
          {/* The one derived value that belongs on a button: a doctor should not have to
              open the risk section to learn there is a reason to. */}
          {noteType === 'risk_assessment' && risk !== 'none' && (
            <Badge variant={riskVariant(risk)}>{t(`notes.risk.level.${risk}`)}</Badge>
          )}
        </button>
      ))}
    </div>
  )
}

/** The three free-text sections, which differ only in their field list. */
function TextForm({
  section,
  draft,
  disabled,
  onChange,
}: {
  section: TextSection
  draft: TextDraft
  disabled: boolean
  onChange: (field: string, value: string) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      {TEXT_SECTIONS[section].map((field) => (
        <div key={field} className="space-y-1.5">
          <Label htmlFor={`note-${section}-${field}`}>{t(`notes.field.${field}`)}</Label>
          {/* Task 4.4's stacking, applied to the one section with a standard vocabulary.
              The phrases go INTO the box and can then be edited — a picker that replaced
              the box would be the dropdown this contract deliberately refused to be. */}
          {section === 'mse' && (
            <QuickPicks
              field={field}
              disabled={disabled}
              onPick={(phrase) => onChange(field, append(draft[field], phrase))}
            />
          )}
          <Textarea
            id={`note-${section}-${field}`}
            rows={3}
            value={draft[field] ?? ''}
            disabled={disabled}
            onChange={(event) => onChange(field, event.target.value)}
          />
        </div>
      ))}
    </div>
  )
}

/** Common findings, one click each. English clinical shorthand — see the contract. */
function QuickPicks({
  field,
  disabled,
  onPick,
}: {
  field: string
  disabled: boolean
  onPick: (phrase: string) => void
}) {
  const picks = MSE_QUICK_PICKS[field as keyof typeof MSE_QUICK_PICKS]
  if (!picks || disabled) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {picks.map((phrase) => (
        <Button
          key={phrase}
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onPick(phrase)}
        >
          <Plus className="size-3.5" aria-hidden />
          <span dir="ltr">{phrase}</span>
        </Button>
      ))}
    </div>
  )
}

/** Comma-joined and de-duplicated, exactly as task 4.4 stacks complaint phrases. */
function append(current: string, phrase: string): string {
  const parts = current
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.includes(phrase)) return current
  return [...parts, phrase].join(', ')
}

/**
 * The risk assessment — the one structured form, and the one that argues with the doctor.
 *
 * The warning below fires the moment a rating reaches moderate with no plan written, rather
 * than waiting for the save to be refused. A rule a form enforces only at the save button
 * is a rule the doctor meets as an obstacle; a rule it states while they are still looking
 * at the rating is the rule doing its job.
 */
function RiskForm({
  draft,
  disabled,
  onChange,
}: {
  draft: RiskDraft
  disabled: boolean
  onChange: (next: RiskDraft) => void
}) {
  const { t } = useTranslation()

  const elevated = RISK_DOMAINS.filter(
    (domain) => RISK_LEVELS.indexOf(draft.domains[domain].level) >= RISK_LEVELS.indexOf('moderate'),
  )

  return (
    <div className="space-y-5">
      {RISK_DOMAINS.map((domain) => {
        const entry = draft.domains[domain]
        const needsDetail = elevated.includes(domain) && !entry.detail.trim()
        return (
          <div key={domain} className="space-y-1.5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1 space-y-1.5">
                <Label htmlFor={`risk-${domain}`}>{t(`notes.risk.domain.${domain}`)}</Label>
                <Textarea
                  id={`risk-${domain}`}
                  rows={2}
                  value={entry.detail}
                  disabled={disabled}
                  placeholder={t('notes.risk.detail')}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      domains: {
                        ...draft.domains,
                        [domain]: { ...entry, detail: event.target.value },
                      },
                    })
                  }
                />
              </div>
              <div className="w-40 space-y-1.5">
                <Label htmlFor={`risk-level-${domain}`}>{t('notes.risk.levelLabel')}</Label>
                <Select
                  id={`risk-level-${domain}`}
                  value={entry.level}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      domains: {
                        ...draft.domains,
                        [domain]: { ...entry, level: event.target.value as RiskLevel },
                      },
                    })
                  }
                >
                  {RISK_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {t(`notes.risk.level.${level}`)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {needsDetail && (
              <p className="text-xs text-warning">{t('notes.risk.needDetail')}</p>
            )}
          </div>
        )
      })}

      <div className="space-y-1.5">
        <Label htmlFor="risk-protective">{t('notes.risk.protectiveFactors')}</Label>
        <Textarea
          id="risk-protective"
          rows={2}
          value={draft.protectiveFactors}
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, protectiveFactors: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="risk-plan">{t('notes.risk.plan')}</Label>
        <Textarea
          id="risk-plan"
          rows={3}
          value={draft.plan}
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, plan: event.target.value })}
        />
        {elevated.length > 0 && !draft.plan.trim() && (
          <p className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t('notes.risk.needPlan')}
          </p>
        )}
      </div>
    </div>
  )
}

function riskVariant(level: RiskLevel): 'warning' | 'danger' | 'muted' {
  if (level === 'high') return 'danger'
  if (level === 'moderate') return 'warning'
  return 'muted'
}

/** Server content into form drafts — nulls become empty boxes. */
function fromNotes(notes: readonly ClinicalNote[]): Drafts {
  const drafts = blankDrafts()

  for (const note of notes) {
    if (note.noteType === 'risk_assessment') {
      const content = note.content
      drafts.risk_assessment = {
        domains: {
          selfHarm: { level: content.selfHarm.level, detail: content.selfHarm.detail ?? '' },
          harmToOthers: {
            level: content.harmToOthers.level,
            detail: content.harmToOthers.detail ?? '',
          },
          selfNeglect: {
            level: content.selfNeglect.level,
            detail: content.selfNeglect.detail ?? '',
          },
          vulnerability: {
            level: content.vulnerability.level,
            detail: content.vulnerability.detail ?? '',
          },
        },
        protectiveFactors: content.protectiveFactors ?? '',
        plan: content.plan ?? '',
      }
      continue
    }
    drafts[note.noteType] = Object.fromEntries(
      Object.entries(note.content).map(([field, value]) => [field, value ?? '']),
    )
  }

  return drafts
}

/** What the server holds, as the same JSON the dirty check produces from a draft. */
function baselineOf(notes: readonly ClinicalNote[]): Record<string, string> {
  const drafts = fromNotes(notes)
  return Object.fromEntries(
    notes.map((note) => [note.noteType, JSON.stringify(toContent(note.noteType, drafts))]),
  )
}
