import { z } from 'zod'

/**
 * Task 4.13 — the psychiatric note. For Farhat this is the most important clinical
 * artefact in the building, and the schema says so: `ClinicalNote.content` is Json
 * precisely because a mental state examination is shaped nothing like a surgical note.
 *
 * ONE NOTE PER TYPE PER VISIT. Not a list. A doctor writes an assessment across a
 * consultation — types a paragraph, examines the patient, comes back and types more — so
 * the natural verb is PUT, replacing what is there, and the natural key is (visit, type).
 * Vitals went the other way (task 4.3: appended, never edited) and the difference is real:
 * two blood pressures are two measurements, two versions of a formulation are one opinion
 * being written. Every replacement's before-image is in the audit table.
 *
 * EVERY FIELD IS OPTIONAL, WITH ONE FLOOR: the note may not be entirely blank.
 *
 * That is not laziness about validation, it is the shape of the work. A psychiatric
 * assessment is written under interruption — a required field means the half-finished note
 * that survives the interruption is the one thing the system refuses to keep, and the
 * doctor's answer to that is to type a full stop into every box. What IS refused is a note
 * with nothing in it at all, because saving one files a claim that an assessment happened.
 *
 * WHAT IS DELIBERATELY NOT HERE:
 *
 *  - The chief complaint. Task 4.4 owns it, on the visit, in the patient's own words. A
 *    second copy inside the note is two records of one thing that will disagree by the
 *    third edit.
 *  - `soap`. The Prisma comment lists it and Farhat is a psychiatric hospital; a generic
 *    SOAP note is what hospital #2 needs, and `noteType` is a String column, so it costs
 *    a contract change and no migration when that day comes.
 *  - A stored "overall risk". See `highestRiskLevel` — it is derived, and two sources of
 *    truth for how dangerous a patient is would be the worst possible field to let drift.
 */

/**
 * Four types, and the fourth is not in task 4.13's title.
 *
 * `progress` is here because the majority of psychiatric OPD visits are follow-ups: the
 * patient is known, the assessment was done in March, and today is ten minutes about sleep
 * and side effects. Without it the only note that fits a review is `psych_assessment`, and
 * a doctor filling eleven history boxes to record "stable, continue" will very quickly
 * record nothing at all. It is three fields.
 */
export const NOTE_TYPES = ['psych_assessment', 'mse', 'risk_assessment', 'progress'] as const
export const noteTypeSchema = z.enum(NOTE_TYPES)
export type NoteType = z.infer<typeof noteTypeSchema>

/** Ordered least to most severe — `highestRiskLevel` depends on that ordering. */
export const RISK_LEVELS = ['none', 'low', 'moderate', 'high'] as const
export const riskLevelSchema = z.enum(RISK_LEVELS)
export type RiskLevel = z.infer<typeof riskLevelSchema>

/**
 * A blank box means "not written", never an empty string. Stored as null so a note's
 * shape is the same whether a field was skipped or cleared.
 *
 * 4000 characters is a long paragraph, not a limit anyone writing a history will meet.
 * It exists to stop a paste of an entire file into a Json column, not to ration prose.
 */
const noteField = (max = 4000) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .nullish()
    .transform((v) => (v ? v : null))

/** Nothing written anywhere. The one thing a note may not be. */
const BLANK = 'Write something before saving this note.'

const anyWritten = (content: Record<string, string | null>) =>
  Object.values(content).some((value) => value !== null)

// ---- psych_assessment ------------------------------------------------------

/**
 * The first-visit workup, in the order a psychiatrist takes it.
 *
 * `formulation` is the field that matters most and the reason the others exist: the
 * synthesis of what is going on, which is what the next doctor to see this patient
 * actually reads. `plan` is clinical management — investigations, psychotherapy, when to
 * review — and is NOT the prescription's advice field (task 4.7), which is what the
 * patient is told to do at home.
 */
export const psychAssessmentContentSchema = z.object({
  historyOfPresentingIllness: noteField(),
  pastPsychiatricHistory: noteField(),
  pastMedicalHistory: noteField(),
  medicationHistory: noteField(),
  substanceUse: noteField(),
  familyHistory: noteField(),
  personalHistory: noteField(),
  premorbidPersonality: noteField(),
  physicalExamination: noteField(),
  formulation: noteField(),
  plan: noteField(),
})
export type PsychAssessmentContent = z.infer<typeof psychAssessmentContentSchema>

