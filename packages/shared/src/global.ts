import { z } from 'zod'

/**
 * Shared request shapes reused across entities.
 *
 * Activate/deactivate is the same one-field request for every master-data entity
 * (department, room, practitioner, service, drug), so it lives here once rather
 * than being re-declared per module. If an entity ever needs setActive to carry
 * more — a deactivation reason, say — it breaks back out into its own schema then.
 */
export const setActiveRequestSchema = z.object({
  isActive: z.boolean(),
})
export type SetActiveRequest = z.infer<typeof setActiveRequestSchema>
