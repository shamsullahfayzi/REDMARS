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
  /**
   * Task 4.8 — why this drug is being given to a patient recorded as allergic to it.
   *
   * Null is the normal case. Sending a reason is how a doctor gets PAST the hard block,
   * and it is stored on the prescription item rather than only in the audit log, because
   * "why was this prescribed?" is a question asked of the prescription by people who do
   * not read audit tables.
   *
   * Long enough to be a sentence and short enough that nobody pastes a chart into it. The
   * server ignores it when there is no conflict — a reason attached to a drug nobody was
   * warned about is noise that makes the real ones harder to find.
   */
  allergyOverrideReason: z
    .string()
    .trim()
    .min(5, 'Say why this is safe to prescribe.')
    .max(300)
    .nullish()
    .transform((v) => (v ? v : null)),
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
  /** Non-null means the prescriber was stopped, was shown the allergy, and went ahead. */
  allergyOverrideReason: z.string().nullable(),
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

// ---------------------------------------------------------------------------------
// Task 4.8 — the hard block
// ---------------------------------------------------------------------------------

/**
 * HOW A CONFLICT WAS FOUND, and this field exists so the doctor can judge it.
 *
 *  - `drug`  — the allergy names this exact formulary drug. Certain.
 *  - `name`  — the recorded substance and the drug's name contain one another, case
 *              insensitively: "Penicillin" against "Benzylpenicillin 600mg". Strong, but
 *              it is string matching and the doctor is entitled to know that.
 *
 * WHAT IS NOT COVERED, stated here because a doctor who believes this catches more than it
 * does is worse off than one who knows its edges: CLASS CROSS-REACTIVITY. An allergy
 * recorded as "Penicillin" does NOT block amoxicillin, because nothing in the data says
 * they are related — Drug.atcCode exists but Allergy has no ATC, and inferring a drug class
 * from a free-text substance is guesswork that would either miss quietly or block wrongly.
 * Blocking wrongly is the worse failure: an override people click through fifty times a day
 * is not a safety feature, it is a speed bump that trains doctors to ignore warnings.
 *
 * The mitigation is task 4.6's banner, which is on screen the whole time and says
 * "Penicillin — severe" whatever is being prescribed. The block is a second net, not the
 * only one.
 */
export const ALLERGY_MATCH_KINDS = ['drug', 'name'] as const
export const allergyMatchKindSchema = z.enum(ALLERGY_MATCH_KINDS)
export type AllergyMatchKind = z.infer<typeof allergyMatchKindSchema>

export const allergyConflictSchema = z.object({
  /** Which line of the prescription is blocked, so the screen can point at it. */
  drugId: z.uuid(),
  drugName: z.string(),
  allergyId: z.uuid(),
  substance: z.string(),
  severity: z.string(),
  reaction: z.string().nullable(),
  matchedOn: allergyMatchKindSchema,
})
export type AllergyConflict = z.infer<typeof allergyConflictSchema>

/** The 409 body. Nothing was saved — not the safe lines either. */
export const allergyConflictResponseSchema = z.object({
  code: z.literal('allergy_conflict'),
  message: z.string(),
  conflicts: z.array(allergyConflictSchema),
})
export type AllergyConflictResponse = z.infer<typeof allergyConflictResponseSchema>
