import { z } from 'zod'

/**
 * Task 4.15 — "psych patients due next month are listable."
 *
 * THE RECALL LIST IS NOT THE APPOINTMENT BOOK, and everything here follows from that.
 *
 * Task 3.10 books slots: a patient is expected at a time, and the desk works the book each
 * morning. That only ever knows about the people who made an appointment. A psychiatric
 * outpatient at Farhat is told "come back in four weeks" and mostly does not book — so the
 * question that matters clinically, "who was due in September and never came", cannot be
 * asked of the book at all. It can be asked of this.
 *
 * Which is why `attended` is on every row. A list of who is due is a diary; a list of who
 * is due AND HAS NOT BEEN SEEN is a work queue, and disengagement is the thing a psychiatric
 * service is trying to catch. It is computed, never stored — see `FollowUp.attended`.
 */

/** Today plus a month, which is the done-when's window and the desk's working horizon. */
export const FOLLOW_UP_DEFAULT_DAYS = 30

/**
 * How many rows come back at most.
 *
 * A month of a busy clinic is more names than anyone rings in a day, and the response says
 * when it stopped rather than quietly ending. Narrowing the window is the way to see the
 * rest — deliberately, because a recall list worked in pages is a recall list worked
 * halfway.
 */
export const FOLLOW_UP_LIMIT = 200

const dayString = (message: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, message)

export const followUpQuerySchema = z.object({
  /** Inclusive. Absent means today at the hospital. */
  from: dayString('Use a date like 2026-08-15.').optional(),
  /** Inclusive. Absent means `FOLLOW_UP_DEFAULT_DAYS` after `from`. */
  to: dayString('Use a date like 2026-08-15.').optional(),
  /** Narrow to one prescriber. Absent means everyone's. */
  practitionerId: z.uuid().optional(),
  /**
   * Only the ones who have not been seen since their date — the reason to open this screen
   * on a window that has already passed.
   */
  onlyMissed: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === true || v === 'true'),
})
export type FollowUpQuery = z.infer<typeof followUpQuerySchema>

export const followUpResponseStatusSchema = z.enum(['coming', 'not_coming', 'custom'])
export type FollowUpResponseStatus = z.infer<typeof followUpResponseStatusSchema>

/**
 * What a call found out, logged by the call center against ONE follow-up date. Append-only
 * on the server (a correction is a new row, never an overwrite — R4); this is always the
 * latest one for the date being shown. `note` is free text on every status, not only
 * `custom` — "coming, but running late" is a real thing to write down against "coming."
 */
export const followUpResponseSchema = z.object({
  status: followUpResponseStatusSchema,
  note: z.string().nullable(),
  recordedByName: z.string(),
  recordedAt: z.string(),
})
export type FollowUpResponse = z.infer<typeof followUpResponseSchema>

/** `follow_up.respond` — logging what a call found out. Note is optional on every status. */
export const recordFollowUpResponseRequestSchema = z.object({
  status: followUpResponseStatusSchema,
  note: z.string().trim().max(300).optional(),
})
export type RecordFollowUpResponseRequest = z.infer<typeof recordFollowUpResponseRequestSchema>

export const followUpSchema = z.object({
  /** The prescription the date was written on. */
  prescriptionId: z.uuid(),
  /** The visit it was written in — a place to go and re-read what was decided. */
  visitId: z.uuid(),
  visitNo: z.string(),
  /** When that consultation happened, so a row says how long ago the plan was made. */
  visitDate: z.string(),
  patientId: z.uuid(),
  patientName: z.string(),
  patientMrn: z.string(),
  /**
   * The number the desk rings. This list exists to be ACTED on, and a recall list that
   * sends someone to look up a phone number one row at a time does not get worked.
   */
  patientPhone: z.string().nullable(),
  practitionerId: z.string().nullable(),
  practitionerName: z.string().nullable(),
  /** YYYY-MM-DD. */
  followUpDate: z.string(),
  /**
   * Has this patient been seen ON OR AFTER the day they were due?
   *
   * DERIVED, never stored — a stored flag would need something to keep it true, and the
   * thing that would have to update it is a patient walking in, which no code path owns.
   *
   * The rule is deliberately literal, and its limit is worth knowing: someone who came back
   * a fortnight EARLY and was dealt with still reads as not attended, because the question
   * this answers is "seen since the date", not "seen about this". A false positive on a
   * recall list costs a phone call; a false negative loses a patient.
   */
  attended: z.boolean(),
  /** The most recent visit on or after the due date, when there is one. */
  attendedAt: z.string().nullable(),
  /** The call center's latest answer for THIS `followUpDate`, or null — nobody's called yet. */
  response: followUpResponseSchema.nullable(),
})
export type FollowUp = z.infer<typeof followUpSchema>

export const followUpListResponseSchema = z.object({
  /** The window actually served, echoed so the screen can say which days it is showing. */
  from: z.string(),
  to: z.string(),
  /** Soonest first — the ones about to be missed are the ones to ring today. */
  followUps: z.array(followUpSchema),
  /** True when the window held more than `FOLLOW_UP_LIMIT` and the list was cut. */
  truncated: z.boolean(),
  /** How many in this window have not been seen. The number the desk works down. */
  missed: z.number().int(),
})
export type FollowUpListResponse = z.infer<typeof followUpListResponseSchema>
