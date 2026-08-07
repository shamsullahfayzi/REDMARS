import { z } from 'zod'
import { moneySchema } from './reception.js'

/**
 * Drug formulary contract (task 2.4). A per-facility catalogue of medicines, keyed
 * by a unique code and searchable by generic/brand name.
 *
 * The default route/frequency/duration columns (task 2.6) autofill a prescription
 * on the consultation screen (Phase 4) — "duloxetine → oral / OD / 1 month". They
 * are optional starters a prescriber can always override; captured and editable here.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined))

export const drugSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  genericName: z.string(),
  brandName: z.string().nullable(),
  atcCode: z.string().nullable(),
  strength: z.string().nullable(),
  form: z.string().nullable(),
  defaultRoute: z.string().nullable(),
  defaultFreq: z.string().nullable(),
  defaultDuration: z.string().nullable(),
  isControlled: z.boolean(),
  isActive: z.boolean(),
  /**
   * What the pharmacy charges for one unit — null means dispensed free (a sample, a
   * free-issue item), never a blocked dispense. This is what `dispense.service.ts` prices
   * a prescription's items from; a drug with no price here is the reason a bill can print
   * as 0.00 even though real medicine went out the door.
   */
  sellPrice: z.string().nullable(),
})
export type DrugSummary = z.infer<typeof drugSummarySchema>

export const drugListResponseSchema = z.object({
  drugs: z.array(drugSummarySchema),
})
export type DrugListResponse = z.infer<typeof drugListResponseSchema>

// The fields of a drug a human types or a CSV row carries. Reused to validate both
// the create form and every imported row, so the two can never disagree on what a
// valid drug is.
export const drugFieldsSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(30),
  genericName: z.string().trim().min(2, 'Generic name is required').max(120),
  brandName: optionalText(120),
  atcCode: optionalText(16),
  strength: optionalText(40),
  form: optionalText(40),
  defaultRoute: optionalText(40),
  defaultFreq: optionalText(40),
  defaultDuration: optionalText(40),
  isControlled: z.boolean().default(false),
  /** Blank means free-issue (no charge at dispense) — not a required field. */
  sellPrice: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    moneySchema.optional(),
  ),
})
export type DrugFields = z.infer<typeof drugFieldsSchema>

export const createDrugRequestSchema = drugFieldsSchema
export type CreateDrugRequest = z.infer<typeof createDrugRequestSchema>

// Update leaves the code alone — it is the stable key other records will point at.
export const updateDrugRequestSchema = drugFieldsSchema.omit({ code: true })
export type UpdateDrugRequest = z.infer<typeof updateDrugRequestSchema>

export const importDrugsRequestSchema = z.object({
  // The pasted CSV text. Parsed and validated row by row on the server.
  csv: z.string().min(1, 'Paste some CSV first'),
})
export type ImportDrugsRequest = z.infer<typeof importDrugsRequestSchema>

/** One rejected row, reported back so the admin can fix and re-paste. Line is 1-based including the header. */
export const importErrorSchema = z.object({
  line: z.number(),
  message: z.string(),
})
export type ImportError = z.infer<typeof importErrorSchema>

export const importDrugsResponseSchema = z.object({
  imported: z.number(),
  skipped: z.number(),
  errors: z.array(importErrorSchema),
})
export type ImportDrugsResponse = z.infer<typeof importDrugsResponseSchema>
