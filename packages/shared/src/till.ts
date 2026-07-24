import { z } from 'zod'
import { paymentMethodSchema } from './reception.js'

/**
 * Task 6.12 — daily cash reconciliation, per till, per user.
 *
 * At closing, each till operator counts their drawer against what the system recorded. A
 * till is a person: the receptionist who took OPD money, the pharmacist who took medicine
 * money. The figure that must physically balance is CASH; card and transfer are recorded but
 * do not sit in the drawer.
 *
 * The arithmetic is self-correcting because payments are signed and append-only: a payment
 * is +X, a refund of it is a −X row, and summing every Payment.amount for the day gives the
 * true cash position without having to special-case reversals. A refund taken today lowers
 * today's till even when it reverses a payment from an earlier day, which is exactly what
 * the drawer does.
 */

export const tillReportQuerySchema = z.object({
  /** The facility day to close, YYYY-MM-DD in the hospital's zone. Absent means today. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional(),
  /** One till (all-tills view only). Absent means every till. */
  userId: z.uuid().optional(),
})
export type TillReportQuery = z.infer<typeof tillReportQuerySchema>

/** One payment method's take for a till — a line in the drawer breakdown. */
export const tillMethodTotalSchema = z.object({
  method: paymentMethodSchema,
  amount: z.string(),
})
export type TillMethodTotal = z.infer<typeof tillMethodTotalSchema>

/** One till's day: who ran it, the take by method, the cash to count, and the movement count. */
export const tillSummarySchema = z.object({
  /** Null for payments with no recorded taker (a system or migrated row). */
  userId: z.uuid().nullable(),
  userName: z.string(),
  byMethod: z.array(tillMethodTotalSchema),
  /** The cash figure that must match the drawer. */
  cashTotal: z.string(),
  /** Every method summed — the till's net take for the day. */
  total: z.string(),
  /** Money-in rows (payments) and money-out rows (refunds/reversals). */
  paymentCount: z.number().int(),
  refundCount: z.number().int(),
})
export type TillSummary = z.infer<typeof tillSummarySchema>

export const tillReportResponseSchema = z.object({
  date: z.string(),
  tills: z.array(tillSummarySchema),
  /** Across every till in the response. */
  grandTotal: z.string(),
  cashTotal: z.string(),
})
export type TillReportResponse = z.infer<typeof tillReportResponseSchema>
