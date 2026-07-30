import { z } from 'zod'

/**
 * Lab ordering contract (Phase 5, first slice) — the doctor's request for tests, written
 * from the consult screen and hung off the visit like the prescription is.
 *
 * PUT, not POST, for the same reason the prescription is: the whole order is one set of
 * tests saved at once, and saving it twice must leave ONE order, not two. The server diffs
 * what it is sent against what a test is already on the order — a doctor who adds a fourth
 * test and re-saves gets a fourth line, not a second order of four.
 *
 * The order is keyed by TEST, not by a line id: a test appears on an order at most once
 * (ordering CBC twice is a quantity question the lab does not have, not two orders), so the
 * request is simply the set of test ids the doctor wants. Panels — ordering "LFT" and
 * having it expand to its member tests — are a later slice; this one orders individual
 * tests, which is what every order is ultimately made of.
 *
 * MONEY IS NOT ON THIS CONTRACT. The price of a test lives on the catalog (labTest.ts) and
 * is snapshotted server-side onto the invoice the moment it is ordered — never sent by the
 * browser, for the same reason a service fee never is (guardrail 7). It travels BACK on the
 * response, per line and as an invoice total, so the doctor can tell the patient what the
 * lab will cost at the desk; it is never accepted on the way in.
 */

/** The lab's per-item state machine — mirrors the LabOrderItemStatus enum. */
export const labOrderItemStatusSchema = z.enum([
  'ordered',
  'sample_collected',
  'in_progress',
  'resulted',
  'verified',
  'cancelled',
])
export type LabOrderItemStatus = z.infer<typeof labOrderItemStatusSchema>

export const saveLabOrderRequestSchema = z.object({
  /** Why the tests were ordered — travels to the lab so a result can be read in context. */
  clinicalNote: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : undefined)),
  /** The tests the doctor wants, as catalog ids. An empty set means "no order". */
  testIds: z.array(z.uuid()).max(50),
})
export type SaveLabOrderRequest = z.infer<typeof saveLabOrderRequestSchema>

/** One ordered test on the response. `price` is the snapshot from the invoice, or null. */
export const labOrderItemSchema = z.object({
  id: z.uuid(),
  testId: z.uuid(),
  code: z.string(),
  name: z.string(),
  status: labOrderItemStatusSchema,
  price: z.string().nullable(),
  /**
   * Task: a test is cancelable from the consult tab only while its charge is still
   * unpaid — once reception has taken the money, the trash icon goes away and the order
   * can only move forward. True for a free test (nothing to pay).
   */
  isPaid: z.boolean(),
})
export type LabOrderItem = z.infer<typeof labOrderItemSchema>

/**
 * The bill the order raised. Its own invoice, kept apart from the consultation's: the
 * consult fee was settled at registration and that receipt must not move, so the lab
 * charges are a separate, still-unpaid document the reception collects against — and can
 * collect for only the tests the patient actually wants, one line at a time.
 */
export const labOrderInvoiceSchema = z.object({
  id: z.uuid(),
  invoiceNo: z.string(),
  status: z.string(),
  subtotal: z.string(),
  total: z.string(),
  paidAmount: z.string(),
  currency: z.string(),
})
export type LabOrderInvoice = z.infer<typeof labOrderInvoiceSchema>

export const labOrderSchema = z.object({
  id: z.uuid(),
  visitId: z.uuid(),
  orderNo: z.string(),
  clinicalNote: z.string().nullable(),
  practitionerName: z.string().nullable(),
  orderedAt: z.string(),
  items: z.array(labOrderItemSchema),
  /** Null only for an order carrying no priced tests — an order everyone can read for free. */
  invoice: labOrderInvoiceSchema.nullable(),
})
export type LabOrder = z.infer<typeof labOrderSchema>

/** The visit's order, or null when none has been placed. Null is a normal answer. */
export const labOrderResponseSchema = z.object({
  order: labOrderSchema.nullable(),
})
export type LabOrderResponse = z.infer<typeof labOrderResponseSchema>
