import { z } from 'zod'

/**
 * Service contract (task 2.3) — a priced catalog entry (e.g. "OPD consultation").
 * A Service belongs to a department and is the ONE place a price is allowed to
 * live: money sits on the catalog, never on a clinical record (guardrail 7).
 *
 * The fee crosses the wire as a STRING, not a number. A Decimal(12,2) in Postgres
 * carries exact money; a JavaScript number is a float and cannot — 0.1 + 0.2 is
 * not 0.3. So the fee is a decimal string end to end: the server formats it to two
 * places, the browser shows it verbatim and sends it back as typed.
 */

// Up to 10 integer digits + up to 2 decimals — the shape of Decimal(12,2). No
// sign, so it is non-negative by construction.
export const serviceFeeSchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Enter a valid amount')

export const serviceSummarySchema = z.object({
  id: z.uuid(),
  departmentId: z.uuid(),
  code: z.string(),
  name: z.string(),
  fee: z.string(),
  isActive: z.boolean(),
})
export type ServiceSummary = z.infer<typeof serviceSummarySchema>

export const serviceListResponseSchema = z.object({
  services: z.array(serviceSummarySchema),
})
export type ServiceListResponse = z.infer<typeof serviceListResponseSchema>

export const createServiceRequestSchema = z.object({
  departmentId: z.uuid(),
  code: z.string().trim().min(1, 'Code is required').max(20),
  name: z.string().trim().min(2, 'Service name is required').max(80),
  fee: serviceFeeSchema,
})
export type CreateServiceRequest = z.infer<typeof createServiceRequestSchema>

// Editing an existing service: its name and its fee. The department it belongs to
// is fixed at creation.
export const updateServiceRequestSchema = z.object({
  name: z.string().trim().min(2, 'Service name is required').max(80),
  fee: serviceFeeSchema,
})
export type UpdateServiceRequest = z.infer<typeof updateServiceRequestSchema>
