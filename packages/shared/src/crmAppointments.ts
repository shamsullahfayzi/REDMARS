import { z } from 'zod'
import { appointmentStatusSchema } from './appointment.js'
export const crmAppointmentQuerySchema = z
  .object({
    linkId: z.uuid(),
    date: z.iso.date(),
  })
  .strict()
export const crmAvailabilityQuerySchema = z
  .object({
    practitionerId: z.uuid(),
    date: z.iso.date(),
  })
  .strict()
export const createCrmAppointmentSchema = z
  .object({
    linkId: z.uuid(),
    leadId: z.uuid().nullable(),
    departmentId: z.uuid(),
    practitionerId: z.uuid(),
    scheduledAt: z.iso.datetime({ offset: true }),
    durationMinutes: z.number().int().min(5).max(240),
    idempotencyKey: z.uuid(),
  })
  .strict()
export const cancelCrmAppointmentSchema = z
  .object({
    linkId: z.uuid(),
    idempotencyKey: z.uuid(),
  })
  .strict()
export const crmAppointmentSchema = z.object({
  id: z.uuid(),
  status: appointmentStatusSchema,
  scheduledAt: z.string(),
  endsAt: z.string().nullable(),
  departmentName: z.string(),
  practitionerName: z.string().nullable(),
  fromCrm: z.boolean(),
})
export const crmAppointmentListSchema = z.object({
  items: z.array(crmAppointmentSchema),
  visibleUntil: z.string().nullable(),
})
export const crmAppointmentOptionsSchema = z.object({
  timezone: z.string(),
  links: z.array(
    z.object({
      id: z.uuid(),
      contactId: z.uuid(),
      contactName: z.string(),
      patientName: z.string(),
      mrn: z.string(),
      visibleUntil: z.string().nullable(),
    }),
  ),
  departments: z.array(z.object({ id: z.uuid(), name: z.string() })),
  practitioners: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      departmentIds: z.array(z.uuid()),
    }),
  ),
  canWrite: z.boolean(),
})
export const crmAvailabilitySchema = z.object({
  busy: z.array(
    z.object({ scheduledAt: z.string(), endsAt: z.string().nullable() }),
  ),
  dateOnlyCount: z.number(),
  timezone: z.string(),
})
