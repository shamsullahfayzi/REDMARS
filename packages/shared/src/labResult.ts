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
