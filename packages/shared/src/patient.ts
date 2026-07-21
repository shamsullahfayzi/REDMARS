import { z } from 'zod'
import { genderSchema } from './referenceRange.js'

/**
 * Task 3.1 — patient registration.
 *
 * The contract is deliberately STRICTER than the columns in two places and LOOSER in
 * none. `phone` is nullable in the schema (legacy Medi-Pro rows arrive without one and
 * must still be storable) but required here, because Farhat's reception desk asks every
 * patient. Policy belongs in the contract; storage stays permissive.
 *
 * Age is the subtle one. There is no `age` column — there is a real `dateOfBirth` OR an
 * estimate, and in ~99.9% of registrations the receptionist is told a number ("thirty",
 * "six months"). So the rule is a CROSS-FIELD one: at least one of the two paths must be
 * present. Neither field is required on its own.
 *
 * `isDeceased`/`deceasedDate` are deliberately absent: a patient being registered at the
 * front desk is alive. Recording a death is an edit, not a registration.
 */

/** Mirrors the Prisma `GuardianRelation` enum — S/o, D/o, W/o off the Medi-Pro form. */
export const GUARDIAN_RELATIONS = [
  'son_of',
  'daughter_of',
  'wife_of',
  'husband_of',
  'father_of',
  'mother_of',
  'other',
] as const
export const guardianRelationSchema = z.enum(GUARDIAN_RELATIONS)
export type GuardianRelation = z.infer<typeof guardianRelationSchema>

/**
 * What the form offers for age. Days exist as a column for newborns but are not worth a
 * third control at the desk — a date of birth covers that case.
 */
export const AGE_UNITS = ['years', 'months'] as const
export const ageUnitSchema = z.enum(AGE_UNITS)
export type AgeUnit = z.infer<typeof ageUnitSchema>

/** An optional free-text field: absent, null, or a trimmed non-empty string. */
const optionalText = (max = 120) => z.string().trim().max(max).nullish()

/** YYYY-MM-DD. Kept a string end-to-end so no timezone can shift the date by a day. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD.')
  .nullish()

export const createPatientRequestSchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required.').max(55),
    // Optional on purpose: a patient who has no family name, or declines to give it,
    // must not force the receptionist to invent one. Garbage beats blank.
    lastName: optionalText(55),
    prefix: optionalText(16),

    gender: genderSchema,

    // Required by policy — see the note at the top of the file.
    phone: z
      .string()
      .trim()
      .min(7, 'Phone number is required.')
      .max(20)
      .regex(/^[0-9+\-\s()]+$/, 'Phone number may contain digits only.'),
    altPhone: optionalText(20),

    // --- the two age paths; the refinement below requires one of them ---
    dateOfBirth: isoDate,
    estimatedAgeYears: z.number().int().min(0).max(130).nullish(),
    estimatedAgeMonths: z.number().int().min(0).max(240).nullish(),
    estimatedAgeDays: z.number().int().min(0).max(365).nullish(),

    guardianName: optionalText(80),
    guardianRelation: guardianRelationSchema.nullish(),

    address: optionalText(200),
    district: optionalText(80),
    province: optionalText(80),

    nationalId: optionalText(40),
    passportNo: optionalText(40),
    occupation: optionalText(80),
    nationality: optionalText(60),
    bloodGroup: optionalText(8),
  })
  .refine(
    (v) =>
      v.dateOfBirth != null ||
      v.estimatedAgeYears != null ||
      v.estimatedAgeMonths != null ||
      v.estimatedAgeDays != null,
    {
      message: 'Enter an age or a date of birth.',
      path: ['estimatedAgeYears'],
    },
  )

export type CreatePatientRequest = z.infer<typeof createPatientRequestSchema>

/**
 * What comes back. The MRN is the point — the receptionist never types it, the
 * NumberSequence issuer (task 2.10) mints it as `MRN-000001`, lifelong and not
 * per-year, because a medical record number identifies a human forever.
 */
export const patientSummarySchema = z.object({
  id: z.uuid(),
  mrn: z.string(),
  prefix: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  gender: genderSchema,
  phone: z.string().nullable(),
  address: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  estimatedAgeYears: z.number().int().nullable(),
  estimatedAgeMonths: z.number().int().nullable(),
  /** The anchor. Without it an estimated age cannot be aged forward — see below. */
  ageRecordedAt: z.string().nullable(),
})

export type PatientSummary = z.infer<typeof patientSummarySchema>

/**
 * The patient's age TODAY, in years, or null if neither path was recorded.
 *
 * This is the whole reason `ageRecordedAt` exists. A stored estimate is only true on
 * the day it was taken, so it has to be aged forward by the time since — otherwise a
 * patient registered at thirty is still thirty three years later, on every screen that
 * reads the row. A real date of birth needs no such correction.
 *
 * Lives here rather than in the web app so the API, the UI, and any future report all
 * compute an age the same way.
 */
export function currentAgeYears(
  patient: Pick<
    PatientSummary,
    'dateOfBirth' | 'estimatedAgeYears' | 'estimatedAgeMonths' | 'ageRecordedAt'
  >,
  now: Date = new Date(),
): number | null {
  if (patient.dateOfBirth) {
    const born = new Date(`${patient.dateOfBirth}T00:00:00Z`)
    return Math.max(0, Math.floor((now.getTime() - born.getTime()) / MS_PER_YEAR))
  }

  const base =
    patient.estimatedAgeYears != null
      ? patient.estimatedAgeYears
      : patient.estimatedAgeMonths != null
        ? patient.estimatedAgeMonths / 12
        : null
  if (base == null) return null

  // No anchor means the estimate cannot be aged forward; return it as recorded rather
  // than silently pretending it is current.
  if (!patient.ageRecordedAt) return Math.floor(base)

  const elapsed = (now.getTime() - new Date(patient.ageRecordedAt).getTime()) / MS_PER_YEAR
  return Math.max(0, Math.floor(base + Math.max(0, elapsed)))
}

const MS_PER_YEAR = 365.2425 * 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------------
// Task 3.2 — search
// ---------------------------------------------------------------------------------

/** Below this a search is noise: two characters match half the register. */
export const PATIENT_SEARCH_MIN = 2
export const PATIENT_SEARCH_LIMIT = 20

/**
 * One box, three kinds of answer. The receptionist is handed a name, a phone, or an old
 * card with an MRN on it, and should not have to tell the system which — the server
 * matches all three and lets the term decide.
 */
export const patientSearchQuerySchema = z.object({
  q: z.string().trim().min(PATIENT_SEARCH_MIN, 'Enter at least two characters.').max(60),
  limit: z.coerce.number().int().min(1).max(50).default(PATIENT_SEARCH_LIMIT),
})

export type PatientSearchQuery = z.infer<typeof patientSearchQuerySchema>

export const patientSearchResponseSchema = z.object({
  patients: z.array(patientSummarySchema),
  /** Total matches, which may exceed the returned page — "12 Najilas, showing 20". */
  total: z.number().int(),
})

export type PatientSearchResponse = z.infer<typeof patientSearchResponseSchema>
