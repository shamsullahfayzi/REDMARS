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
})

export type PatientSummary = z.infer<typeof patientSummarySchema>
