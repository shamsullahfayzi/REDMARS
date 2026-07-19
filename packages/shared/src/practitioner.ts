import { z } from 'zod'

/**
 * Practitioner contract (task 2.2) — a clinician (FHIR Practitioner).
 *
 * Two relationships carry the weight:
 *  - userId: an OPTIONAL 1:1 link to an AppUser. A practitioner who logs in has
 *    one; a visiting consultant with no account does not.
 *  - departmentIds: the MANY-to-many (PractitionerDepartment). This is Shamo's
 *    catch — one doctor works OPD and IPD both. Which hat he wore on a given day
 *    lives on the Visit, not here; here is just "which departments he can work".
 */

// An optional uuid field that a <select> leaves as '' when unset. Map '' and
// undefined alike to undefined so the server stores null, never an empty string.
const optionalId = z
  .uuid()
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : undefined))

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined))

export const practitionerSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  specialityId: z.string().nullable(),
  specialityName: z.string().nullable(),
  userId: z.string().nullable(),
  licenseNo: z.string().nullable(),
  phone: z.string().nullable(),
  isActive: z.boolean(),
  departmentIds: z.array(z.string()),
})
export type PractitionerSummary = z.infer<typeof practitionerSummarySchema>

export const practitionerListResponseSchema = z.object({
  practitioners: z.array(practitionerSummarySchema),
})
export type PractitionerListResponse = z.infer<typeof practitionerListResponseSchema>

export const createPractitionerRequestSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(20),
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  specialityId: optionalId,
  userId: optionalId,
  licenseNo: optionalText(50),
  phone: optionalText(30),
  // May be empty at creation — an admin can assign departments later.
  departmentIds: z.array(z.uuid()).default([]),
})
export type CreatePractitionerRequest = z.infer<typeof createPractitionerRequestSchema>

// Replaces the whole department set for a practitioner (the edit-memberships
// action). Sending [opd, ipd] makes exactly those two the practitioner's
// departments; sending [] removes them all.
export const setPractitionerDepartmentsRequestSchema = z.object({
  departmentIds: z.array(z.uuid()),
})
export type SetPractitionerDepartmentsRequest = z.infer<
  typeof setPractitionerDepartmentsRequestSchema
>
