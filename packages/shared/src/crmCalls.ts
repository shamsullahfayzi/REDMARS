import { z } from 'zod'
import {
  crmInteractionSchema,
  crmInteractionDetailSchema,
  CRM_INTERACTION_OUTCOMES,
} from './crmTimeline.js'
import { normalizeCrmPhone } from './crmContacts.js'
export const CRM_CALL_STATES = ['answered', 'missed', 'no_answer'] as const
export const CRM_CALL_ACTIONS = [
  'none',
  'callback',
  'provide_information',
  'escalate',
  'clinical_follow_up',
] as const
export const createCrmCallSchema = z
  .object({
    leadId: z.string().uuid().nullable(),
    contactId: z.string().uuid().nullable(),
    linkId: z.string().uuid().nullable(),
    purpose: z.enum(['enquiry', 'scheduling', 'follow_up']),
    direction: z.enum(['inbound', 'outbound']),
    state: z.enum(CRM_CALL_STATES),
    occurredAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }).nullable(),
    callerPhone: z
      .string()
      .trim()
      .max(40)
      .refine(
        (v) => /^[\d۰-۹٠-٩+\s().-]*$/.test(v),
        'Enter a valid phone number',
      )
      .transform(normalizeCrmPhone)
      .refine(
        (v) => v === '' || /^\+?\d{5,18}$/.test(v),
        'Enter a valid phone number',
      ),
    summary: z.string().trim().min(3).max(1000),
    outcome: z.enum(CRM_INTERACTION_OUTCOMES),
    nextAction: z.enum(CRM_CALL_ACTIONS),
    actionNote: z.string().trim().max(500),
    relatedCallId: z.string().uuid().nullable(),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .superRefine((v, c) => {
    const issue = (path: string, message: string) =>
      c.addIssue({ code: 'custom', path: [path], message })
    if (
      (v.linkId !== null) !== (v.purpose !== 'enquiry') ||
      (v.linkId && !v.contactId)
    )
      issue(
        'linkId',
        'Select an authorized relationship for patient discussions',
      )
    if (
      (v.state === 'missed' && v.direction !== 'inbound') ||
      (v.state === 'no_answer' && v.direction !== 'outbound')
    )
      issue('state', 'Call state must match direction')
    if (
      v.state === 'answered' &&
      (!v.endedAt ||
        Date.parse(v.endedAt) < Date.parse(v.occurredAt) ||
        v.outcome === 'no_response')
    )
      issue('endedAt', 'Answered calls require a valid end time and outcome')
    if (
      v.state !== 'answered' &&
      (v.endedAt !== null ||
        v.outcome !== 'no_response' ||
        v.nextAction === 'none')
    )
      issue(
        'nextAction',
        'Missed and unanswered calls need a next action and no-response outcome',
      )
    if (v.nextAction !== 'none' && v.actionNote.length < 3)
      issue('actionNote', 'Describe the next action')
    if (v.relatedCallId && v.direction !== 'outbound')
      issue('relatedCallId', 'A callback must be outbound')
  })
export const completeCrmCallSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    completionNote: z.string().trim().min(3).max(500),
  })
  .strict()
export const crmCallQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    state: z.enum(['all', ...CRM_CALL_STATES]).default('all'),
    direction: z.enum(['all', 'inbound', 'outbound']).default('all'),
    pending: z.enum(['all', 'pending', 'completed']).default('all'),
    q: z.string().trim().max(100).default(''),
  })
  .strict()
export const crmCallSchema = z.object({
  id: z.string().uuid(),
  interaction: crmInteractionSchema,
  state: z.enum(CRM_CALL_STATES),
  callerPhone: z.string(),
  endedAt: z.string().nullable(),
  nextAction: z.enum(CRM_CALL_ACTIONS),
  actionNote: z.string(),
  relatedCallId: z.string().uuid().nullable(),
  version: z.number().int(),
  completedAt: z.string().nullable(),
  completedByName: z.string().nullable(),
  completionNote: z.string(),
  canComplete: z.boolean(),
})
export const crmCallListSchema = z.object({
  items: z.array(crmCallSchema),
  total: z.number(),
  page: z.number(),
  canWrite: z.boolean(),
  canViewFollowUps: z.boolean(),
})
export const crmCallDetailSchema = z.object({
  call: crmCallSchema,
  history: crmInteractionDetailSchema.shape.revisions,
})
export type CreateCrmCall = z.infer<typeof createCrmCallSchema>
export type CrmCallQuery = z.infer<typeof crmCallQuerySchema>
export type CompleteCrmCall = z.infer<typeof completeCrmCallSchema>
export type CrmCall = z.infer<typeof crmCallSchema>
