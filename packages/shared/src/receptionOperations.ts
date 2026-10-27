import { z } from 'zod'
import { moneySchema, paymentMethodSchema } from './reception.js'

const id = z.uuid()
const commandKey = z.uuid()
const text = (max = 500) => z.string().trim().min(1).max(max)
const optionalText = (max = 500) => z.string().trim().max(max).default('')
const optionalId = z.union([id, z.literal(''), z.null()]).optional().transform((value) => value || null)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const RECEPTION_REQUEST_KINDS = [
  'admission',
  'transfer',
  'discharge',
  'queue_priority',
  'patient_merge',
] as const
export const receptionRequestKindSchema = z.enum(RECEPTION_REQUEST_KINDS)
export const RECEPTION_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'completed',
] as const
export const receptionRequestStatusSchema = z.enum(RECEPTION_REQUEST_STATUSES)
export const RECEPTION_PRIORITIES = ['routine', 'urgent', 'emergency'] as const
export const receptionPrioritySchema = z.enum(RECEPTION_PRIORITIES)
export const RECEPTION_BED_STATUSES = [
  'available',
  'reserved',
  'occupied',
  'cleaning',
  'maintenance',
] as const
export const receptionBedStatusSchema = z.enum(RECEPTION_BED_STATUSES)

export const receptionBedSchema = z.object({
  id,
  code: z.string(),
  label: z.string(),
  departmentId: id,
  departmentName: z.string(),
  roomId: id.nullable(),
  roomName: z.string().nullable(),
  status: receptionBedStatusSchema,
  notes: z.string(),
  isActive: z.boolean(),
})
export type ReceptionBed = z.infer<typeof receptionBedSchema>

export const receptionBedInputSchema = z.object({
  departmentId: id,
  roomId: optionalId,
  code: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$/),
  label: text(80),
  status: receptionBedStatusSchema.default('available'),
  notes: optionalText(300),
  isActive: z.boolean().default(true),
  idempotencyKey: commandKey,
})
export type ReceptionBedInput = z.infer<typeof receptionBedInputSchema>

export const receptionBedUpdateSchema = receptionBedInputSchema.partial().extend({
  idempotencyKey: commandKey,
})
export type ReceptionBedUpdate = z.infer<typeof receptionBedUpdateSchema>

export const receptionCareRequestInputSchema = z
  .object({
    kind: receptionRequestKindSchema,
    patientId: id,
    targetPatientId: optionalId,
    visitId: optionalId,
    appointmentId: optionalId,
    departmentId: optionalId,
    sourceBedId: optionalId,
    targetBedId: optionalId,
    priority: receptionPrioritySchema.default('routine'),
    reason: text(300),
    notes: optionalText(1000),
    idempotencyKey: commandKey,
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'patient_merge' && !value.targetPatientId)
      ctx.addIssue({ code: 'custom', path: ['targetPatientId'], message: 'Choose the possible duplicate.' })
    if (value.kind === 'queue_priority' && !value.visitId)
      ctx.addIssue({ code: 'custom', path: ['visitId'], message: 'Choose the active visit.' })
    if (['transfer', 'discharge'].includes(value.kind) && !value.visitId)
      ctx.addIssue({ code: 'custom', path: ['visitId'], message: 'Choose the current visit.' })
    if (['admission', 'transfer'].includes(value.kind) && !value.departmentId)
      ctx.addIssue({ code: 'custom', path: ['departmentId'], message: 'Choose the destination department.' })
  })
export type ReceptionCareRequestInput = z.infer<typeof receptionCareRequestInputSchema>

export const receptionCareReviewSchema = z.object({
  status: z.enum(['approved', 'rejected', 'cancelled', 'completed']),
  note: optionalText(500),
  idempotencyKey: commandKey,
})
export type ReceptionCareReview = z.infer<typeof receptionCareReviewSchema>

export const receptionCareRequestSchema = z.object({
  id,
  reference: z.string(),
  kind: receptionRequestKindSchema,
  status: receptionRequestStatusSchema,
  priority: receptionPrioritySchema,
  patientId: id,
  patientName: z.string(),
  patientMrn: z.string(),
  targetPatientId: id.nullable(),
  targetPatientName: z.string().nullable(),
  visitId: id.nullable(),
  appointmentId: id.nullable(),
  departmentId: id.nullable(),
  departmentName: z.string().nullable(),
  sourceBedId: id.nullable(),
  targetBedId: id.nullable(),
  reason: z.string(),
  notes: z.string(),
  requestedBy: id,
  requestedByName: z.string(),
  requestedAt: z.string(),
  reviewedBy: id.nullable(),
  reviewedByName: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  reviewNote: z.string(),
  completedAt: z.string().nullable(),
})
export type ReceptionCareRequest = z.infer<typeof receptionCareRequestSchema>

