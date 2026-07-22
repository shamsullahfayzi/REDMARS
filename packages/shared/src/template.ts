import { z } from 'zod'
import { FREQUENCY_VALUES, ROUTE_VALUES } from './prescriptionCodes.js'

/**
 * Tasks 4.4 and 4.12 — the saved phrases and regimens a consultation is typed from.
 *
 * 4.4's done-when is "oliguria, frequency, nocturia in 2 seconds", and that sentence is
 * three templates, not one: a complaint template holds ONE phrase and the doctor stacks
 * them. A template per whole-sentence combination would need a template for every
 * combination, which is how a template list becomes unusable by week three.
 *
 * 4.12's is "Standard depression starter in one click", and that one IS a whole regimen —
 * three or four drugs with their doses, which are only useful together. The two types pull
 * in opposite directions on purpose, because the things they hold are different: a phrase
 * is a building block, a starting regimen is a decision.
 *
 * `Template.practitionerId` is nullable and the null means SHARED across the hospital. That
 * single column is the whole ownership model: a doctor sees the shared list plus their own,
 * never a colleague's private ones, and only an admin may add to the shared list
 * (`template.manage.shared`).
 */

/** Mirrors the `type` values named in the schema comment. */
export const TEMPLATE_TYPES = ['complaint', 'diagnosis', 'prescription', 'advice'] as const
export const templateTypeSchema = z.enum(TEMPLATE_TYPES)
export type TemplateType = z.infer<typeof templateTypeSchema>

/** What sits in `content` for a complaint template (task 4.4). */
export const complaintTemplateContentSchema = z.object({
  text: z.string().trim().min(1, 'A template needs some text.').max(500),
})
export type ComplaintTemplateContent = z.infer<typeof complaintTemplateContentSchema>

/**
 * One drug line in a prescription template (task 4.12).
 *
 * IT STORES A drugId AND NOT A NAME, which is the one place a template behaves differently
 * from the prescription it produces. A prescription snapshots `drugNameAtTime` because it
 * is a historical document — what was actually handed over in 2026 does not change when the
 * formulary is edited in 2028. A template is the opposite: a live pointer to the hospital's
 * current formulary, so a drug renamed or restrengthened should show its new name the next
 * time the template is used. Snapshotting here would quietly produce a "Standard depression
 * starter" that names a strength the pharmacy stopped stocking.
 *
 * Frequency and route are the same closed sets the prescription contract uses. A template
 * that could hold a value the prescription refuses would be a one-click way to produce a
 * sheet that cannot be saved.
 *
 * No allergy override and no acknowledgement, for the reason task 4.11 gives at greater
 * length: those are judgements about one patient in one room, and a template applies to
 * everybody. Blocks and warnings fire on the sheet the template fills in, every time.
 */
export const prescriptionTemplateItemSchema = z.object({
  drugId: z.uuid('Choose a drug.'),
  dose: z.string().trim().max(60).nullish().transform((v) => (v ? v : null)),
  frequency: z.enum(FREQUENCY_VALUES, { message: 'Choose how often.' }),
  duration: z.string().trim().min(1, 'For how long?').max(40),
  route: z.enum(ROUTE_VALUES, { message: 'Choose a route.' }),
  quantity: z
    .union([z.number().int().min(1).max(9999), z.literal(''), z.null()])
    .optional()
    .transform((v) => (typeof v === 'number' ? v : null)),
  instructions: z.string().trim().max(200).nullish().transform((v) => (v ? v : null)),
})
export type PrescriptionTemplateItem = z.infer<typeof prescriptionTemplateItemSchema>

export const prescriptionTemplateContentSchema = z.object({
  /**
   * At least one: an empty regimen is not a starting point for anything. Capped below the
   * prescription's own 30, because a template that long is somebody's entire drug cupboard
   * rather than a decision anyone will apply in one click.
   */
  items: z
    .array(prescriptionTemplateItemSchema)
    .min(1, 'A prescription template needs at least one drug.')
    .max(20, 'That is too many drugs for one template.'),
  /** The advice that goes with the regimen. Optional; often the point of saving it. */
  advice: z.string().trim().max(1000).nullish().transform((v) => (v ? v : null)),
})
export type PrescriptionTemplateContent = z.infer<typeof prescriptionTemplateContentSchema>

const templateName = z.string().trim().min(2, 'Give it a name you will recognise.').max(80)

/**
 * Shared templates are the hospital's, so saving one needs `template.manage.shared` — admin
 * only. Checked in the handler, because the guard holds one permission per route and this
 * is a second one that applies only sometimes.
 */
const shared = z.boolean().default(false)

/**
 * A DISCRIMINATED UNION ON `type`, rather than one object with a loose `content`.
 *
 * `content` is a Json column and the two types put genuinely unrelated things in it. The
 * union is what makes the compiler force a narrow before reading `content.text`, so a
 * screen cannot quietly render `undefined` for a shape it did not expect — and what makes
 * adding the diagnosis and advice types later a change the type checker walks you through
 * rather than one you have to remember every call site of.
 */
export const createTemplateRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('complaint'),
    name: templateName,
    content: complaintTemplateContentSchema,
    shared,
  }),
  z.object({
    type: z.literal('prescription'),
    name: templateName,
    content: prescriptionTemplateContentSchema,
    shared,
  }),
])
export type CreateTemplateRequest = z.infer<typeof createTemplateRequestSchema>

const templateBase = {
  id: z.uuid(),
  name: z.string(),
  /** True when it belongs to the hospital rather than to one practitioner. */
  isShared: z.boolean(),
  /** True when it is the caller's own — the only ones they may treat as theirs. */
  isMine: z.boolean(),
  createdAt: z.string(),
}

export const templateSchema = z.discriminatedUnion('type', [
  z.object({ ...templateBase, type: z.literal('complaint'), content: complaintTemplateContentSchema }),
  z.object({
    ...templateBase,
    type: z.literal('prescription'),
    content: prescriptionTemplateContentSchema,
  }),
])
export type Template = z.infer<typeof templateSchema>

/** Narrowed aliases, so a screen that only handles one kind can say so in its props. */
export type ComplaintTemplate = Extract<Template, { type: 'complaint' }>
export type PrescriptionTemplate = Extract<Template, { type: 'prescription' }>

/**
 * The guards a screen filters with.
 *
 * `/templates?type=x` already returns one kind, so these narrow rather than select — but a
 * component whose props say `ComplaintTemplate[]` cannot be handed a prescription template
 * by a future caller who got the query string wrong, and that is worth the two lines.
 */
export function isComplaintTemplate(template: Template): template is ComplaintTemplate {
  return template.type === 'complaint'
}

export function isPrescriptionTemplate(template: Template): template is PrescriptionTemplate {
  return template.type === 'prescription'
}

export const templateListQuerySchema = z.object({
  type: templateTypeSchema,
})
export type TemplateListQuery = z.infer<typeof templateListQuerySchema>

export const templateListResponseSchema = z.object({
  templates: z.array(templateSchema),
})
export type TemplateListResponse = z.infer<typeof templateListResponseSchema>
