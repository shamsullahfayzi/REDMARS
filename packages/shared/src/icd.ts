import { z } from 'zod'

/**
 * ICD-10 diagnosis code lookup (task 2.9). A read-only reference catalog: the
 * doctor types "depress" and the F32.x codes surface. There is no create/update
 * here — the codes are seeded reference data, global to the deployment, not
 * per-facility master data the way drugs or services are.
 *
 * Free-text diagnosis is always allowed (see the Diagnosis model), so this is a
 * suggestion aid, not a gate: a code the search does not return can still be
 * written by hand later. The catalog is deliberately curated toward psychiatry.
 */

export const icdCodeSummarySchema = z.object({
  code: z.string(), // "F32.1"
  title: z.string(),
  titleLocal: z.string().nullable(),
  chapter: z.string().nullable(),
  isBillable: z.boolean(),
})
export type IcdCodeSummary = z.infer<typeof icdCodeSummarySchema>

export const icdSearchResponseSchema = z.object({
  results: z.array(icdCodeSummarySchema),
})
export type IcdSearchResponse = z.infer<typeof icdSearchResponseSchema>

// The typeahead query. Two characters minimum so a single keystroke does not scan
// and return the whole table; the limit is capped so a caller cannot ask for
// everything at once. Both are parsed from the query string, hence coercion.
export const MIN_ICD_QUERY_LENGTH = 2
export const DEFAULT_ICD_LIMIT = 20
export const MAX_ICD_LIMIT = 50

export const icdSearchQuerySchema = z.object({
  q: z.string().trim().min(MIN_ICD_QUERY_LENGTH, 'Type at least two characters').max(100),
  limit: z.coerce.number().int().min(1).max(MAX_ICD_LIMIT).optional(),
})
export type IcdSearchQuery = z.infer<typeof icdSearchQuerySchema>
