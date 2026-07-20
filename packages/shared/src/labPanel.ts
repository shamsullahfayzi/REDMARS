import { z } from 'zod'
import { optionalPriceSchema } from './labTest.js'

/**
 * Lab panel contract (task 2.7) — an ordering convenience that expands to a set of
 * lab tests. "LFT" is one panel that stands for five liver tests; ordering the
 * panel orders them all. This is the many-to-many (LabPanelTest), and expanding a
 * panel to its member tests is the done-when for the task.
 *
 * `testIds` on the summary is the current membership — the same shape as a
 * practitioner's departmentIds. A panel may carry its own optional price (billed
 * as a bundle) or leave it blank and let the member tests price individually.
 */

export const labPanelSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  price: z.string().nullable(),
  isActive: z.boolean(),
  testIds: z.array(z.string()),
})
export type LabPanelSummary = z.infer<typeof labPanelSummarySchema>

export const labPanelListResponseSchema = z.object({
  panels: z.array(labPanelSummarySchema),
})
export type LabPanelListResponse = z.infer<typeof labPanelListResponseSchema>

export const createLabPanelRequestSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(30),
  name: z.string().trim().min(2, 'Panel name is required').max(120),
  price: optionalPriceSchema,
  // May be empty at creation — an admin can add member tests afterwards.
  testIds: z.array(z.uuid()).default([]),
})
export type CreateLabPanelRequest = z.infer<typeof createLabPanelRequestSchema>

// Editing a panel: its name and price. The code is fixed at creation; membership
// is changed through its own replace-the-set route below.
export const updateLabPanelRequestSchema = z.object({
  name: z.string().trim().min(2, 'Panel name is required').max(120),
  price: optionalPriceSchema,
})
export type UpdateLabPanelRequest = z.infer<typeof updateLabPanelRequestSchema>

// Replaces a panel's whole test set (the edit-membership action). Sending
// [alt, ast, alp, bili, ggt] makes exactly those five the panel; sending [] empties
// it. A replace, not a merge — hence PUT, not PATCH.
export const setLabPanelTestsRequestSchema = z.object({
  testIds: z.array(z.uuid()),
})
export type SetLabPanelTestsRequest = z.infer<typeof setLabPanelTestsRequestSchema>
