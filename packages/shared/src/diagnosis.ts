import { z } from 'zod'

/**
 * Task 4.5 — the doctor's conclusion.
 *
 * FREE TEXT IS ALWAYS ALLOWED, and the code is optional. The schema says so in as many
 * words — "they won't always find a code" — and the ordering matters: a doctor writes what
 * they concluded and MAY attach an ICD-10 code to it. A contract that required the code
 * would make the catalog's gaps into gaps in the medical record, which is the wrong thing
 * to be strict about.
 *
 * `certainty` is why a psychiatric system needs this table rather than a text field. A
 * provisional diagnosis, a differential being carried, and a confirmed one are different
 * clinical claims, and `refuted` is the one people forget: ruling something OUT is a
 * finding worth keeping, not a row to delete.
 */

/** Mirrors the Prisma `DiagnosisCertainty` enum. */
export const DIAGNOSIS_CERTAINTIES = [
  'provisional',
  'differential',
  'confirmed',
  'refuted',
] as const
export const diagnosisCertaintySchema = z.enum(DIAGNOSIS_CERTAINTIES)
export type DiagnosisCertainty = z.infer<typeof diagnosisCertaintySchema>

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null))

export const recordDiagnosisRequestSchema = z.object({
  text: z.string().trim().min(2, 'Write the diagnosis.').max(300),
  /** A code from the seeded ICD-10 catalog, or nothing. Checked against it server-side. */
  icdCode: optionalText(10),
  // Defaults to provisional, which is what an unqualified diagnosis actually is at the
  // end of a first consultation. Defaulting to `confirmed` would put a certainty on the
  // record that nobody claimed.
  certainty: diagnosisCertaintySchema.default('provisional'),
  /**
   * Exactly one diagnosis on a visit is primary — the server clears the others rather
   * than trusting a client to. "Primary" is singular by definition, and two of them is a
   * record that cannot answer what the patient was treated for.
   */
  isPrimary: z.boolean().default(false),
  notes: optionalText(500),
})
export type RecordDiagnosisRequest = z.infer<typeof recordDiagnosisRequestSchema>

/** Editing is a full replace of the mutable fields, so it is the same shape. */
export const updateDiagnosisRequestSchema = recordDiagnosisRequestSchema
export type UpdateDiagnosisRequest = z.infer<typeof updateDiagnosisRequestSchema>

export const diagnosisSchema = z.object({
  id: z.uuid(),
  visitId: z.uuid(),
  text: z.string(),
  icdCode: z.string().nullable(),
  /** Denormalised so a list reads as "F32.1 — Moderate depressive episode" in one request. */
  icdTitle: z.string().nullable(),
  certainty: diagnosisCertaintySchema,
  isPrimary: z.boolean(),
  notes: z.string().nullable(),
  practitionerId: z.string().nullable(),
  practitionerName: z.string().nullable(),
  createdAt: z.string(),
})
export type Diagnosis = z.infer<typeof diagnosisSchema>

export const diagnosisListResponseSchema = z.object({
  /** Primary first, then oldest first — the order a discharge summary reads in. */
  diagnoses: z.array(diagnosisSchema),
})
export type DiagnosisListResponse = z.infer<typeof diagnosisListResponseSchema>
