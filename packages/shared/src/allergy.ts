import { z } from 'zod'

/**
 * Task 4.6 — the safety table.
 *
 * An allergy belongs to the PATIENT, not to a visit. It is true on the day it is recorded
 * and true five years later at a different consultation, and hanging it off an encounter
 * would mean the penicillin reaction from March is invisible in September. Every other
 * clinical record in this system points at a Visit; this one deliberately does not.
 *
 * SEVERITY HAS NO DEFAULT. Every other enum in this phase defaults to its least alarming
 * value, and this one must not: an allergy recorded in a hurry with the severity left
 * unstated would read as `mild` on the screen that decides whether to prescribe. If the
 * person recording it does not know how bad it was, they have to say something rather than
 * have the contract say it for them.
 */

/** Mirrors the Prisma `AllergySeverity` enum. */
export const ALLERGY_SEVERITIES = ['mild', 'moderate', 'severe'] as const
export const allergySeveritySchema = z.enum(ALLERGY_SEVERITIES)
export type AllergySeverity = z.infer<typeof allergySeveritySchema>

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null))

export const recordAllergyRequestSchema = z.object({
  /**
   * Free text, always. The formulary does not contain peanuts, dust or sulfa in general,
   * and an allergy the system cannot name is the one most likely to hurt somebody.
   */
  substance: z.string().trim().min(2, 'Name the substance.').max(120),
  /**
   * Set when it IS a formulary drug, which is what lets task 4.8 block a prescription by
   * id rather than by string comparison. Optional, because most allergies are not.
   */
  drugId: z
    .union([z.uuid(), z.literal('')])
    .nullish()
    .transform((v) => (v ? v : null)),
  /** What happened. "Rash" and "anaphylaxis" are not the same warning. */
  reaction: optionalText(200),
  severity: allergySeveritySchema,
})
export type RecordAllergyRequest = z.infer<typeof recordAllergyRequestSchema>

/**
 * Editing is a full replace, plus the one flag that matters.
 *
 * `isActive` false is how an allergy is RETRACTED — never a delete, per R4. The row stays,
 * so "penicillin was on this chart and someone took it off" remains answerable, and the
 * audit trail names who did it and when.
 */
export const updateAllergyRequestSchema = recordAllergyRequestSchema.extend({
  isActive: z.boolean().default(true),
})
export type UpdateAllergyRequest = z.infer<typeof updateAllergyRequestSchema>

export const allergySchema = z.object({
  id: z.uuid(),
  patientId: z.uuid(),
  substance: z.string(),
  drugId: z.string().nullable(),
  /** Denormalised, so a list can show the formulary name it was matched to. */
  drugName: z.string().nullable(),
  reaction: z.string().nullable(),
  severity: allergySeveritySchema,
  isActive: z.boolean(),
  notedAt: z.string(),
  notedBy: z.string().nullable(),
  notedByName: z.string().nullable(),
})
export type Allergy = z.infer<typeof allergySchema>

export const allergyListResponseSchema = z.object({
  /**
   * Active first and most severe first, retracted ones last. Includes the retracted rows
   * on purpose: "penicillin, removed in March" is information a doctor wants, and a list
   * that hid it would look identical to a patient who was never asked.
   */
  allergies: z.array(allergySchema),
})
export type AllergyListResponse = z.infer<typeof allergyListResponseSchema>

/** Sort key: the worst thing first, because the banner is read top-down and in a hurry. */
export const ALLERGY_SEVERITY_RANK: Readonly<Record<AllergySeverity, number>> = {
  severe: 0,
  moderate: 1,
  mild: 2,
}
