import { z } from 'zod'
import { allergySeveritySchema } from './allergy.js'
import { moneySchema } from './reception.js'

/**
 * Task 6.8 — the pharmacy queue: the doctor's orders, waiting to be dispensed.
 *
 * A prescription is written in the consult (4.7) and left `active`. This is the list the
 * pharmacist works from — every active prescription in the facility, oldest first, so the
 * patient who has waited longest is served first. Read-only: dispensing (6.10) is what takes
 * a prescription off this queue.
 *
 * What a queue row carries is deliberately thin — who the patient is, who prescribed, when,
 * and the drugs at a glance. The full sheet (drugs AND the patient's allergies, and NOTHING
 * clinical beyond that, R6) is the detail view of 6.9, opened per prescription.
 */

export const pharmacyQueueItemSchema = z.object({
  prescriptionId: z.uuid(),
  visitId: z.uuid(),
  visitNo: z.string(),
  patientId: z.uuid(),
  patientName: z.string(),
  patientMrn: z.string(),
  /** For a dosing sanity-check at the bench; null when the patient's age is unknown. */
  ageYears: z.number().int().nullable(),
  practitionerName: z.string(),
  orderedAt: z.string(),
  itemCount: z.number().int(),
  /** The drugs at a glance — the first few names, so the shelf can be walked before opening. */
  summary: z.string(),
  /**
   * Absent from the queue itself (every queue row is `active` by definition) but present
   * on a search result, which spans every status — so a search finding an already-
   * dispensed sheet reads as that, not as a second thing waiting to be filled.
   */
  status: z.string().optional(),
})
export type PharmacyQueueItem = z.infer<typeof pharmacyQueueItemSchema>

export const pharmacyQueueResponseSchema = z.object({
  items: z.array(pharmacyQueueItemSchema),
  total: z.number().int(),
})
export type PharmacyQueueResponse = z.infer<typeof pharmacyQueueResponseSchema>

/**
 * Task: the pharmacist's own patient finder. Not `patient.search` (task 6b.9 took that
 * away — a pharmacist works their own queue, not the whole register) — this is scoped to
 * PRESCRIPTIONS: it finds the drug order, not the patient's chart, and opening a result
 * reveals only what `pharmacy.read_queue` already allows (drugs + allergies, R6), same as
 * opening any queue row. A prescription that already left the active queue (dispensed,
 * cancelled) is still findable here — the desk may need to reprint or process a return for
 * one that is no longer "waiting".
 */
export const pharmacyPrescriptionSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(60),
})
export type PharmacyPrescriptionSearchQuery = z.infer<typeof pharmacyPrescriptionSearchQuerySchema>

export const pharmacyPrescriptionSearchResponseSchema = z.object({
  items: z.array(pharmacyQueueItemSchema),
})
export type PharmacyPrescriptionSearchResponse = z.infer<
  typeof pharmacyPrescriptionSearchResponseSchema
>

// ---------------------------------------------------------------------------------
// The prescription, as the pharmacy is allowed to see it — task 6.9 (Rule R6)
// ---------------------------------------------------------------------------------

/**
 * R6, made concrete. When the pharmacist opens a queued prescription they see the DRUGS and
 * the patient's ALLERGIES, and nothing else clinical — no diagnosis, no complaint, no notes,
 * no vitals, no history. This shape carries exactly that and no more; it is built on purpose
 * rather than reusing the doctor's prescription response, so a clinical field cannot leak in
 * by being added to the shared shape later. Two fields that ARE allowed and DO matter to
 * dispensing safety travel with it: why a drug was prescribed despite a recorded allergy
 * (per line), and why a serious interaction was accepted (per sheet).
 */
export const pharmacyDrugLineSchema = z.object({
  id: z.uuid(),
  drugName: z.string(),
  dose: z.string().nullable(),
  frequency: z.string(),
  duration: z.string(),
  route: z.string(),
  quantity: z.number().int().nullable(),
  instructions: z.string().nullable(),
  /** Medico-legal: the drug was prescribed to a patient recorded as allergic to it, and why. */
  allergyOverrideReason: z.string().nullable(),
  /**
   * A starting point for the price form, read off the formulary's `Drug.sellPrice` — never
   * what actually lands on the invoice. Null when the drug has no catalog price at all, in
   * which case the pharmacist types the amount from scratch rather than seeing a wrong
   * pre-fill.
   */
  suggestedUnitPrice: z.string().nullable(),
})
export type PharmacyDrugLine = z.infer<typeof pharmacyDrugLineSchema>

/** A patient allergy, as the bench needs it — the substance, how bad, and the reaction. */
export const pharmacyAllergySchema = z.object({
  id: z.uuid(),
  substance: z.string(),
  drugName: z.string().nullable(),
  reaction: z.string().nullable(),
  severity: allergySeveritySchema,
  isActive: z.boolean(),
  notedAt: z.string(),
})
export type PharmacyAllergy = z.infer<typeof pharmacyAllergySchema>

/**
 * Whether this prescription has been billed yet, and whether that bill is settled —
 * `PrescriptionView` reads this one field to decide which of the three screens to show:
 * price it (`bill` is null), wait for reception (`bill.isPaid` is false), or hand the
 * medicine over (`bill.isPaid` is true). Never null once it exists — a prescription is
 * billed exactly once (see `bill()`'s own guard against billing twice).
 */
