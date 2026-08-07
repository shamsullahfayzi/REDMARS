import { z } from 'zod'
import { visitBillSchema } from './invoice.js'

/**
 * Task 6b.7 — every unpaid lab and pharmacy bill, in one list.
 *
 * Reception raises the OPD bill and knows it; the lab and pharmacy each raise their own,
 * away from the front desk, and until now finding one meant opening the patient first. This
 * is the same `VisitBill` shape the visit-bills panel (6.2) already reads — just gathered
 * across the whole facility instead of one visit, and filtered to the two tills reception
 * cannot see money land at: lab and pharmacy, still owing something.
 *
 * NO DATE DEFAULT, on purpose — unlike Reports and Invoices. This list's whole point is "an
 * unpaid bill reception hasn't found yet," and a bill five days old still owing money is a
 * MORE urgent reason to be on this list, not a reason to be hidden by a default filter. A
 * status filter already bounds it (`issued`/`partially_paid` only, never the whole invoice
 * history), so what actually protects a heavy facility from an unbounded query is
 * pagination, below — same shape as the invoice register (6.1).
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const collectionsListQuerySchema = z.object({
  /** Optional narrowing, not a default filter — absent means every open bill, oldest debt included. */
  from: isoDate.optional(),
  to: isoDate.optional(),
  /** Free text over the invoice number, and the patient's name and MRN — same as the register. */
  q: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
export type CollectionsListQuery = z.infer<typeof collectionsListQuerySchema>

export const collectionsListResponseSchema = z.object({
  bills: z.array(visitBillSchema),
  /** Total open bills matching the filter, which may exceed the returned page. */
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
})
export type CollectionsListResponse = z.infer<typeof collectionsListResponseSchema>
