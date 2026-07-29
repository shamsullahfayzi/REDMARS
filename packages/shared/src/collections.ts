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
 */
export const collectionsListResponseSchema = z.object({
  bills: z.array(visitBillSchema),
})
export type CollectionsListResponse = z.infer<typeof collectionsListResponseSchema>
