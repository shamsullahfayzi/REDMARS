import { z } from 'zod'

/**
 * Task 4.7 — the prescription table. "4 drugs prescribed in under 30 seconds."
 *
 * That number is the whole design brief, and two decisions come out of it.
 *
 * THE WHOLE SHEET IS SAVED AT ONCE, not a drug at a time. A doctor fills in a table and
 * presses F2; a per-row endpoint would mean four round trips, four chances to be slow, and
 * a half-written prescription if one of them failed. So this is a PUT of the entire list,
 * and the server diffs it against what is stored — rows with an id are updated, rows
 * without are created, and stored rows the client did not send are removed.
 *
 * That diff exists instead of a delete-everything-and-reinsert because the audit trail has
 * to stay readable: replacing wholesale would file four deletes and four creates every time
 * the doctor saved, and a prescription saved three times would leave twenty-four audit rows
 * describing one sheet of paper.
 *
 * ROUTE, FREQUENCY AND DURATION ARE REQUIRED, and the SERVER does not fill them in. The
 * formulary's defaults (task 2.6) are what the BROWSER prefills when a drug is picked —
 * "duloxetine → oral / OD / 1 month" — and the doctor sees them and may change them. A
 * server that quietly supplied a default the prescriber never looked at would be writing a
 * dose instruction nobody read.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null))

const requiredText = (max: number, message: string) =>
  z.string().trim().min(1, message).max(max)

export const prescriptionItemInputSchema = z.object({
  /** Present means "this row already exists"; absent means a new one. */
  id: z.uuid().optional(),
  drugId: z.uuid('Choose a drug.'),
  /** "1 tab", "5 ml". Optional because the strength on the drug often says it already. */
  dose: optionalText(60),
  frequency: requiredText(40, 'How often?'),
  duration: requiredText(40, 'For how long?'),
  route: requiredText(40, 'By what route?'),
  /** How many to hand over. Optional — the pharmacy often works it out from the rest. */
  quantity: z
    .union([z.number().int().min(1).max(9999), z.literal(''), z.null()])
    .optional()
    .transform((v) => (typeof v === 'number' ? v : null)),
  instructions: optionalText(200),
})
export type PrescriptionItemInput = z.infer<typeof prescriptionItemInputSchema>

export const savePrescriptionRequestSchema = z.object({
  /**
   * An EMPTY list is meaningful: it means this visit has no prescription. Sending one
   * removes the sheet rather than storing an empty one, so a doctor who deletes the last
   * row and saves gets what they asked for instead of a prescription with nothing on it.
   */
  items: z.array(prescriptionItemInputSchema).max(30, 'That is too many drugs for one sheet.'),
  /** What the patient is told to do, beyond the drugs. Printed on the sheet (task 4.10). */
  advice: optionalText(1000),
})
export type SavePrescriptionRequest = z.infer<typeof savePrescriptionRequestSchema>

export const prescriptionItemSchema = z.object({
  id: z.uuid(),
  drugId: z.uuid(),
  /**
   * Snapshotted at the time of prescribing, per the schema: "if the formulary is edited in
   * 2028, a 2026 prescription must still print what was ACTUALLY prescribed." Written by
   * the server from the drug row — it never travels up from the browser.
   */
  drugNameAtTime: z.string(),
  dose: z.string().nullable(),
  frequency: z.string(),
  duration: z.string(),
  route: z.string(),
  quantity: z.number().int().nullable(),
  instructions: z.string().nullable(),
  sequence: z.number().int(),
})
export type PrescriptionItem = z.infer<typeof prescriptionItemSchema>

export const prescriptionSchema = z.object({
  id: z.uuid(),
  visitId: z.uuid(),
  status: z.string(),
  advice: z.string().nullable(),
  practitionerId: z.string(),
  practitionerName: z.string().nullable(),
  printedAt: z.string().nullable(),
  createdAt: z.string(),
  items: z.array(prescriptionItemSchema),
})
export type Prescription = z.infer<typeof prescriptionSchema>

export const prescriptionResponseSchema = z.object({
  /** Null when this visit has no prescription — which is a normal outcome, not an error. */
  prescription: prescriptionSchema.nullable(),
})
export type PrescriptionResponse = z.infer<typeof prescriptionResponseSchema>
