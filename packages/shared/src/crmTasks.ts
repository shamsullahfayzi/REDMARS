import { z } from 'zod'
import { crmInteractionSchema } from './crmTimeline.js'
export const CRM_TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export const CRM_TASK_STATUSES = [
  'open',
  'in_progress',
  'completed',
  'cancelled',
] as const
const fields = z.object({
  title: z.string().trim().min(3).max(120),
  notes: z.string().trim().max(1000),
  ownerId: z.string().uuid().nullable(),
  dueAt: z.string().datetime({ offset: true }),
  reminderAt: z.string().datetime({ offset: true }).nullable(),
  priority: z.enum(CRM_TASK_PRIORITIES),
})
const times = (v: { dueAt: string; reminderAt: string | null }) =>
  !v.reminderAt || Date.parse(v.reminderAt) <= Date.parse(v.dueAt)
export const createCrmTaskSchema = fields
  .extend({
    interactionId: z.string().uuid(),
    prescriptionId: z.string().uuid().nullable(),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .refine(times, 'Reminder must be at or before the due time')
export const updateCrmTaskSchema = fields
  .extend({
    expectedVersion: z.number().int().nonnegative(),
    status: z.enum(CRM_TASK_STATUSES),
    outcome: z.string().trim().max(500),
    reason: z.string().trim().min(3).max(300),
  })
  .strict()
  .refine(times, 'Reminder must be at or before the due time')
  .refine(
    (v) =>
      ['completed', 'cancelled'].includes(v.status)
        ? v.outcome.length >= 3
        : v.outcome === '',
    'Closed tasks require an outcome; open tasks have no closure outcome',
  )
export const crmTaskVersionSchema = z
  .object({ expectedVersion: z.number().int().nonnegative() })
  .strict()
export const escalateCrmTaskSchema = crmTaskVersionSchema
  .extend({ reason: z.string().trim().min(3).max(300) })
  .strict()
export const crmTaskQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    q: z.string().trim().max(100).default(''),
    owner: z.enum(['mine', 'all', 'unassigned']).default('mine'),
    status: z.enum(['active', 'all', ...CRM_TASK_STATUSES]).default('active'),
    queue: z.enum(['all', 'overdue', 'reminders', 'escalated']).default('all'),
    priority: z.enum(['all', ...CRM_TASK_PRIORITIES]).default('all'),
  })
  .strict()
export const crmTaskSchema = fields.extend({
  id: z.string().uuid(),
  interaction: crmInteractionSchema,
  version: z.number().int(),
  status: z.enum(CRM_TASK_STATUSES),
  outcome: z.string(),
  ownerName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().nullable(),
  reminderAcknowledgedAt: z.string().nullable(),
  escalations: z.number().int(),
  overdue: z.boolean(),
  reminderDue: z.boolean(),
  canEdit: z.boolean(),
  canClaim: z.boolean(),
  canAcknowledge: z.boolean(),
  prescriptionId: z.string().uuid().nullable(),
  followUpDate: z.string().nullable(),
})
export const crmTaskListSchema = z.object({
  items: z.array(crmTaskSchema),
  total: z.number(),
  page: z.number(),
  canWrite: z.boolean(),
  canAssign: z.boolean(),
})
export const crmTaskDetailSchema = z.object({
  task: crmTaskSchema,
  history: z.array(
    z.object({
      version: z.number(),
      event: z.string(),
      title: z.string(),
      notes: z.string(),
      ownerName: z.string().nullable(),
      dueAt: z.string(),
      reminderAt: z.string().nullable(),
      priority: z.string(),
      status: z.string(),
      outcome: z.string(),
      reason: z.string(),
      actorName: z.string(),
      createdAt: z.string(),
    }),
  ),
})
export const crmTaskOptionsSchema = z.object({
  owners: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  currentUserId: z.string().uuid(),
  canAssign: z.boolean(),
})
export const crmTaskFollowUpsSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), followUpDate: z.string() })),
})
export type CreateCrmTask = z.infer<typeof createCrmTaskSchema>
export type UpdateCrmTask = z.infer<typeof updateCrmTaskSchema>
export type CrmTaskQuery = z.infer<typeof crmTaskQuerySchema>
export type CrmTask = z.infer<typeof crmTaskSchema>
