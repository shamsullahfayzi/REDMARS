import { z } from 'zod'
import { labOrderItemStatusSchema } from './labOrder.js'

/**
 * Entering a result (Phase 5, fourth slice) — the technician types the value a test produced,
 * and the server flags it against the normal range.
 *
 * A result is EITHER a number or a text, never both and never neither: a haemoglobin is 13.5,
 * a malaria film is "Negative". The numeric one is measured against the reference bands
 * (referenceRange.ts) for this test, this patient's gender and age, and comes back flagged
 * H (above), L (below) or unflagged (normal) — the SAME number is normal for a woman and low
 * for a man, which is why the band is keyed by gender and age and the flag is computed
 * server-side, never trusted from the browser.
 *
 * A lab value is NOT money: it rides the wire as a decimal STRING for exactness (a JS float
 * would corrupt it) but with no forced trailing zeros — 13.5 stays "13.5". The column is
 * Decimal(12,4): up to 8 integer digits and 4 places.
 */

/** A non-negative lab value: decimal string in the shape of Decimal(12,4). */
const labValue = z
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

export const saveLabResultRequestSchema = z
  .object({
    /** The measured number, as a decimal string. Mutually exclusive with valueText. */
    valueNumeric: labValue,
    /** A text result — "Negative", "Not detected". Mutually exclusive with valueNumeric. */
    valueText: optionalText(200),
    /** Overrides the test's catalog unit for this one result; blank uses the test's own. */
    unit: optionalText(20),
    comment: optionalText(500),
  })
  .refine((v) => (v.valueNumeric == null) !== (v.valueText == null), {
    message: 'A result is either a number or a text — enter exactly one.',
    path: ['valueNumeric'],
  })
export type SaveLabResultRequest = z.infer<typeof saveLabResultRequestSchema>

export const labResultSchema = z.object({
  itemId: z.uuid(),
  /** The item's status after entry — `resulted`. */
  status: labOrderItemStatusSchema,
  valueNumeric: z.string().nullable(),
  valueText: z.string().nullable(),
  unit: z.string().nullable(),
  /** H (above the band), L (below), or null (normal, or a text result). */
  flag: z.string().nullable(),
  isAbnormal: z.boolean(),
  comment: z.string().nullable(),
  enteredAt: z.string(),
  /** The band the flag was judged against, echoed so the bench can see it. Null = no band. */
  referenceLow: z.string().nullable(),
  referenceHigh: z.string().nullable(),
  referenceText: z.string().nullable(),
})
export type LabResult = z.infer<typeof labResultSchema>

export const saveLabResultResponseSchema = z.object({
  result: labResultSchema,
})
export type SaveLabResultResponse = z.infer<typeof saveLabResultResponseSchema>

/**
 * Verifying results (Phase 5, fifth slice) — a sign-off that moves a result from `resulted`
 * to `verified`, after which it is locked: correcting it becomes amendment (lab.amend_result),
 * a new record that leaves the original standing, not a quiet overwrite.
 *
 * A batch, like collecting: a patient's results are checked and released together. Ideally the
 * verifier is a different person from whoever entered the value — real labs separate the two —
 * but a single-tech clinic has one pair of hands, so that separation is a policy the
 * permission leaves open rather than a rule enforced here. All or nothing: if any item in the
 * batch is not `resulted`, none are verified.
 */
export const verifyResultRequestSchema = z.object({
  itemIds: z.array(z.uuid()).min(1).max(50),
})
export type VerifyResultRequest = z.infer<typeof verifyResultRequestSchema>

export const verifiedResultItemSchema = z.object({
  itemId: z.uuid(),
  status: labOrderItemStatusSchema,
  verifiedAt: z.string(),
})
export type VerifiedResultItem = z.infer<typeof verifiedResultItemSchema>

export const verifyResultResponseSchema = z.object({
  items: z.array(verifiedResultItemSchema),
})
export type VerifyResultResponse = z.infer<typeof verifyResultResponseSchema>

/**
 * Results flowing back to the doctor (Phase 5, final slice) — the loop closing. The doctor
 * who ordered the tests reads them here, on the consult screen where they ordered, and prints
 * the report the patient carries.
 *
 * A VALUE APPEARS ONLY ONCE VERIFIED. Before the sign-off a result is provisional, and a
 * doctor acting on an unverified number is the mistake verification exists to prevent — so a
 * test that is ordered, drawn, in progress or merely entered shows its STATUS (where it is in
 * the pipeline) but no value. The value, its flag and the band it was judged against arrive
 * together, verified.
 */
export const visitLabResultItemSchema = z.object({
  itemId: z.uuid(),
  code: z.string(),
  testName: z.string(),
  orderNo: z.string(),
  orderedAt: z.string(),
  status: labOrderItemStatusSchema,
  /** Everything below is null/false until the result is verified. */
  value: z.string().nullable(),
  isNumeric: z.boolean(),
  unit: z.string().nullable(),
  flag: z.string().nullable(),
  isAbnormal: z.boolean(),
  referenceLow: z.string().nullable(),
  referenceHigh: z.string().nullable(),
  referenceText: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  comment: z.string().nullable(),
})
export type VisitLabResultItem = z.infer<typeof visitLabResultItemSchema>

export const visitLabResultsResponseSchema = z.object({
  visitId: z.uuid(),
  items: z.array(visitLabResultItemSchema),
})
export type VisitLabResultsResponse = z.infer<typeof visitLabResultsResponseSchema>
