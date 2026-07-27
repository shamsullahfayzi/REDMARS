import { z } from 'zod'
import { diagnosisCertaintySchema } from './diagnosis.js'
import { labOrderItemStatusSchema } from './labOrder.js'
import { visitStatusSchema, visitTypeSchema } from './visit.js'

/**
 * Task 4.14 — the patient's last twelve months, on one screen.
 *
 * "Doctor sees the last 12 months at a glance." A psychiatric follow-up begins with a
 * question the doctor cannot answer from the room — what was tried, at what dose, and what
 * happened. Today that answer lives in a paper file somebody has to fetch, which is why in
 * practice it does not get asked.
 *
 * READ-ONLY BY SHAPE, not by discipline. Nothing here carries an `id` that a write endpoint
 * would accept: a diagnosis arrives with no id, a prescribed drug with no `drugId`. That is
 * the same decision task 4.11 made for copy-last and for the same reason — a row that can
 * be forwarded into a PUT is a way to edit a closed visit's record from a panel whose job
 * is to display it. Reusing an old regimen is task 4.11's endpoint, which re-checks the
 * formulary and re-runs the allergy and interaction blocks. This one cannot be a back door
 * around them because it has nothing to hand them.
 *
 * The visit's own `id` stays, because it is a place to navigate to rather than a handle to
 * write through — and the consult screen it opens re-checks every permission itself.
 *
 * WHAT IS NOT HERE:
 *
 *  - CLINICAL NOTES. The assessment, the mental state examination and the risk assessment
 *    are the most useful things a follow-up could show, and they are the one thing
 *    `clinical_note.read` denies even to an admin (task 4.13). This endpoint is gated on
 *    `patient.read_history`, which an admin HOLDS. Carrying notes here would hand them the
 *    record R2 was written to keep from them, through a panel nobody would think to check.
 *    Reading a previous note means opening that visit, where the narrower permission
 *    applies. One door.
 *  - VITALS. A weight trend on antipsychotics is worth having and is a chart rather than a
 *    list. Not this task.
 *
 * LAB RESULTS closed the gap this comment used to describe (task 6b.6): every non-cancelled
 * test ordered on the visit rides along, following the exact rule 5.10's read-back already
 * established — A VALUE APPEARS ONLY ONCE VERIFIED. A test still pending, drawn, or entered
 * but not signed off shows its STATUS and nothing else; acting on an unverified number is the
 * mistake verification exists to prevent, and that is no less true reading it a year later
 * than reading it the day it was drawn.
 */

/** Twelve months by default — the done-when. Five years is the ceiling, not a suggestion. */
export const HISTORY_MONTHS = { default: 12, min: 1, max: 60 } as const

/**
 * How many visits come back at most. A weekly psychiatric patient makes fifty-two visits a
 * year, and a doctor glancing at a panel does not read the fifty-first — but the response
 * says when it has stopped rather than quietly ending.
 */
export const HISTORY_VISIT_LIMIT = 50

export const historyQuerySchema = z.object({
  months: z.coerce
    .number()
    .int()
    .min(HISTORY_MONTHS.min)
    .max(HISTORY_MONTHS.max)
    .default(HISTORY_MONTHS.default),
})
export type HistoryQuery = z.infer<typeof historyQuerySchema>

/** What was concluded, with no id — see above. */
export const historyDiagnosisSchema = z.object({
  text: z.string(),
  icdCode: z.string().nullable(),
  icdTitle: z.string().nullable(),
  certainty: diagnosisCertaintySchema,
  isPrimary: z.boolean(),
})
export type HistoryDiagnosis = z.infer<typeof historyDiagnosisSchema>

/**
 * A drug off an old sheet. The SNAPSHOTTED name, per the schema — what was actually
 * prescribed in 2026, not what the formulary calls that row today.
 */
export const historyPrescriptionItemSchema = z.object({
  drugNameAtTime: z.string(),
  dose: z.string().nullable(),
  frequency: z.string(),
  duration: z.string(),
  route: z.string(),
  quantity: z.number().int().nullable(),
  instructions: z.string().nullable(),
})
export type HistoryPrescriptionItem = z.infer<typeof historyPrescriptionItemSchema>

export const historyPrescriptionSchema = z.object({
  writtenAt: z.string(),
  practitionerName: z.string().nullable(),
  advice: z.string().nullable(),
  items: z.array(historyPrescriptionItemSchema),
})
export type HistoryPrescription = z.infer<typeof historyPrescriptionSchema>

/**
 * One test on one visit, aged however many months. Mirrors `VisitLabResultItem`'s own
 * verified-only rule exactly (labResult.ts) — the two panels show the same test the same
 * way whether it was drawn today or last spring.
 */
export const historyLabResultSchema = z.object({
  testName: z.string(),
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
})
export type HistoryLabResult = z.infer<typeof historyLabResultSchema>

export const historyVisitSchema = z.object({
  /** A place to navigate to, not a handle to write through. */
  id: z.uuid(),
  visitNo: z.string(),
  type: visitTypeSchema,
  /**
   * Carried rather than filtered out, `cancelled` included. A visit the patient did not
   * attend is not clinical content and it IS clinical information: in psychiatry, dropping
   * out of contact is a finding. `entered_in_error` is the one status this excludes —
   * that is a visit the record says never happened.
   */
  status: visitStatusSchema,
  startedAt: z.string(),
  departmentName: z.string(),
  practitionerName: z.string().nullable(),
  chiefComplaint: z.string().nullable(),
  diagnoses: z.array(historyDiagnosisSchema),
  /** Null is the normal case for a visit where nothing was prescribed. */
  prescription: historyPrescriptionSchema.nullable(),
  /** Empty for the normal case: a visit where nothing was ordered. */
  labResults: z.array(historyLabResultSchema),
})
export type HistoryVisit = z.infer<typeof historyVisitSchema>

export const patientHistoryResponseSchema = z.object({
  patientId: z.uuid(),
  months: z.number().int(),
  /** The start of the window, computed by the SERVER — a workstation clock is often wrong. */
  from: z.string(),
  /** Newest first. A doctor asks "what happened last time" before "what happened first". */
  visits: z.array(historyVisitSchema),
  /** True when the window held more than `HISTORY_VISIT_LIMIT` and the list was cut. */
  truncated: z.boolean(),
  /**
   * How many visits sit BEFORE the window. One number that answers a question the list
   * cannot: whether this is a new patient or one the hospital has known for six years.
   */
  olderVisits: z.number().int(),
})
export type PatientHistoryResponse = z.infer<typeof patientHistoryResponseSchema>
