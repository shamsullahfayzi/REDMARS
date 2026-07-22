import { z } from 'zod'

/**
 * Task 4.3 — vitals.
 *
 * Farhat has no nurse taking observations, so the doctor records these, and they are
 * optional: a psychiatric follow-up where nothing physical is measured is a complete
 * consultation. Nothing here may be required, which is why every field is nullable and
 * the only rule about presence is that a reading must contain at least ONE measurement.
 *
 * A READING IS APPENDED, NEVER EDITED. `Vitals` is a list on the visit, not a row, because
 * blood pressure gets re-taken — the patient sat down, the first cuff read high, the
 * clozapine dose was changed. Keeping the first reading is the point: a trend inside one
 * visit is clinical information, and R4 says a correction is a new record rather than an
 * overwrite. So there is no update endpoint and no delete.
 *
 * BMI IS NOT HERE, deliberately. The schema says "BMI is DERIVED. Do not store it." — so
 * it is not a column and it is not a field on the wire either. `bmiFrom` below is the one
 * implementation, shared so the API and the browser cannot disagree about it, exactly as
 * `currentAgeYears` is.
 */

/**
 * Bounds are PHYSIOLOGICALLY POSSIBLE, not normal.
 *
 * This distinction is the safety of the whole contract. A systolic of 240 is a
 * hypertensive crisis and must go in — refusing it would mean the one reading that most
 * needed recording is the one the system rejected. What these bounds catch is the typo:
 * 1200 for 120, 3.7 for 37. Everything between "possible" and "healthy" is the doctor's
 * judgement, and the contract has no business having an opinion about it.
 */
export const VITAL_BOUNDS = {
  systolicBp: [40, 300],
  diastolicBp: [20, 200],
  pulse: [20, 300],
  temperatureC: [25, 45],
  respiratory: [4, 80],
  spo2: [50, 100],
  weightKg: [0.5, 400],
  heightCm: [20, 260],
} as const satisfies Record<string, readonly [number, number]>

export type VitalField = keyof typeof VITAL_BOUNDS

/**
 * An empty box means "not measured", not zero. A form hands back '' for every field the
 * doctor skipped, and a vitals row where a blank became 0 would record a patient with no
 * pulse.
 */
function measurement(field: VitalField, options: { whole?: boolean } = {}) {
  const [min, max] = VITAL_BOUNDS[field]
  const range = `Must be between ${min} and ${max}.`

  const number = options.whole ? z.number().int('Whole numbers only.') : z.number()

  return z.preprocess((value) => {
    if (value === null || value === undefined) return null
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed === '') return null
      const parsed = Number(trimmed)
      // Not finite: hand the original back so zod reports a type error rather than
      // silently turning "12o" into NaN and then into nothing.
      return Number.isFinite(parsed) ? parsed : value
    }
    return value
  }, number.min(min, range).max(max, range).nullable())
}

export const recordVitalsRequestSchema = z
  .object({
    systolicBp: measurement('systolicBp', { whole: true }),
    diastolicBp: measurement('diastolicBp', { whole: true }),
    pulse: measurement('pulse', { whole: true }),
    temperatureC: measurement('temperatureC'),
    respiratory: measurement('respiratory', { whole: true }),
    spo2: measurement('spo2', { whole: true }),
    weightKg: measurement('weightKg'),
    heightCm: measurement('heightCm'),
  })
  .refine((v) => Object.values(v).some((value) => value !== null), {
    message: 'Record at least one measurement.',
    path: ['form'],
  })
  // A blood pressure is a pair. One number on its own is half a measurement, and the half
  // that is missing is the one somebody will assume was normal.
  .refine((v) => (v.systolicBp === null) === (v.diastolicBp === null), {
    message: 'Blood pressure needs both numbers.',
    path: ['systolicBp'],
  })
  .refine((v) => v.systolicBp === null || v.diastolicBp === null || v.systolicBp > v.diastolicBp, {
    message: 'The top number must be higher than the bottom one.',
    path: ['systolicBp'],
  })
export type RecordVitalsRequest = z.infer<typeof recordVitalsRequestSchema>

/**
 * What comes back.
 *
 * The three Decimal columns travel as STRINGS: `Prisma.Decimal` is exact and stringifying
 * it is lossless, while the request takes plain numbers because that is what a number
 * input produces and what the column then rounds to its own scale. The asymmetry is
 * deliberate — the database is the authority on how many decimal places a weight has, and
 * the response says what was actually stored rather than what was sent.
 */
export const vitalsReadingSchema = z.object({
  id: z.uuid(),
  visitId: z.uuid(),
  systolicBp: z.number().int().nullable(),
  diastolicBp: z.number().int().nullable(),
  pulse: z.number().int().nullable(),
  temperatureC: z.string().nullable(),
  respiratory: z.number().int().nullable(),
  spo2: z.number().int().nullable(),
  weightKg: z.string().nullable(),
  heightCm: z.string().nullable(),
  recordedAt: z.string(),
  recordedBy: z.string().nullable(),
  /** So the reading reads as a person rather than a uuid — same as the status trail. */
  recordedByName: z.string().nullable(),
})
export type VitalsReading = z.infer<typeof vitalsReadingSchema>

export const vitalsListResponseSchema = z.object({
  /** Newest first: the current state of the patient is the top of the list. */
  readings: z.array(vitalsReadingSchema),
})
export type VitalsListResponse = z.infer<typeof vitalsListResponseSchema>

/**
 * BMI, derived on demand and never stored — the schema's own instruction.
 *
 * Lives here rather than in the web app so there is exactly one formula. Returns null
 * unless both numbers are present, because a BMI computed from a guessed height is a
 * number that looks like a measurement.
 */
export function bmiFrom(weightKg: string | null, heightCm: string | null): number | null {
  if (weightKg === null || heightCm === null) return null
  const weight = Number(weightKg)
  const metres = Number(heightCm) / 100
  if (!Number.isFinite(weight) || !Number.isFinite(metres) || metres <= 0) return null
  return Math.round((weight / (metres * metres)) * 10) / 10
}
