import { z } from 'zod'

/**
 * Speciality contract (task 2.2) — a small GLOBAL lookup. Unlike departments and
 * rooms, Speciality has no facilityId: specialities (Cardiology, Psychiatry) are
 * shared reference data, not per-hospital. Practitioners reference it.
 *
 * The model has no isActive / deletedAt column, so there is deliberately no delete
 * or deactivate here — a speciality a practitioner points at must not vanish.
 */

export const specialitySummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
})
export type SpecialitySummary = z.infer<typeof specialitySummarySchema>

export const specialityListResponseSchema = z.object({
  specialities: z.array(specialitySummarySchema),
})
export type SpecialityListResponse = z.infer<typeof specialityListResponseSchema>

export const createSpecialityRequestSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(20),
  name: z.string().trim().min(2, 'Speciality name is required').max(80),
})
export type CreateSpecialityRequest = z.infer<typeof createSpecialityRequestSchema>
