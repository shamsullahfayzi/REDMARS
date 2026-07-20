import { z } from 'zod'

/**
 * Drug–drug interaction check (task 2.11).
 *
 * HONEST LIMIT — say it in the UI, not just here. This is NOT a comprehensive
 * interaction database. The real ones are commercially licensed; this is a curated
 * seed of the most dangerous psychiatric pairs, matched against what a facility
 * actually stocks. A checker that returns nothing means "no seeded pair matched",
 * NOT "safe". It is a warning aid, never a safety net — a clear result is not
 * clearance. The prescriber's judgement is the control; this only catches the
 * handful of pairs we thought to seed.
 *
 * The check is a read over the caller's own facility: given the drug ids on a
 * prescription (or a what-if list), it returns the seeded interactions among them.
 */

// The four severities the DrugInteraction model stores, weakest to strongest. The
// UI colours contraindicated/major as danger, moderate as warning, minor as info.
export const interactionSeveritySchema = z.enum(['minor', 'moderate', 'major', 'contraindicated'])
export type InteractionSeverity = z.infer<typeof interactionSeveritySchema>

// Rank for sorting worst-first, both on the wire (service) and in the table.
export const INTERACTION_SEVERITY_RANK: Record<InteractionSeverity, number> = {
  contraindicated: 3,
  major: 2,
  moderate: 1,
  minor: 0,
}

// A check needs at least two drugs to have a pair; the cap stops a caller asking
// the server to cross-join an unbounded list.
export const MIN_INTERACTION_DRUGS = 2
export const MAX_INTERACTION_DRUGS = 25

// drugIds arrives as a query string — a comma-separated list ("a,b,c") or, if the
// client repeats the param, an array. Normalise both to a string[] before validating
// each is a uuid. Deduplication is the service's job (a list may name a drug twice).
const toIdArray = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return value
}

export const interactionCheckQuerySchema = z.object({
  drugIds: z.preprocess(
    toIdArray,
    z.array(z.uuid()).min(MIN_INTERACTION_DRUGS).max(MAX_INTERACTION_DRUGS),
  ),
})
export type InteractionCheckQuery = z.infer<typeof interactionCheckQuerySchema>

// One flagged pair. Names travel with the ids so the UI reads "Fluoxetine +
// Duloxetine" without a second round-trip to resolve them.
export const interactionWarningSchema = z.object({
  drugAId: z.uuid(),
  drugAName: z.string(),
  drugBId: z.uuid(),
  drugBName: z.string(),
  severity: interactionSeveritySchema,
  description: z.string(),
})
export type InteractionWarning = z.infer<typeof interactionWarningSchema>

export const interactionCheckResponseSchema = z.object({
  // Empty means no seeded pair matched — NOT a clean bill of health. See the note above.
  interactions: z.array(interactionWarningSchema),
})
export type InteractionCheckResponse = z.infer<typeof interactionCheckResponseSchema>
