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
  /** The entered result, once there is one — so the worklist shows the value and its flag. */
  result: z
    .object({
      value: z.string(),
      isNumeric: z.boolean(),
      unit: z.string().nullable(),
      /** H / L, or null for normal or a text result. */
      flag: z.string().nullable(),
      isAbnormal: z.boolean(),
    })
    .nullable(),
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

/**
 * Collecting the sample (Phase 5, third slice) — the first write that moves a test's own
 * state, from `ordered` to `sample_collected`.
 *
 * A SET of items, not one: a sample is drawn once for a patient even when four tests were
 * ordered, so the bench collects the order's tests together in a single action. The request
 * is the item ids to draw; the server refuses the whole batch rather than half-collecting if
 * any one of them is not ready — a test whose sample was already taken, or, the point of
 * this slice, one the reception has not been paid for. Farhat collects at the window first,
 * and this is where that rule stops being advisory and becomes a locked door.
 */
export const collectSampleRequestSchema = z.object({
  /** The ordered tests whose sample is being drawn now. */
  itemIds: z.array(z.uuid()).min(1).max(50),
})
export type CollectSampleRequest = z.infer<typeof collectSampleRequestSchema>

export const collectedSampleItemSchema = z.object({
  itemId: z.uuid(),
  status: labOrderItemStatusSchema,
  sampleCollectedAt: z.string(),
})
export type CollectedSampleItem = z.infer<typeof collectedSampleItemSchema>

export const collectSampleResponseSchema = z.object({
  items: z.array(collectedSampleItemSchema),
})
export type CollectSampleResponse = z.infer<typeof collectSampleResponseSchema>
