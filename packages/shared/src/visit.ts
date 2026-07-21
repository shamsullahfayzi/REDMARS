import { z } from 'zod'

/**
 * Task 3.5 — visit create.
 *
 * A Visit is the spine. Every clinical record — vitals, diagnosis, prescription, lab
 * order, invoice — points at a Visit, never straight at the Patient. A patient is who
 * someone IS; a visit is one occasion they came in. That is why registering a patient
 * (task 3.1) and starting a visit are two different acts: a patient is registered once
 * and visits many times.
 *
 * What the desk supplies is small: which kind of visit, which department, which doctor,
 * what the patient says is wrong, and who sent them. The visit number, the timestamp and
 * the `arrived` status are the server's to set.
 */

/** Mirrors the Prisma `VisitType` enum. A value added there must be added here. */
export const VISIT_TYPES = [
  'opd_consult',
  'follow_up',
  'walk_in_lab',
  'walk_in_pharmacy',
  'emergency',
  'ipd',
] as const
export const visitTypeSchema = z.enum(VISIT_TYPES)
export type VisitType = z.infer<typeof visitTypeSchema>

/**
 * What the reception desk may actually start — every type EXCEPT `ipd`.
 *
 * Admission to a ward is not a dropdown option at the front desk: it needs a bed, a
 * ward, and the `ipd` module, which is off at Farhat. Keeping `ipd` out of create means
 * Phase 8 widens this list deliberately instead of inheriting the capability by
 * accident, and a client that sends it gets a 400 rather than a half-formed admission.
 */
export const VISIT_CREATE_TYPES = [
  'opd_consult',
  'follow_up',
  'walk_in_lab',
  'walk_in_pharmacy',
  'emergency',
] as const
export type VisitCreateType = (typeof VISIT_CREATE_TYPES)[number]

/** Mirrors the Prisma `VisitStatus` enum. */
export const VISIT_STATUSES = [
  'planned',
  'arrived',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
  'entered_in_error',
] as const
export const visitStatusSchema = z.enum(VISIT_STATUSES)
export type VisitStatus = z.infer<typeof visitStatusSchema>

/**
 * A visit is OPEN while the patient is still somewhere in the building. These three are
 * the statuses the queue reads; the rest mean the occasion is over one way or another.
 */
export const OPEN_VISIT_STATUSES = ['arrived', 'in_progress', 'on_hold'] as const

const optionalText = (max: number) => z.string().trim().max(max).nullish()

/** A <select> hands back '' when nothing is chosen. Treat that as "not chosen". */
const optionalId = z
  .union([z.uuid(), z.literal('')])
  .nullish()
  .transform((v) => (v ? v : null))

export const createVisitRequestSchema = z.object({
  patientId: z.uuid('Choose a patient.'),
  type: z.enum(VISIT_CREATE_TYPES),
  departmentId: z.uuid('Choose a department.'),
  // Null for a walk-in lab or pharmacy visit — nobody is being consulted, so there is
  // no doctor to name. The column is nullable for exactly this case.
  practitionerId: optionalId,
  // Free text, deliberately. "oliguria, frequency, nocturia" is how the old system does
  // it and how a receptionist types what she was told. A coded complaint list would be
  // over-modeling — the doctor's coded conclusion is the Diagnosis, later.
  chiefComplaint: optionalText(500),
  // Marketing data, straight off the Medi-Pro form: which outside doctor sends patients.
  referredBy: optionalText(120),
  referralSource: optionalText(120),
  // Set only after the desk has been shown the open visit and said to start another.
  acknowledgeOpenVisit: z.boolean().default(false),
})
export type CreateVisitRequest = z.infer<typeof createVisitRequestSchema>

/**
 * What a visit looks like coming back. Denormalised names ride along — the queue screen
 * (task 3.7) shows a doctor and a department, and one join here beats a lookup per row
 * in the browser.
 */
export const visitSummarySchema = z.object({
  id: z.uuid(),
  visitNo: z.string(),
  type: visitTypeSchema,
  status: visitStatusSchema,
  patientId: z.uuid(),
  patientName: z.string(),
  patientMrn: z.string(),
  departmentId: z.uuid(),
  departmentName: z.string(),
  practitionerId: z.string().nullable(),
  practitionerName: z.string().nullable(),
  chiefComplaint: z.string().nullable(),
  referredBy: z.string().nullable(),
  referralSource: z.string().nullable(),
  startedAt: z.string(),
})
export type VisitSummary = z.infer<typeof visitSummarySchema>

/** The 409 body when the patient already has an open visit in this department. */
export const openVisitConflictSchema = z.object({
  code: z.literal('open_visit'),
  message: z.string(),
  visits: z.array(visitSummarySchema),
})
export type OpenVisitConflict = z.infer<typeof openVisitConflictSchema>

