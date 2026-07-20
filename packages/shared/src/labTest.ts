import { z } from 'zod'

/**
 * Lab test catalog contract (task 2.7) — one orderable test (e.g. "ALT"), keyed by
 * a unique code, with optional local names, a specimen/unit, and an optional price.
 *
 * Price is the ONE money field allowed here (guardrail 7): it sits on the catalog
 * row, never on a clinical order. It is optional — not every test is separately
 * priced (some only sell as part of a panel) — and crosses the wire as a decimal
 * STRING for the same reason a Service fee does: a Decimal(12,2) is exact money and
 * a JS float is not. See service.ts for the full note.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined))

// Optional money: a non-negative decimal string, or blank. Up to 10 integer digits
// + 2 places — the shape of Decimal(12,2). Blank and undefined alike become
// undefined, which the server stores as null. Reused by the lab panel contract.
export const optionalPriceSchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Enter a valid amount')
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : undefined))

export const labTestSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  nameLocalPrs: z.string().nullable(),
  nameLocalPs: z.string().nullable(),
  loincCode: z.string().nullable(),
  specimen: z.string().nullable(),
  unit: z.string().nullable(),
  price: z.string().nullable(),
  isActive: z.boolean(),
})
export type LabTestSummary = z.infer<typeof labTestSummarySchema>

export const labTestListResponseSchema = z.object({
  tests: z.array(labTestSummarySchema),
})
export type LabTestListResponse = z.infer<typeof labTestListResponseSchema>

// The writable fields shared by create and update. Code is added only on create —
// it is the stable key other records will point at, so an edit never touches it.
const labTestFieldsSchema = z.object({
  name: z.string().trim().min(2, 'Test name is required').max(120),
  nameLocalPrs: optionalText(120),
  nameLocalPs: optionalText(120),
  loincCode: optionalText(20),
  specimen: optionalText(40),
  unit: optionalText(40),
  price: optionalPriceSchema,
})

export const createLabTestRequestSchema = labTestFieldsSchema.extend({
  code: z.string().trim().min(1, 'Code is required').max(30),
})
export type CreateLabTestRequest = z.infer<typeof createLabTestRequestSchema>

export const updateLabTestRequestSchema = labTestFieldsSchema
export type UpdateLabTestRequest = z.infer<typeof updateLabTestRequestSchema>
