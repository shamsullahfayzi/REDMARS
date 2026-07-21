import { z } from 'zod'

/**
 * Task 3.10 — the appointment book.
 *
 * This exists for one sentence a doctor says at the end of a consultation: "come back on
 * the fifth." Everything else follows from that. It is NOT a scheduling system — there
 * are no slots, no durations, no double-booking rules — because Farhat does not run one,
 * and a booking that promises a 10:15 the clinic has no way to honour is worse than a
 * date the patient can be sure of.
 *
 * A visit works fine without one, which is why this task sits on the cut list. An
 * appointment is a note about the future; a Visit is the record of someone actually
 * turning up. Nothing clinical hangs off an appointment, ever.
 */

/** Mirrors the Prisma `AppointmentStatus` enum. */
export const APPOINTMENT_STATUSES = ['booked', 'arrived', 'fulfilled', 'cancelled', 'no_show'] as const
export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES)
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>

/** Still expected to happen. The two the book is actually about. */
export const OPEN_APPOINTMENT_STATUSES = ['booked', 'arrived'] as const

const optionalId = z
  .union([z.uuid(), z.literal('')])
  .nullish()
  .transform((v) => (v ? v : null))

export const createAppointmentRequestSchema = z.object({
  patientId: z.uuid('Choose a patient.'),
  departmentId: z.uuid('Choose a department.'),
  // Null when the follow-up is with whoever is on that day rather than a named person.
  practitionerId: optionalId,
  /**
   * The day, not the minute. A doctor says "in two weeks", not "at 10:15", and storing a
   * precision the clinic does not work to would make every appointment look late.
   * The column is a DateTime; the server anchors this date to the facility's own
   * midnight so a booking is on the day Kabul thinks it is.
   */
  scheduledOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD.'),
  reason: z.string().trim().max(300).nullish(),
})
export type CreateAppointmentRequest = z.infer<typeof createAppointmentRequestSchema>

export const appointmentSummarySchema = z.object({
  id: z.uuid(),
  status: appointmentStatusSchema,
  patientId: z.uuid(),
  patientName: z.string(),
  patientMrn: z.string(),
  patientPhone: z.string().nullable(),
  departmentId: z.uuid(),
  departmentName: z.string(),
  practitionerId: z.string().nullable(),
  practitionerName: z.string().nullable(),
  /** YYYY-MM-DD as the facility reads it — the same day the desk booked. */
  scheduledOn: z.string(),
  reason: z.string().nullable(),
  /** Set once the patient turned up and a visit was raised against this booking. */
  visitId: z.string().nullable(),
  visitNo: z.string().nullable(),
  createdAt: z.string(),
})
export type AppointmentSummary = z.infer<typeof appointmentSummarySchema>

export const appointmentListQuerySchema = z.object({
  /** A single day. Absent means today, in the facility's zone. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD.')
    .optional(),
  /** Everything from `date` onwards instead of that one day — "what is coming". */
  upcoming: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === true || v === 'true'),
  patientId: z.uuid().optional(),
  practitionerId: z.uuid().optional(),
  departmentId: z.uuid().optional(),
  status: appointmentStatusSchema.optional(),
})
export type AppointmentListQuery = z.infer<typeof appointmentListQuerySchema>

export const appointmentListResponseSchema = z.object({
  appointments: z.array(appointmentSummarySchema),
  date: z.string(),
})
export type AppointmentListResponse = z.infer<typeof appointmentListResponseSchema>

/**
 * Closing a booking that will not become a visit.
 *
 * `cancelled` and `no_show` are two different facts and are kept apart on purpose:
 * cancelled means the patient told us, no_show means they never came. Collapsing them
 * would destroy the only number that says whether the clinic's follow-ups actually work.
 * They also sit on different permissions — see the matrix.
 */
export const closeAppointmentRequestSchema = z.object({
  status: z.enum(['cancelled', 'no_show']),
  reason: z.string().trim().max(300).nullish(),
})
export type CloseAppointmentRequest = z.infer<typeof closeAppointmentRequestSchema>