export const PSYCH_ASSESSMENT_FIELDS = [
  'historyOfPresentingIllness',
  'pastPsychiatricHistory',
  'pastMedicalHistory',
  'medicationHistory',
  'substanceUse',
  'familyHistory',
  'personalHistory',
  'premorbidPersonality',
  'physicalExamination',
  'formulation',
  'plan',
] as const satisfies readonly (keyof PsychAssessmentContent)[]

// ---- mse -------------------------------------------------------------------

/**
 * The mental state examination — ten domains, in the standard order, as free text.
 *
 * FREE TEXT AND NOT DROPDOWNS, which is the single most important decision in this file.
 * The MSE has a standard vocabulary, which makes enums tempting and makes them wrong:
 * "affect reactive but constricted, congruent with stated mood" is one finding, and any
 * enum wide enough to hold it is free text with extra steps. A picker that cannot express
 * what was observed does not produce a shorter note, it produces a false one.
 *
 * Speed comes from `MSE_QUICK_PICKS` instead — the task 4.4 pattern, phrases that APPEND
 * to what is already in the box and can then be edited.
 */
export const mseContentSchema = z.object({
  appearanceAndBehaviour: noteField(),
  speech: noteField(),
  mood: noteField(),
  affect: noteField(),
  thoughtForm: noteField(),
  thoughtContent: noteField(),
  perception: noteField(),
  cognition: noteField(),
  insight: noteField(),
  judgement: noteField(),
})
export type MseContent = z.infer<typeof mseContentSchema>

export const MSE_FIELDS = [
  'appearanceAndBehaviour',
  'speech',
  'mood',
  'affect',
  'thoughtForm',
  'thoughtContent',
  'perception',
  'cognition',
  'insight',
  'judgement',
] as const satisfies readonly (keyof MseContent)[]

/**
 * Common findings, one click each, stacked into the box like task 4.4's complaint phrases.
 *
 * English, and not translated, for the same reason `FREQUENCY_CODES` is English: this is
 * clinical shorthand that goes into a record other clinicians read, not interface chrome.
 * A doctor who wants to write the finding in Dari types it — the box is theirs.
 *
 * Short on purpose. A picker with thirty options per domain is slower to read than typing.
 */
export const MSE_QUICK_PICKS = {
  appearanceAndBehaviour: [
    'Well kempt, cooperative',
    'Unkempt, poor self-care',
    'Restless, psychomotor agitation',
    'Psychomotor retardation',
    'Poor eye contact',
  ],
  speech: ['Normal rate, volume and tone', 'Pressured', 'Slow, monosyllabic', 'Mute'],
  mood: ['Euthymic', 'Low', 'Elated', 'Anxious', 'Irritable'],
  affect: ['Reactive, congruent', 'Blunted', 'Flat', 'Labile', 'Incongruent'],
  thoughtForm: ['Linear and goal-directed', 'Circumstantial', 'Flight of ideas', 'Loosening of associations'],
  thoughtContent: [
    'No delusions elicited',
    'Persecutory delusions',
    'Delusions of reference',
    'Obsessions',
    'Suicidal ideation',
  ],
  perception: ['No hallucinations elicited', 'Auditory hallucinations', 'Visual hallucinations'],
  cognition: ['Alert and oriented to time, place and person', 'Disoriented', 'Poor attention and concentration'],
  insight: ['Full — accepts illness and need for treatment', 'Partial', 'Absent'],
  judgement: ['Intact', 'Impaired'],
} as const satisfies Record<(typeof MSE_FIELDS)[number], readonly string[]>

// ---- risk_assessment -------------------------------------------------------

/**
 * The one form here that is structured, and it is structured for a reason nothing else
 * in this file shares: a risk level has to be READABLE WITHOUT READING.
 *
 * "High risk of self-harm, has a plan and access to means" written into a paragraph is a
 * paragraph — it cannot raise a banner, cannot sort a list, and cannot be found by the
 * doctor covering clinic next week who has ninety seconds. A level per domain can do all
 * three. So the level is a field and the words that justify it sit beside it.
 */
