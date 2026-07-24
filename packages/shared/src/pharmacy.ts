import { z } from 'zod'

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
})
export type PharmacyQueueItem = z.infer<typeof pharmacyQueueItemSchema>

export const pharmacyQueueResponseSchema = z.object({
  items: z.array(pharmacyQueueItemSchema),
  total: z.number().int(),
})
export type PharmacyQueueResponse = z.infer<typeof pharmacyQueueResponseSchema>
