import { z } from 'zod'
import { genderSchema } from './referenceRange.js'
import { visitSummarySchema } from './visit.js'

/**
 * Task 4.1 — the consult screen's context.
 *
 * One request, because this is the screen a doctor opens between two patients and the
 * header has to be right before anything else renders. It carries who the patient is,
 * which occasion this is, and how long they have been waiting — and NOTHING clinical
 * yet. Vitals, diagnoses, prescriptions and notes each arrive with their own task and
 * their own permission; folding them in here would mean one endpoint that a nurse,
 * a doctor and an admin all need but none of them may read in full.
 *
 * The visit rides along whole rather than flattened: the queue already speaks
 * `VisitSummary`, and a consult screen opened from a queue row should be describing the
 * same object in the same words.
 */

/**
 * The patient, as the top of a consulting-room screen needs them.
 *
 * Age is a NUMBER computed by the server, not the stored estimate: a patient registered
 * at thirty is thirty-three three years later, and the dose of a drug is worked out from
 * the age on this header. `dateOfBirth` still travels for the case where the doctor wants
 * the real date rather than the derived years.
 */
export const consultPatientSchema = z.object({
  id: z.uuid(),
  mrn: z.string(),
  name: z.string(),
  gender: genderSchema,
  ageYears: z.number().int().nullable(),
  dateOfBirth: z.string().nullable(),
  phone: z.string().nullable(),
})
export type ConsultPatient = z.infer<typeof consultPatientSchema>

export const consultContextSchema = z.object({
  visit: visitSummarySchema,
  patient: consultPatientSchema,
  /**
   * Minutes from arrival to being called in, or — while they are still waiting — minutes
   * so far. Computed by the SERVER for the same reason the queue's is (task 3.7): the
   * clock on a shared hospital workstation is frequently wrong, and this number ends up
   * in an operational report.
   */
  waitedMinutes: z.number().int().nullable(),
})
export type ConsultContext = z.infer<typeof consultContextSchema>