export const WAITLIST_STATUSES = ['waiting', 'offered', 'booked', 'declined', 'cancelled'] as const
export const waitlistStatusSchema = z.enum(WAITLIST_STATUSES)
export const waitlistInputSchema = z.object({
  patientId: id,
  departmentId: id,
  practitionerId: optionalId,
  preferredOn: z.union([date, z.literal(''), z.null()]).optional().transform((value) => value || null),
  priority: receptionPrioritySchema.default('routine'),
  note: optionalText(500),
  idempotencyKey: commandKey,
})
export type WaitlistInput = z.infer<typeof waitlistInputSchema>
export const waitlistUpdateSchema = z.object({
  status: waitlistStatusSchema,
  appointmentId: optionalId,
  note: optionalText(500),
  idempotencyKey: commandKey,
})
export type WaitlistUpdate = z.infer<typeof waitlistUpdateSchema>
export const waitlistEntrySchema = z.object({
  id,
  patientId: id,
  patientName: z.string(),
  patientMrn: z.string(),
  departmentId: id,
  departmentName: z.string(),
  practitionerId: id.nullable(),
  practitionerName: z.string().nullable(),
  preferredOn: z.string().nullable(),
  priority: receptionPrioritySchema,
  status: waitlistStatusSchema,
  note: z.string(),
  appointmentId: id.nullable(),
  createdAt: z.string(),
  contactedAt: z.string().nullable(),
})
export type WaitlistEntry = z.infer<typeof waitlistEntrySchema>

export const patientDocumentInputSchema = z.object({
  category: z.enum(['identity', 'referral', 'consent', 'insurance', 'other']),
  fileName: text(160),
  mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  contentBase64: z.string().min(1).max(2_800_000),
  idempotencyKey: commandKey,
})
export type PatientDocumentInput = z.infer<typeof patientDocumentInputSchema>
export const patientDocumentSchema = z.object({
  id,
  category: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  sha256: z.string(),
  createdAt: z.string(),
  voidedAt: z.string().nullable(),
})

export const patientContactInputSchema = z.object({
  name: text(120),
  relationship: text(80),
  phone: z.string().trim().max(40).default(''),
  kind: z.enum(['guardian', 'emergency', 'family', 'other']).default('family'),
  isPrimary: z.boolean().default(false),
  isEmergency: z.boolean().default(false),
  canCall: z.boolean().default(false),
  canSms: z.boolean().default(false),
  canWhatsapp: z.boolean().default(false),
  safeInstructions: optionalText(500),
  idempotencyKey: commandKey,
})
export type PatientContactInput = z.infer<typeof patientContactInputSchema>
export const patientContactSchema = patientContactInputSchema.omit({ idempotencyKey: true }).extend({
  id,
  phone: z.string().nullable(),
  createdAt: z.string(),
  archivedAt: z.string().nullable(),
})

export const patientCoverageInputSchema = z.object({
  panelId: id,
  memberNo: text(100),
  status: z.enum(['pending', 'eligible', 'ineligible', 'expired']).default('pending'),
  validFrom: z.union([date, z.literal(''), z.null()]).optional().transform((value) => value || null),
  validTo: z.union([date, z.literal(''), z.null()]).optional().transform((value) => value || null),
  notes: optionalText(500),
  idempotencyKey: commandKey,
}).refine((value) => !value.validFrom || !value.validTo || value.validFrom <= value.validTo, {
  message: 'Coverage end must be on or after the start.',
  path: ['validTo'],
})
export type PatientCoverageInput = z.infer<typeof patientCoverageInputSchema>
export const patientCoverageSchema = z.object({
  id,
  panelId: id,
  panelName: z.string(),
  memberNo: z.string(),
  status: z.enum(['pending', 'eligible', 'ineligible', 'expired']),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  notes: z.string(),
  verifiedAt: z.string().nullable(),
})

export const patientDepositInputSchema = z.object({
  patientId: id,
  amount: moneySchema.refine((value) => Number(value) > 0, 'Amount must be positive.'),
  method: paymentMethodSchema.exclude(['panel', 'waiver']),
  reference: z.string().trim().max(120).default(''),
  idempotencyKey: commandKey,
})
export type PatientDepositInput = z.infer<typeof patientDepositInputSchema>
export const patientDepositCloseSchema = z.object({
  status: z.enum(['applied', 'refunded']),
  invoiceId: optionalId,
  reason: text(300),
  idempotencyKey: commandKey,
}).refine((value) => value.status !== 'applied' || !!value.invoiceId, {
  message: 'Choose the invoice receiving this deposit.',
  path: ['invoiceId'],
})
export const patientDepositSchema = z.object({
  id,
  patientId: id,
  amount: z.string(),
  currency: z.string(),
  method: paymentMethodSchema,
  reference: z.string().nullable(),
  status: z.enum(['active', 'applied', 'refunded']),
  receivedAt: z.string(),
  appliedInvoiceId: id.nullable(),
  closedAt: z.string().nullable(),
})

