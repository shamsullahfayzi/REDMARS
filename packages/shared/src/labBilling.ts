import { z } from 'zod'
import { labOrderItemStatusSchema } from './labOrder.js'
import { paymentMethodSchema } from './reception.js'

/**
 * Reception's lab settlement (Phase 5) — the counterpart to ordering: the desk collecting the
 * money a lab order raised, ONE TEST AT A TIME.
 *
 * The billing decision made back at 5.1 finally has its window screen. A doctor's order raises
 * its own unpaid invoice, each test its own line; a patient told to run four tests may pay for
 * only one, so the desk sees the lines, ticks the ones the patient is paying for, and takes the
 * cash for exactly those. A paid line frees its test for the bench to draw; the rest stay
 * waiting. Prices are never sent from the browser — they are the snapshot on the line, echoed
 * here so the desk can read them and total them, never accepted back.
 */

/** One billable lab test on the desk's screen. */
export const labChargeItemSchema = z.object({
  itemId: z.uuid(),
  testId: z.uuid(),
  code: z.string(),
  testName: z.string(),
  price: z.string(),
  isPaid: z.boolean(),
  /** The test's place in the lab pipeline — a paid, drawn test still shows as settled here. */
  status: labOrderItemStatusSchema,
})
export type LabChargeItem = z.infer<typeof labChargeItemSchema>

/** One order's charges, grouped under the invoice they sit on. */
export const labChargeOrderSchema = z.object({
  orderId: z.uuid(),
  orderNo: z.string(),
  invoiceId: z.uuid(),
  invoiceNo: z.string(),
  visitId: z.uuid(),
  orderedAt: z.string(),
  items: z.array(labChargeItemSchema),
  /** What is still owed on this order — the sum of its unpaid lines. */
  outstanding: z.string(),
})
export type LabChargeOrder = z.infer<typeof labChargeOrderSchema>

export const labChargesResponseSchema = z.object({
  patientId: z.uuid(),
  patientName: z.string(),
  patientMrn: z.string(),
  orders: z.array(labChargeOrderSchema),
})
export type LabChargesResponse = z.infer<typeof labChargesResponseSchema>

export const labChargesQuerySchema = z.object({
  patientId: z.uuid(),
  /** Absent shows only orders with something still owed; true shows settled ones too. */
  includePaid: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === true || v === 'true'),
})
export type LabChargesQuery = z.infer<typeof labChargesQuerySchema>

/**
 * Take payment for a set of lab lines. The desk ticks which tests the patient is paying for
 * and how; the amount is the server's sum of those lines, never a number the browser sends.
 */
export const payLabChargesRequestSchema = z.object({
  itemIds: z.array(z.uuid()).min(1).max(50),
  method: paymentMethodSchema,
  reference: z.string().trim().max(100).optional(),
})
export type PayLabChargesRequest = z.infer<typeof payLabChargesRequestSchema>

export const payLabChargesResponseSchema = z.object({
  paidItemIds: z.array(z.uuid()),
  /** The total taken, server-summed from the lines' snapshot prices. */
  amount: z.string(),
})
export type PayLabChargesResponse = z.infer<typeof payLabChargesResponseSchema>
