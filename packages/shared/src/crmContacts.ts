import { z } from 'zod'

export const crmChannelSchema = z.enum(['call', 'sms', 'whatsapp', 'email'])
export const crmPurposeSchema = z.enum(['enquiry', 'scheduling', 'follow_up'])
export const crmAuthoritySchema = z.enum([
  'pending',
  'scheduling',
  'follow_up',
  'both',
  'revoked',
])
export const crmSourceSchema = z.enum(['verbal', 'written', 'legal_guardian'])
export const crmVersionSchema = z.number().int().nonnegative()
// Match formatting variants without guessing a country or treating a phone as identity.
export function normalizeCrmPhone(value: string): string {
  return value
    .replace(/[۰-۹٠-٩]/g, (c) =>
      String(c.charCodeAt(0) - (c >= '۰' ? 0x6f0 : 0x660)),
    )
    .replace(/[^\d+]/g, '')
    .replace(/^00/, '+')
}
const phone = z
  .string()
  .trim()
  .max(40)
  .transform(normalizeCrmPhone)
  .refine(
    (v) => v === '' || /^\+?\d{7,15}$/.test(v),
    'Use 7–15 digits, optionally starting with +',
  )
export const crmContactFieldsSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    phone,
    altPhone: phone,
    email: z.union([z.literal(''), z.string().trim().email().max(160)]),
    language: z.enum(['prs', 'ps', 'en', 'other']),
    preferredChannel: crmChannelSchema,
    safeInstructions: z.string().trim().max(500),
    doNotContact: z.boolean(),
    archived: z.boolean(),
  })
  .strict()
export const createCrmContactSchema = crmContactFieldsSchema
  .extend({ duplicateReviewed: z.boolean().default(false) })
  .strict()
export const updateCrmContactSchema = createCrmContactSchema
  .extend({ expectedVersion: crmVersionSchema })
  .strict()
export const crmContactSchema = crmContactFieldsSchema.extend({
  id: z.string().uuid(),
  version: crmVersionSchema,
})
export const crmContactListSchema = z.object({
  items: z.array(crmContactSchema),
  total: z.number(),
  page: z.number(),
})
export const crmContactQuerySchema = z
  .object({
    q: z.string().trim().max(120).default(''),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    archived: z.enum(['true', 'false']).default('false'),
  })
  .strict()
export const crmRelationshipFieldsSchema = z
  .object({
    relationship: z.enum([
      'self',
      'parent',
      'spouse',
      'sibling',
      'child',
      'guardian',
      'other',
    ]),
    authority: crmAuthoritySchema,
    source: crmSourceSchema,
    authorityConfirmed: z.boolean(),
    expectedVersion: crmVersionSchema,
  })
  .strict()
  .refine(
    (v) => ['pending', 'revoked'].includes(v.authority) || v.authorityConfirmed,
    'Confirm the patient or legal representative authorized this scope',
  )
export const createCrmRelationshipSchema = z
  .object({
    mrn: z.string().trim().min(1).max(80),
    patientName: z.string().trim().min(2).max(160),
    relationship: z.enum([
      'self',
      'parent',
      'spouse',
      'sibling',
      'child',
      'guardian',
      'other',
    ]),
    expectedVersion: crmVersionSchema,
  })
  .strict()
export const recordCrmConsentSchema = z
  .object({
    linkId: z.string().uuid().nullable(),
    channel: crmChannelSchema,
    purpose: crmPurposeSchema,
    status: z.enum(['granted', 'withdrawn']),
    source: crmSourceSchema,
    expectedVersion: crmVersionSchema,
  })
  .strict()
  .refine(
    (v) => (v.purpose === 'enquiry') === (v.linkId === null),
    'Patient communication requires a patient relationship',
  )
export const verifyCrmCallerSchema = z
  .object({
    method: z.enum(['identity_document', 'approved_questions']),
    identityMatched: z.boolean(),
    authorityMatched: z.boolean(),
    expectedVersion: crmVersionSchema,
  })
  .strict()
export const crmConsentSchema = z.object({
  id: z.string().uuid(),
  linkId: z.string().uuid().nullable(),
  channel: crmChannelSchema,
  purpose: crmPurposeSchema,
  status: z.enum(['granted', 'withdrawn']),
  source: crmSourceSchema,
  recordedBy: z.string(),
  createdAt: z.string(),
})
export const crmContactDetailSchema = z.object({
  contact: crmContactSchema,
  canAuthorize: z.boolean(),
  links: z.array(
    z.object({
      id: z.string().uuid(),
      relationship: z.string(),
      authority: crmAuthoritySchema,
      source: crmSourceSchema.nullable(),
      patient: z.object({ name: z.string(), mrn: z.string() }).nullable(),
      verifiedUntil: z.string().nullable(),
      patientAvailable: z.boolean(),
    }),
  ),
  consents: z.array(crmConsentSchema),
  eligibility: z.array(
    z.object({
      linkId: z.string().uuid().nullable(),
      channel: crmChannelSchema,
      purpose: crmPurposeSchema,
      allowed: z.boolean(),
      reason: z.enum([
        'allowed',
        'archived',
        'do_not_contact',
        'no_destination',
        'no_consent',
        'no_authority',
        'verify_caller',
        'patient_unavailable',
      ]),
    }),
  ),
})
export type CrmContact = z.infer<typeof crmContactSchema>
export type CrmContactDetail = z.infer<typeof crmContactDetailSchema>
export type CreateCrmContact = z.infer<typeof createCrmContactSchema>
export type UpdateCrmContact = z.infer<typeof updateCrmContactSchema>
export type CreateCrmRelationship = z.infer<typeof createCrmRelationshipSchema>
export type UpdateCrmRelationship = z.infer<typeof crmRelationshipFieldsSchema>
export type RecordCrmConsent = z.infer<typeof recordCrmConsentSchema>
export type VerifyCrmCaller = z.infer<typeof verifyCrmCallerSchema>
