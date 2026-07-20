import { z } from 'zod'

/**
 * Facility modules (task 2.12) — which optional modules a hospital has turned on.
 *
 * OPD is deliberately NOT here: the system IS OPD, so it is the core and can never
 * be switched off. Only the optional modules are toggleable, which is why the enum
 * mirrors Prisma's ModuleKey exactly and OPD appears in neither.
 *
 * This contract is the toggle only. Turning a module off RECORDS the intent; the
 * enforcement — a 403 on that module's endpoints and hiding it in the nav — is the
 * ModuleGuard (task 2.13). Nothing here blocks a request on its own.
 */

// Must stay 1:1 with the Prisma ModuleKey enum. A mismatch is a compile error the
// moment the service maps a row's `module` onto this type.
export const MODULE_KEYS = [
  'lab',
  'pharmacy',
  'ipd',
  'emergency',
  'radiology',
  'billing',
  'reports',
] as const

export const moduleKeySchema = z.enum(MODULE_KEYS)
export type ModuleKey = z.infer<typeof moduleKeySchema>

export const facilityModuleSummarySchema = z.object({
  module: moduleKeySchema,
  enabled: z.boolean(),
  // When it was last switched on; null while off. Set by the server, not the client.
  enabledAt: z.string().datetime().nullable(),
})
export type FacilityModuleSummary = z.infer<typeof facilityModuleSummarySchema>

export const facilityModuleListResponseSchema = z.object({
  // Always the full set of toggleable modules — a facility with no rows yet reads as
  // all-off, so the admin screen is always the same list of switches.
  modules: z.array(facilityModuleSummarySchema),
})
export type FacilityModuleListResponse = z.infer<typeof facilityModuleListResponseSchema>

export const updateFacilityModuleRequestSchema = z.object({
  enabled: z.boolean(),
})
export type UpdateFacilityModuleRequest = z.infer<typeof updateFacilityModuleRequestSchema>
