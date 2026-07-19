import { z } from 'zod'

/**
 * Department contract (task 2.1) — the wire shape shared by apps/api and apps/web.
 *
 * Two distinct fields people confuse: `type` is the fixed clinical category (a
 * Prisma enum), while `code` is a free, per-facility unique label the admin picks
 * ("OPD", "OPD-2"). The enum drives behaviour later (which module a department
 * belongs to); the code is just a human handle.
 */

// Mirrors the Prisma `DepartmentType` enum. Hand-kept in sync — a value added to
// the schema must be added here, or the form's select will not offer it.
export const DEPARTMENT_TYPES = [
  'opd',
  'ipd',
  'emergency',
  'laboratory',
  'radiology',
  'pharmacy',
  'administration',
] as const
export type DepartmentType = (typeof DEPARTMENT_TYPES)[number]

// The shape sent to the browser. No facilityId: one tenant per database, and the
// client never needs it — same discipline as userSummarySchema omitting the hash.
export const departmentSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  type: z.enum(DEPARTMENT_TYPES),
  nameLocalPrs: z.string().nullable(),
  nameLocalPs: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
})
export type DepartmentSummary = z.infer<typeof departmentSummarySchema>

export const departmentListResponseSchema = z.object({
  departments: z.array(departmentSummarySchema),
})
export type DepartmentListResponse = z.infer<typeof departmentListResponseSchema>

export const createDepartmentRequestSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(20),
  name: z.string().trim().min(2, 'Department name is required').max(80),
  type: z.enum(DEPARTMENT_TYPES),
  // Optional local names. A blank field arrives as '' from the form; map it to
  // undefined so we store "not provided", never an empty string.
  nameLocalPrs: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => (v ? v : undefined)),
  nameLocalPs: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => (v ? v : undefined)),
})
export type CreateDepartmentRequest = z.infer<typeof createDepartmentRequestSchema>

export const setDepartmentActiveRequestSchema = z.object({
  isActive: z.boolean(),
})
export type SetDepartmentActiveRequest = z.infer<typeof setDepartmentActiveRequestSchema>
