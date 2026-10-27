import { z } from 'zod'

// Operational settings only; no patient records or clinical eligibility rules.
export const crmSettingsSchema = z
  .object({
    workspaceName: z.string().trim().min(1).max(80),
    serviceAreas: z
      .array(z.string().trim().min(1).max(80))
      .max(20)
      .refine(
        (items) =>
          new Set(items.map((item) => item.toLocaleLowerCase())).size ===
          items.length,
        'Remove duplicate service areas',
      ),
    escalationContact: z.string().trim().max(120),
    safeContactInstructions: z.string().trim().max(500),
    interactionRetentionDays: z.number().int().min(30).max(3650).default(365),
  })
  .strict()
export type CrmSettings = z.infer<typeof crmSettingsSchema>

export const CRM_DEFAULT_SETTINGS: CrmSettings = {
  workspaceName: 'CRM',
  serviceAreas: [],
  escalationContact: '',
  safeContactInstructions: '',
  interactionRetentionDays: 365,
}

export const crmSettingsResponseSchema = crmSettingsSchema.extend({
  version: z.number().int().nonnegative(),
})
export type CrmSettingsResponse = z.infer<typeof crmSettingsResponseSchema>
export const updateCrmSettingsSchema = crmSettingsSchema
  .extend({
    expectedVersion: z.number().int().nonnegative(),
    interactionRetentionDays: z.number().int().min(30).max(3650).optional(),
  })
  .strict()
export type UpdateCrmSettings = z.infer<typeof updateCrmSettingsSchema>

export const crmWorkspaceSchema = z.object({
  facilityName: z.string(),
  timezone: z.string(),
  canConfigure: z.boolean(),
  settings: crmSettingsResponseSchema,
})
export type CrmWorkspace = z.infer<typeof crmWorkspaceSchema>
