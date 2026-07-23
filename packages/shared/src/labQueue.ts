import { z } from 'zod'
import { labOrderItemStatusSchema } from './labOrder.js'

/**
 * The lab worklist (Phase 5, second slice) — what the bench sees, across every visit, rather
 * than the single order a doctor sees on one consult screen.
 *
 * ONE ROW PER TEST, not per order. A sample is drawn once for a patient, but the lab acts on
 * each test on its own timeline — a CBC resulted while a culture is still incubating — so the
 * unit of work here is the ordered test, keyed back to its order and patient so the screen
 * can group them again when it wants to.
 *
 * PAYMENT TRAVELS WITH THE ROW. Farhat collects at the window before a sample is taken, so
 * the fact that decides whether the bench may act — is this paid — is on every entry, next
 * to the test. `paid` is true only when the order's whole invoice is settled; a
 * part-payment leaves it false, because which specific line a partial sum covers is not yet
 * tracked (the per-line reception settlement is a later slice). Conservative on purpose: the
 * bench should not draw a sample the desk has not been paid for.
 */
export const labQueueEntrySchema = z.object({
  itemId: z.uuid(),
  orderId: z.uuid(),
  orderNo: z.string(),
  visitId: z.uuid(),
  patientId: z.uuid(),
  patientName: z.string(),
  patientMrn: z.string(),
  testId: z.uuid(),
  code: z.string(),
  testName: z.string(),
  status: labOrderItemStatusSchema,
  orderedAt: z.string(),
  /**
   * Minutes since the order was written, computed by the SERVER — a shared workstation's
   * clock is often wrong, and "waiting 40 minutes" is the number that decides what the bench
   * picks up next.
   */
  waitedMinutes: z.number().int(),
  /** The lab invoice's status, or null for an order that raised no bill (unpriced tests). */
  invoiceStatus: z.string().nullable(),
  /** True only when the whole lab invoice is settled — see the note above. */
  paid: z.boolean(),
  price: z.string().nullable(),
})
export type LabQueueEntry = z.infer<typeof labQueueEntrySchema>

/** The worklist filters. Everything optional — the server defaults to today's active work. */
export const labQueueQuerySchema = z.object({
  /** YYYY-MM-DD in the facility's own zone. Absent means today, there. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD.')
    .optional(),
  /** Absent means the active statuses — work not yet verified or cancelled. */
  status: labOrderItemStatusSchema.optional(),
})
export type LabQueueQuery = z.infer<typeof labQueueQuerySchema>

export const labQueueResponseSchema = z.object({
  entries: z.array(labQueueEntrySchema),
  /** The date actually served, so the screen can say which day it is showing. */
  date: z.string(),
  /** Counts per active status for the day, so the header does not need a second request. */
  counts: z.object({
    ordered: z.number().int(),
    sample_collected: z.number().int(),
    in_progress: z.number().int(),
    resulted: z.number().int(),
  }),
})
export type LabQueueResponse = z.infer<typeof labQueueResponseSchema>
