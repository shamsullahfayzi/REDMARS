import { z } from 'zod'

/**
 * Task 4.4 — the saved phrases that make a consultation fast.
 *
 * The done-when is "oliguria, frequency, nocturia in 2 seconds", and that sentence is
 * three templates, not one: a complaint template holds ONE phrase, and the doctor stacks
 * them. A template per whole-sentence combination would need a template for every
 * combination, which is how a template list becomes unusable by week three.
 *
 * `Template.practitionerId` is nullable and the null means SHARED across the hospital.
 * That single column is the whole ownership model: a doctor sees the shared list plus
 * their own, never a colleague's private ones, and only an admin may add to the shared
 * list (`template.manage.shared`).
 */

/** Mirrors the `type` values named in the schema comment. */
export const TEMPLATE_TYPES = ['complaint', 'diagnosis', 'prescription', 'advice'] as const
export const templateTypeSchema = z.enum(TEMPLATE_TYPES)
export type TemplateType = z.infer<typeof templateTypeSchema>

/**
 * What sits in `content` for a complaint template. Json in the database because a
 * prescription template (task 4.12) will hold a drug list and nothing like this —
 * one column, one shape per type, validated per type on the way in.
 */
export const complaintTemplateContentSchema = z.object({
  text: z.string().trim().min(1, 'A template needs some text.').max(500),
})
export type ComplaintTemplateContent = z.infer<typeof complaintTemplateContentSchema>

export const createTemplateRequestSchema = z.object({
  // Only complaint templates exist yet. Task 4.12 adds prescription ones and will widen
  // this with its OWN content shape, rather than declaring a type union now and
  // pretending one shape fits both.
  type: z.literal('complaint'),
  name: z.string().trim().min(2, 'Give it a name you will recognise.').max(80),
  content: complaintTemplateContentSchema,
  /**
   * Shared templates are the hospital's, so saving one needs `template.manage.shared` —
   * admin only. Checked in the handler, because the guard holds one permission per route
   * and this is a second one that applies only sometimes.
   */
  shared: z.boolean().default(false),
})
export type CreateTemplateRequest = z.infer<typeof createTemplateRequestSchema>

export const templateSchema = z.object({
  id: z.uuid(),
  type: templateTypeSchema,
  name: z.string(),
  content: complaintTemplateContentSchema,
  /** True when it belongs to the hospital rather than to one practitioner. */
  isShared: z.boolean(),
  /** True when it is the caller's own — the only ones they may treat as theirs. */
  isMine: z.boolean(),
  createdAt: z.string(),
})
export type Template = z.infer<typeof templateSchema>

export const templateListQuerySchema = z.object({
  type: templateTypeSchema,
})
export type TemplateListQuery = z.infer<typeof templateListQuerySchema>

export const templateListResponseSchema = z.object({
  templates: z.array(templateSchema),
})
export type TemplateListResponse = z.infer<typeof templateListResponseSchema>