export const pharmacyBillSchema = z.object({
  invoiceId: z.uuid(),
  invoiceNo: z.string(),
  total: z.string(),
  paidAmount: z.string(),
  outstanding: z.string(),
  currency: z.string(),
  isPaid: z.boolean(),
})
export type PharmacyBill = z.infer<typeof pharmacyBillSchema>

export const pharmacyPrescriptionSchema = z.object({
  prescriptionId: z.uuid(),
  visitNo: z.string(),
  orderedAt: z.string(),
  status: z.string(),
  patient: z.object({
    id: z.uuid(),
    name: z.string(),
    mrn: z.string(),
    gender: z.string().nullable(),
    ageYears: z.number().int().nullable(),
  }),
  practitionerName: z.string(),
  /** Advice the prescriber wrote onto the sheet ("after food") — part of the drug order. */
  advice: z.string().nullable(),
  /** Why a flagged serious drug–drug interaction was prescribed anyway (4.9); null if none. */
  interactionAckReason: z.string().nullable(),
  items: z.array(pharmacyDrugLineSchema),
  /** Active first, most severe first — the retracted ones last, but shown (a doctor removed them). */
  allergies: z.array(pharmacyAllergySchema),
  /** Null until `bill()` has been called once — see `pharmacyBillSchema`. */
  bill: pharmacyBillSchema.nullable(),
})
export type PharmacyPrescription = z.infer<typeof pharmacyPrescriptionSchema>

// ---------------------------------------------------------------------------------
// Dispensing and the pharmacy bill — task 6.10
// ---------------------------------------------------------------------------------

/** One priced medicine line on the pharmacy bill — the price the pharmacist typed for it. */
export const dispenseLineSchema = z.object({
  description: z.string(),
  quantity: z.number().int(),
  unitPrice: z.string(),
  total: z.string(),
})
export type DispenseLine = z.infer<typeof dispenseLineSchema>

/**
 * What the pharmacist billed a prescription at. The formulary's `Drug.sellPrice` only ever
 * supplies a suggested starting figure (`PharmacyDrugLine.suggestedUnitPrice`) — many drugs
 * have no catalog price at all, and a bill is real money, not a number the pharmacist is
 * stuck with because a shelf entry happens to be blank. Every item on the prescription must
 * be priced, and only those items; the server checks the set matches exactly, not the client.
 */
export const billPrescriptionRequestSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.uuid(),
        unitPrice: moneySchema,
      }),
    )
    .min(1),
})
export type BillPrescriptionRequest = z.infer<typeof billPrescriptionRequestSchema>

/**
 * The result of BILLING a prescription — step one of two. A pharmacy-origin invoice is
 * raised for the drugs, priced from what the pharmacist typed on the form above. The sheet
 * is NOT marked dispensed and does not leave the queue — that only happens once the bill is
 * fully paid and `confirmHandover` is called.
 *
 * The patient pays this bill at RECEPTION, not here: the invoice lands in the Collections
 * worklist the moment this returns, exactly like a lab bill already does, and this screen
 * has no payment form of its own — see PharmacyPage.tsx for why that was a real gap, not a
 * design choice, until this task.
 */
export const dispenseResponseSchema = z.object({
  prescriptionId: z.uuid(),
  invoiceId: z.uuid(),
  invoiceNo: z.string(),
  subtotal: z.string(),
  total: z.string(),
  paidAmount: z.string(),
  outstanding: z.string(),
  currency: z.string(),
  status: z.string(),
  items: z.array(dispenseLineSchema),
})
export type DispenseResponse = z.infer<typeof dispenseResponseSchema>

/**
 * The result of the HANDOVER — step two, and the one that actually completes the
 * prescription and takes it off the queue. Only reachable once the bill `bill()` raised is
 * fully paid; the server re-checks that itself rather than trusting the screen that offered
 * the button.
 */
export const confirmHandoverResponseSchema = z.object({
  prescriptionId: z.uuid(),
  status: z.string(),
  dispensedAt: z.string(),
})
export type ConfirmHandoverResponse = z.infer<typeof confirmHandoverResponseSchema>

// ---------------------------------------------------------------------------------
// Medicine return — task 6.11 (Rule R5)
// ---------------------------------------------------------------------------------

export const returnMedicineRequestSchema = z.object({
  /** Why the medicine came back — required by R5, logged on the reversal. */
  reason: z.string().trim().min(3, 'Give a reason for the return').max(200),
})
export type ReturnMedicineRequest = z.infer<typeof returnMedicineRequestSchema>

/**
 * The result of a medicine return: the box came back and the money goes back. The pharmacy
 * bill is cancelled and every payment on it reversed (a negative row apiece, R5 same-day and
 * the pharmacist's alone). `refundedAmount` is what the pharmacist counts back out of the
 * drawer — zero if the bill was never paid, in which case there is only the cancellation.
 */
export const returnMedicineResponseSchema = z.object({
  prescriptionId: z.uuid(),
  invoiceId: z.uuid(),
  invoiceNo: z.string(),
  refundedAmount: z.string(),
  refundReceiptNo: z.string().nullable(),
  refundedAt: z.string(),
  reason: z.string(),
  currency: z.string(),
  status: z.string(),
})
export type ReturnMedicineResponse = z.infer<typeof returnMedicineResponseSchema>