export const RISK_DOMAINS = ['selfHarm', 'harmToOthers', 'selfNeglect', 'vulnerability'] as const
export type RiskDomain = (typeof RISK_DOMAINS)[number]

/**
 * Both parts required as a pair, and the domain object is not optional.
 *
 * This is a PUT of the whole note, so a body missing `harmToOthers` is a client that
 * forgot a field, not a doctor who skipped one — and answering it with a silent 'none'
 * would write "no risk of harm to others" onto the record on the strength of a bug.
 */
const riskDomainSchema = z.object({
  level: riskLevelSchema,
  detail: noteField(1000),
})
export type RiskDomainEntry = z.infer<typeof riskDomainSchema>

export const riskAssessmentContentSchema = z.object({
  /** Suicide and self-harm — ideation, intent, plan, means, previous attempts. */
  selfHarm: riskDomainSchema,
  harmToOthers: riskDomainSchema,
  /** Not eating, not washing, not taking medication, not safe at home alone. */
  selfNeglect: riskDomainSchema,
  /** Risk FROM others: exploitation, abuse, coercion. The one people leave out. */
  vulnerability: riskDomainSchema,
  protectiveFactors: noteField(2000),
  /** What is being DONE about it. Required the moment any domain is moderate or high. */
  plan: noteField(2000),
})
export type RiskAssessmentContent = z.infer<typeof riskAssessmentContentSchema>

/** Severity order, from `RISK_LEVELS`. Used by the two write rules and by the badge. */
const severity = (level: RiskLevel) => RISK_LEVELS.indexOf(level)

/**
 * The worst level across the four domains. DERIVED, never stored.
 *
 * A stored overall level is a field that can disagree with the four it summarises, and
 * the disagreement would be discovered by whoever trusted the summary. Shared so the
 * badge on the screen and anything that later filters on risk cannot compute it
 * differently.
 */
export function highestRiskLevel(content: RiskAssessmentContent): RiskLevel {
  return RISK_DOMAINS.reduce<RiskLevel>(
    (worst, domain) =>
      severity(content[domain].level) > severity(worst) ? content[domain].level : worst,
    'none',
  )
}

// ---- progress --------------------------------------------------------------

export const progressContentSchema = z.object({
  /** How they have been since the last visit — the whole point of a review. */
  progress: noteField(),
  /** A line, not an examination. A full MSE is its own note. */
  mentalState: noteField(),
  plan: noteField(),
})
export type ProgressContent = z.infer<typeof progressContentSchema>

export const PROGRESS_FIELDS = [
  'progress',
  'mentalState',
  'plan',
] as const satisfies readonly (keyof ProgressContent)[]

// ---- write rules -----------------------------------------------------------

/**
 * The refinements above the plain shapes — and they are applied on the way IN ONLY.
 *
 * A stored note must always be readable. If these rules ever tighten, re-running them on
 * read would turn every note written under the old rules into a 500 and take the record
 * away from the doctor who needs it, which is a far worse outcome than the loose note. So
 * the response schema below uses the unrefined shapes, and these guard the write.
 */
const psychAssessmentWriteSchema = psychAssessmentContentSchema.refine(anyWritten, {
  message: BLANK,
})
const mseWriteSchema = mseContentSchema.refine(anyWritten, { message: BLANK })
const progressWriteSchema = progressContentSchema.refine(anyWritten, { message: BLANK })

/**
 * The two rules that make this a safety feature rather than a form.
 *
 * A RATING OF MODERATE OR HIGH MUST BE JUSTIFIED IN WORDS. "High" on its own is not an
 * assessment; it is a checkbox that tells the next clinician to be worried without telling
 * them what about, and it is worse than nothing because it looks like documentation.
 *
 * ANY MODERATE OR HIGH RATING MUST HAVE A PLAN. This is the one that matters. Recording
 * high suicide risk and moving on is the note that gets read out at the inquiry — and the
 * moment the system lets it be saved, it is the system's default. The plan may be
 * "reviewed in one week, family informed, means restricted" or it may be admission; what
 * it may not be is absent.
 *
 * Neither rule fires below moderate, because low risk with no separate plan is an ordinary
 * and honest thing to record.
 */
