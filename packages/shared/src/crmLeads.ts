import { z } from 'zod'
export const CRM_LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'on_hold',
  'closed',
] as const
export const CRM_LEAD_SOURCES = [
  'phone',
  'walk_in',
  'referral',
  'website',
  'facebook',
  'whatsapp',
  'email',
  'other',
] as const
export const CRM_LEAD_OUTCOMES = [
  'resolved',
  'not_interested',
  'unreachable',
  'duplicate',
  'other',
] as const
export const crmLeadStatusSchema = z.enum(CRM_LEAD_STATUSES)
export type CrmLeadStatus = z.infer<typeof crmLeadStatusSchema>
export const CRM_LEAD_TRANSITIONS: Record<
  CrmLeadStatus,
  readonly CrmLeadStatus[]
> = {
  new: ['contacted', 'on_hold', 'closed'],
  contacted: ['qualified', 'on_hold', 'closed'],
  qualified: ['contacted', 'on_hold', 'closed'],
  on_hold: ['contacted', 'qualified', 'closed'],
  closed: ['new'],
}
export const crmLeadFieldsSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    contactId: z.string().uuid().nullable(),
    ownerId: z.string().uuid().nullable(),
    serviceInterest: z.string().trim().max(100),
    needsConfirmed: z.boolean(),
    serviceMatched: z.boolean(),
    qualificationNotes: z.string().trim().max(500),
  })
  .strict()
export const createCrmLeadSchema = crmLeadFieldsSchema
  .extend({
    source: z.enum(CRM_LEAD_SOURCES),
    sourceDetail: z.string().trim().max(120),
    duplicateReviewed: z.boolean().default(false),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
export const updateCrmLeadSchema = crmLeadFieldsSchema
  .extend({
    expectedVersion: z.number().int().nonnegative(),
    status: crmLeadStatusSchema,
    closedReason: z.enum(CRM_LEAD_OUTCOMES).nullable(),
    changeReason: z.string().trim().max(300),
    duplicateReviewed: z.boolean().default(false),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.status === 'qualified' &&
      (!v.contactId ||
        !v.ownerId ||
        !v.serviceInterest ||
        !v.needsConfirmed ||
        !v.serviceMatched)
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Qualification needs a contact, owner, service interest and both confirmations',
        path: ['status'],
      })
    if ((v.status === 'closed') !== (v.closedReason !== null))
      ctx.addIssue({
        code: 'custom',
        message: 'Only closed leads require a closure reason',
        path: ['closedReason'],
      })
  })
export const claimCrmLeadSchema = z
  .object({ expectedVersion: z.number().int().nonnegative() })
  .strict()
export const crmLeadQuerySchema = z
  .object({
    q: z.string().trim().max(160).default(''),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    status: z.enum(['all', ...CRM_LEAD_STATUSES]).default('all'),
    source: z.enum(['all', ...CRM_LEAD_SOURCES]).default('all'),
    owner: z
      .union([z.enum(['all', 'mine', 'unassigned']), z.string().uuid()])
      .default('all'),
  })
  .strict()
export const crmLeadOwnerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  active: z.boolean(),
})
export const crmLeadSchema = crmLeadFieldsSchema.extend({
  id: z.string().uuid(),
  version: z.number().int(),
  status: crmLeadStatusSchema,
  source: z.enum(CRM_LEAD_SOURCES),
  sourceDetail: z.string(),
  closedReason: z.enum(CRM_LEAD_OUTCOMES).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  owner: crmLeadOwnerSchema.nullable(),
  contact: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      archived: z.boolean(),
      doNotContact: z.boolean(),
    })
    .nullable(),
  canEdit: z.boolean(),
  canClaim: z.boolean(),
  canAssign: z.boolean(),
})
export const crmLeadDetailSchema = z.object({
  lead: crmLeadSchema,
  history: z.array(
    z.object({
      id: z.string().uuid(),
      fromStatus: crmLeadStatusSchema.nullable(),
      toStatus: crmLeadStatusSchema,
      reason: z.string(),
      changedBy: z.string(),
      actorName: z.string(),
      createdAt: z.string(),
    }),
  ),
})
export const crmLeadListSchema = z.object({
  items: z.array(crmLeadSchema),
  total: z.number(),
  page: z.number(),
})
export const crmLeadOptionsSchema = z.object({
  owners: z.array(crmLeadOwnerSchema),
  canAssign: z.boolean(),
  currentUserId: z.string().uuid(),
  serviceAreas: z.array(z.string()),
})
export type CreateCrmLead = z.infer<typeof createCrmLeadSchema>
export type UpdateCrmLead = z.infer<typeof updateCrmLeadSchema>
export type CrmLead = z.infer<typeof crmLeadSchema>
export type CrmLeadDetail = z.infer<typeof crmLeadDetailSchema>
export type CrmLeadOptions = z.infer<typeof crmLeadOptionsSchema>
export type CrmLeadQuery = z.infer<typeof crmLeadQuerySchema>