/**
 * The two pickers the visit form needs, in one request.
 *
 * Deliberately NOT the admin department/practitioner lists: those are gated on
 * `*.manage` and carry things the desk has no business with — licence numbers, the
 * linked user account, deactivated rows. This is the same master data narrowed to what
 * a person booking a visit actually chooses between.
 */
export const visitDepartmentOptionSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  nameLocalPrs: z.string().nullable(),
  nameLocalPs: z.string().nullable(),
})
export type VisitDepartmentOption = z.infer<typeof visitDepartmentOptionSchema>

export const visitPractitionerOptionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  specialityName: z.string().nullable(),
  // Which departments this practitioner may be booked into. A doctor works OPD and IPD
  // both, so the form filters by the chosen department rather than showing everyone.
  departmentIds: z.array(z.string()),
})
export type VisitPractitionerOption = z.infer<typeof visitPractitionerOptionSchema>

/**
 * The priced catalog the desk bills from (task 3.6). Carried here rather than on its own
 * endpoint because the reception screen needs departments, doctors and services in the
 * same breath, and a screen that must be fast should not pay for three round trips.
 *
 * `fee` is a decimal string, never a number — see the service contract. It is shown to
 * the desk and never sent back: the server prices the invoice from this same catalog.
 */
export const visitServiceOptionSchema = z.object({
  id: z.uuid(),
  departmentId: z.uuid(),
  code: z.string(),
  name: z.string(),
  fee: z.string(),
})
export type VisitServiceOption = z.infer<typeof visitServiceOptionSchema>

// ---------------------------------------------------------------------------------
// Task 3.7 — the queue
// ---------------------------------------------------------------------------------

/**
 * Who is waiting, and for how long.
 *
 * The queue is the one screen a doctor keeps open all day, so it carries what decides
 * WHO TO CALL NEXT and nothing else: the name, the age and sex that frame the
 * consultation, the complaint in the patient's own words, and the wait. Opening the
 * chart is a click away and is a separate, audited read (R1) — a queue that quietly
 * rendered clinical detail would log nobody as having looked at it.
 */
export const queueEntrySchema = z.object({
  id: z.uuid(),
  visitNo: z.string(),
  type: visitTypeSchema,
  status: visitStatusSchema,
  patientId: z.uuid(),
  patientName: z.string(),
  patientMrn: z.string(),
  gender: z.string(),
  ageYears: z.number().nullable(),
  departmentId: z.uuid(),
  departmentName: z.string(),
  practitionerId: z.string().nullable(),
  practitionerName: z.string().nullable(),
  chiefComplaint: z.string().nullable(),
  startedAt: z.string(),
  /**
   * Minutes since arrival, computed by the SERVER. A browser clock on a shared hospital
   * workstation is frequently wrong, and "waited 40 minutes" is the number that decides
   * who gets seen next — it should not depend on whose machine is reading it.
   */
  waitedMinutes: z.number().int(),
})
export type QueueEntry = z.infer<typeof queueEntrySchema>

/** The queue filters. Everything optional: the server picks sensible defaults per role. */
export const queueQuerySchema = z.object({
  departmentId: z.uuid().optional(),
  practitionerId: z.uuid().optional(),
  /** YYYY-MM-DD in the facility's own zone. Absent means today, there. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD.')
    .optional(),
  /** Absent means the open statuses — the people actually still in the building. */
  status: visitStatusSchema.optional(),
  /** Show every visit of the day, closed ones included. */
  includeClosed: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === true || v === 'true'),
})
export type QueueQuery = z.infer<typeof queueQuerySchema>

export const queueResponseSchema = z.object({
  entries: z.array(queueEntrySchema),
  /** The date actually served, so the screen can say which day it is showing. */
  date: z.string(),
  /** Counts per status for the day, so the header does not need a second request. */
  counts: z.object({
    arrived: z.number().int(),
    in_progress: z.number().int(),
    on_hold: z.number().int(),
    completed: z.number().int(),
  }),
  /** Echoes the scope the server resolved — a doctor's queue defaults to their own. */
  scope: z.object({
    departmentId: z.string().nullable(),
    practitionerId: z.string().nullable(),
    /** True when the server narrowed to the caller's own practitioner record. */
    mine: z.boolean(),
  }),
})
export type QueueResponse = z.infer<typeof queueResponseSchema>

export const visitOptionsResponseSchema = z.object({
  departments: z.array(visitDepartmentOptionSchema),
  practitioners: z.array(visitPractitionerOptionSchema),
  services: z.array(visitServiceOptionSchema),
})
export type VisitOptionsResponse = z.infer<typeof visitOptionsResponseSchema>