export const reminderInputSchema = z.object({
  patientId: id,
  appointmentId: optionalId,
  contactId: optionalId,
  channel: z.enum(['sms', 'whatsapp']),
  destination: text(40),
  template: text(500),
  scheduledFor: z.iso.datetime(),
  idempotencyKey: commandKey,
})
export type ReminderInput = z.infer<typeof reminderInputSchema>
export const reminderUpdateSchema = z.object({
  status: z.enum(['sent', 'failed', 'cancelled']),
  failureReason: optionalText(300),
  idempotencyKey: commandKey,
})
export const reminderSchema = z.object({
  id,
  patientId: id,
  patientName: z.string(),
  channel: z.enum(['sms', 'whatsapp']),
  destinationMasked: z.string(),
  template: z.string(),
  status: z.enum(['queued', 'sent', 'failed', 'cancelled']),
  scheduledFor: z.string(),
  sentAt: z.string().nullable(),
  failureReason: z.string().nullable(),
})

export const handoverInputSchema = z.object({
  toUserId: optionalId,
  note: text(2000),
  idempotencyKey: commandKey,
})
export type HandoverInput = z.infer<typeof handoverInputSchema>
export const handoverUpdateSchema = z.object({
  status: z.enum(['acknowledged', 'closed']),
  idempotencyKey: commandKey,
})
export const handoverSchema = z.object({
  id,
  fromUserId: id,
  fromUserName: z.string(),
  toUserId: id.nullable(),
  toUserName: z.string().nullable(),
  status: z.enum(['open', 'acknowledged', 'closed']),
  note: z.string(),
  createdAt: z.string(),
  acknowledgedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
})

export const receptionTillCloseInputSchema = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  opening: moneySchema,
  counted: moneySchema,
  note: optionalText(500),
  idempotencyKey: commandKey,
}).refine((value) => value.startsAt < value.endsAt, { message: 'Shift end must follow start.' })
export type ReceptionTillCloseInput = z.infer<typeof receptionTillCloseInputSchema>

export const receptionTillCloseSchema = z.object({
  id,
  userId: id,
  userName: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  opening: z.string(),
  expected: z.string(),
  counted: z.string(),
  difference: z.string(),
  note: z.string(),
  approvedAt: z.string().nullable(),
})

export const receptionAlertSchema = z.object({
  key: z.string(),
  severity: z.enum(['info', 'warning', 'urgent']),
  count: z.number().int().nonnegative(),
})

export const receptionWorkspaceSchema = z.object({
  stats: z.object({
    availableBeds: z.number().int(),
    pendingCareRequests: z.number().int(),
    waitingAppointments: z.number().int(),
    queuedReminders: z.number().int(),
    openHandovers: z.number().int(),
  }),
  beds: z.array(receptionBedSchema),
  careRequests: z.array(receptionCareRequestSchema),
  waitlist: z.array(waitlistEntrySchema),
  reminders: z.array(reminderSchema),
  handovers: z.array(handoverSchema),
  tillCloses: z.array(receptionTillCloseSchema),
  alerts: z.array(receptionAlertSchema),
  departments: z.array(z.object({ id, code: z.string(), name: z.string(), type: z.string() })),
  panels: z.array(z.object({ id, code: z.string(), name: z.string() })),
  staff: z.array(z.object({ id, name: z.string() })),
})
export type ReceptionWorkspace = z.infer<typeof receptionWorkspaceSchema>

export const patientReceptionProfileSchema = z.object({
  documents: z.array(patientDocumentSchema),
  contacts: z.array(patientContactSchema),
  coverages: z.array(patientCoverageSchema),
  deposits: z.array(patientDepositSchema),
})
export type PatientReceptionProfile = z.infer<typeof patientReceptionProfileSchema>

export const rescheduleAppointmentSchema = z.object({
  departmentId: id,
  practitionerId: optionalId,
  scheduledOn: date,
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  durationMinutes: z.number().int().min(5).max(240).optional(),
  reason: text(300),
  appointmentReason: z.string().trim().max(300).default(''),
  idempotencyKey: commandKey,
}).refine(
  (value) => !!value.scheduledAt === !!value.durationMinutes && (!value.scheduledAt || !!value.practitionerId),
  'Timed appointments require a provider, start and duration.',
)
export type RescheduleAppointment = z.infer<typeof rescheduleAppointmentSchema>

export const receptionAuditQuerySchema = z.object({
  from: date.optional(),
  to: date.optional(),
  entity: z.string().trim().max(80).optional(),
})
