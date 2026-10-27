import { z } from 'zod'
export const CRM_INTERACTION_CHANNELS = [
  'call',
  'in_person',
  'sms',
  'whatsapp',
  'email',
  'other',
] as const
export const CRM_INTERACTION_DIRECTIONS = [
  'inbound',
  'outbound',
  'internal',
] as const
export const CRM_INTERACTION_OUTCOMES = [
  'information_given',
  'follow_up_needed',
  'no_response',
  'escalated',
  'other',
] as const
const content = z.object({
  summary: z.string().trim().min(3).max(1000),
  outcome: z.enum(CRM_INTERACTION_OUTCOMES),
})
export const createCrmInteractionSchema = content
  .extend({
    leadId: z.string().uuid().nullable(),
    contactId: z.string().uuid().nullable(),
    linkId: z.string().uuid().nullable(),
    purpose: z.enum(['enquiry', 'scheduling', 'follow_up']),
    channel: z.enum(CRM_INTERACTION_CHANNELS),
    direction: z.enum(CRM_INTERACTION_DIRECTIONS),
    occurredAt: z.string().datetime({ offset: true }),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .superRefine((v, c) => {
    if (!v.leadId && !v.contactId)
      c.addIssue({
        code: 'custom',
        message: 'Select a lead or contact',
        path: ['contactId'],
      })
    if (
      (v.linkId !== null) !== (v.purpose !== 'enquiry') ||
      (v.linkId && !v.contactId)
    )
      c.addIssue({
        code: 'custom',
        message: 'Patient purposes require an authorized contact relationship',
        path: ['linkId'],
      })
  })
export const correctCrmInteractionSchema = content
  .extend({
    expectedVersion: z.number().int().nonnegative(),
    reason: z.string().trim().min(3).max(300),
    voided: z.boolean(),
  })
  .strict()
export const crmTimelineQuerySchema = z
  .object({
    leadId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    channel: z.enum(['all', ...CRM_INTERACTION_CHANNELS]).default('all'),
    direction: z.enum(['all', ...CRM_INTERACTION_DIRECTIONS]).default('all'),
  })
  .strict()
  .refine(
    (v) => Boolean(v.leadId) !== Boolean(v.contactId),
    'Select exactly one timeline subject',
  )
export const crmInteractionSchema = z.object({
  id: z.string().uuid(),
  callId: z.string().uuid().nullable().default(null),
  leadId: z.string().uuid().nullable(),
  contactId: z.string().uuid().nullable(),
  linkId: z.string().uuid().nullable(),
  purpose: z.enum(['enquiry', 'scheduling', 'follow_up']),
  channel: z.enum(CRM_INTERACTION_CHANNELS),
  direction: z.enum(CRM_INTERACTION_DIRECTIONS),
  occurredAt: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  visibleUntil: z.string(),
  recordedBy: z.string(),
  actorName: z.string(),
  summary: z.string(),
  outcome: z.enum(CRM_INTERACTION_OUTCOMES),
  version: z.number().int(),
  voided: z.boolean(),
  canCorrect: z.boolean(),
  patient: z.object({ name: z.string(), mrn: z.string() }).nullable(),
})
export const crmTimelineSchema = z.object({
  items: z.array(crmInteractionSchema),
  total: z.number(),
  page: z.number(),
  canWrite: z.boolean(),
})
export const crmInteractionDetailSchema = z.object({
  interaction: crmInteractionSchema,
  revisions: z.array(
    z.object({
      version: z.number().int(),
      summary: z.string(),
      outcome: z.enum(CRM_INTERACTION_OUTCOMES),
      voided: z.boolean(),
      reason: z.string(),
      actorName: z.string(),
      createdAt: z.string(),
    }),
  ),
})
export type CreateCrmInteraction = z.infer<typeof createCrmInteractionSchema>
export type CorrectCrmInteraction = z.infer<typeof correctCrmInteractionSchema>
export type CrmTimelineQuery = z.infer<typeof crmTimelineQuerySchema>
export type CrmInteraction = z.infer<typeof crmInteractionSchema>
