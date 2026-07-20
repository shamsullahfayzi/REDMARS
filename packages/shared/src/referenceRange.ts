import { z } from 'zod'

/**
 * Reference range contract (task 2.8) — the normal-value bands for one lab test.
 *
 * A range says "for this test, this gender, this age band, normal is low..high"
 * (numeric) or "normal is this text" (e.g. "Negative"). The SAME number can be
 * normal for a woman and low for a man — haemoglobin ~13–17 g/dL male, ~12–15
 * female — so gender and age are part of the key, not decoration. The flag logic
 * (L/H/normal) that reads these bands runs at result-entry in a later phase; here
 * we only define and edit the bands.
 *
 * A lab value is NOT money: it crosses the wire as a decimal STRING for exactness
 * (a JS float would corrupt it) but is emitted with `.toString()`, so 13.5 stays
 * "13.5" — no forced trailing zeros the way a price is "13.50". The column is
 * Decimal(12,4): up to 8 integer digits and 4 places.
 */

export const genderSchema = z.enum(['male', 'female', 'other', 'unknown'])
export type Gender = z.infer<typeof genderSchema>

// A gender select carries '' for "any" — a range with no gender applies to all.
const optionalGender = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  genderSchema.optional(),
)

// Whole years, 0–200. Blank means "no bound on this side". Accepts a JSON number
// or a form string so the same schema serves the API and the browser form.
const optionalAge = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.number().int().min(0).max(200).optional(),
)

// An optional lab value: a non-negative decimal string (up to 8 integer digits + 4
// places — the shape of Decimal(12,4)), or blank. Blank becomes undefined, stored
// as null. Kept as a string end-to-end so the exact value survives the wire.
const optionalLabValue = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,4})?$/, 'Enter a valid value')
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : undefined))

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined))

export const referenceRangeSummarySchema = z.object({
  id: z.uuid(),
  testId: z.uuid(),
  gender: genderSchema.nullable(),
  minAge: z.number().int().nullable(),
  maxAge: z.number().int().nullable(),
  low: z.string().nullable(),
  high: z.string().nullable(),
  textValue: z.string().nullable(),
})
export type ReferenceRangeSummary = z.infer<typeof referenceRangeSummarySchema>

export const referenceRangeListResponseSchema = z.object({
  ranges: z.array(referenceRangeSummarySchema),
})
export type ReferenceRangeListResponse = z.infer<typeof referenceRangeListResponseSchema>

// The writable fields, with the rules a band must obey. A range is EITHER numeric
// (a low and/or high bound) OR a text result — but never empty, and never
// backwards (low > high, or minAge > maxAge). The testId comes from the route, not
// the body, so it cannot be forged into another test.
export const referenceRangeFieldsSchema = z
  .object({
    gender: optionalGender,
    minAge: optionalAge,
    maxAge: optionalAge,
    low: optionalLabValue,
    high: optionalLabValue,
    textValue: optionalText(60),
  })
  .refine((v) => v.low !== undefined || v.high !== undefined || v.textValue !== undefined, {
    message: 'A range needs a low/high value or a text result',
    path: ['low'],
  })
  .refine((v) => v.low === undefined || v.high === undefined || Number(v.low) <= Number(v.high), {
    message: 'Low must not exceed high',
    path: ['high'],
  })
  .refine((v) => v.minAge === undefined || v.maxAge === undefined || v.minAge <= v.maxAge, {
    message: 'Min age must not exceed max age',
    path: ['maxAge'],
  })

export const createReferenceRangeRequestSchema = referenceRangeFieldsSchema
export type CreateReferenceRangeRequest = z.infer<typeof createReferenceRangeRequestSchema>

export const updateReferenceRangeRequestSchema = referenceRangeFieldsSchema
export type UpdateReferenceRangeRequest = z.infer<typeof updateReferenceRangeRequestSchema>