const riskAssessmentWriteSchema = riskAssessmentContentSchema.superRefine((content, ctx) => {
  const domainsWritten = RISK_DOMAINS.some(
    (domain) => content[domain].level !== 'none' || content[domain].detail !== null,
  )
  if (!domainsWritten && !content.protectiveFactors && !content.plan) {
    // An untouched form defaults to 'none' everywhere, so saving it unchanged would file
    // "no risk in any domain" on the strength of a doctor opening a tab. Nil risk is a
    // finding worth recording — it just has to be written down rather than defaulted into.
    ctx.addIssue({
      code: 'custom',
      path: ['selfHarm', 'detail'],
      message: 'Record what was assessed, even if the risk is nil.',
    })
  }

  let elevated = false
  for (const domain of RISK_DOMAINS) {
    if (severity(content[domain].level) < severity('moderate')) continue
    elevated = true
    if (!content[domain].detail) {
      ctx.addIssue({
        code: 'custom',
        path: [domain, 'detail'],
        message: 'A moderate or high rating has to say what it is based on.',
      })
    }
  }

  if (elevated && !content.plan) {
    ctx.addIssue({
      code: 'custom',
      path: ['plan'],
      message: 'This patient is at moderate or high risk. Write what is being done about it.',
    })
  }
})

// ---- the wire --------------------------------------------------------------

/**
 * PUT /visits/:id/notes — a discriminated union on `noteType`, the same shape task 4.12
 * gave templates and for the same reason: `content` is a Json column, and the union is
 * what makes reading `content.formulation` off a risk assessment a compile error rather
 * than an undefined rendered as a blank box.
 */
export const saveClinicalNoteRequestSchema = z.discriminatedUnion('noteType', [
  z.object({ noteType: z.literal('psych_assessment'), content: psychAssessmentWriteSchema }),
  z.object({ noteType: z.literal('mse'), content: mseWriteSchema }),
  z.object({ noteType: z.literal('risk_assessment'), content: riskAssessmentWriteSchema }),
  z.object({ noteType: z.literal('progress'), content: progressWriteSchema }),
])
export type SaveClinicalNoteRequest = z.infer<typeof saveClinicalNoteRequestSchema>

const noteBase = {
  id: z.uuid(),
  visitId: z.uuid(),
  /**
   * Who wrote it. Nullable, and the write endpoint does NOT refuse an account with no
   * practitioner record — unlike a prescription, which cannot be signed by nobody. A
   * prescription refused can be written again in a minute; twenty minutes of assessment
   * refused at the save button is gone, and the doctor cannot re-derive it from the
   * patient who has left. The author is best-effort, the note is not.
   */
  practitionerId: z.string().nullable(),
  practitionerName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}

export const clinicalNoteSchema = z.discriminatedUnion('noteType', [
  z.object({
    ...noteBase,
    noteType: z.literal('psych_assessment'),
    content: psychAssessmentContentSchema,
  }),
  z.object({ ...noteBase, noteType: z.literal('mse'), content: mseContentSchema }),
  z.object({
    ...noteBase,
    noteType: z.literal('risk_assessment'),
    content: riskAssessmentContentSchema,
  }),
  z.object({ ...noteBase, noteType: z.literal('progress'), content: progressContentSchema }),
])
export type ClinicalNote = z.infer<typeof clinicalNoteSchema>

export type RiskAssessmentNote = Extract<ClinicalNote, { noteType: 'risk_assessment' }>

/** Narrow a note off the list without casting. Same job as task 4.12's template guards. */
export function isRiskAssessmentNote(note: ClinicalNote): note is RiskAssessmentNote {
  return note.noteType === 'risk_assessment'
}

/** Every note on the visit in one request — there are at most four. */
export const clinicalNoteListResponseSchema = z.object({
  notes: z.array(clinicalNoteSchema),
})
export type ClinicalNoteListResponse = z.infer<typeof clinicalNoteListResponseSchema>

/** A fresh, empty risk form. Spelled once so the screen and the tests start from the same place. */
export function emptyRiskAssessment(): RiskAssessmentContent {
  return {
    selfHarm: { level: 'none', detail: null },
    harmToOthers: { level: 'none', detail: null },
    selfNeglect: { level: 'none', detail: null },
    vulnerability: { level: 'none', detail: null },
    protectiveFactors: null,
    plan: null,
  }
}
