import { z } from 'zod'
import { createPatientRequestSchema } from './patient.js'
import { VISIT_CREATE_TYPES } from './visit.js'

/**
 * Task 3.6 — the reception desk. One screen, one save.
 *
 * A patient arrives, is registered (or found), is put in a queue, is billed, and pays.
 * At Farhat that is one conversation at one window, so it is one request: patient +
 * visit + invoice + payment, committed together or not at all. Four screens would mean
 * four chances to be interrupted, and the states in between are all wrong — a visit with
 * no bill, a bill with no visit, cash in the drawer the system has never heard of.
 *
 * The prices are NOT in this contract, and that is the point. The desk sends a serviceId
 * and a quantity; the server reads the fee from the catalog. A price that travelled from
 * the browser is a price anyone with devtools can set to 1.
 */

/** Mirrors the Prisma `PaymentMethod` enum. */
export const PAYMENT_METHODS = [
  'cash',
  'card',
  'bank_transfer',
  'mobile_money',
  'panel',
  'waiver',
] as const
export const paymentMethodSchema = z.enum(PAYMENT_METHODS)
export type PaymentMethod = z.infer<typeof paymentMethodSchema>

/** Mirrors the Prisma `InvoiceStatus` enum. */
export const INVOICE_STATUSES = [
  'draft',
  'issued',
  'partially_paid',
  'paid',
  'cancelled',
] as const
export const invoiceStatusSchema = z.enum(INVOICE_STATUSES)
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>

/**
 * Money crosses the wire as a decimal STRING, never a number — the same rule the service
 * catalog already follows. Decimal(12,2) in Postgres is exact; a JavaScript number is a
 * float and 0.1 + 0.2 is not 0.3. Rounding a consultation fee is a rounding error in
 * somebody's actual money.
 */
export const moneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Enter a valid amount')

/**
 * R10 — the receptionist's discount ceiling, as a percentage of the subtotal.
 *
 * Lives here rather than in the API alone so the form can grey out the field at the same
 * number the server refuses at, and the desk is never invited to type something that
 * will be rejected. The server is still the one that enforces it.
 */
export const DISCOUNT_CEILING_PCT = 10

export const checkInItemSchema = z.object({
  serviceId: z.uuid(),
  quantity: z.number().int().min(1).max(99).default(1),
})
export type CheckInItem = z.infer<typeof checkInItemSchema>

const optionalText = (max: number) => z.string().trim().max(max).nullish()

const optionalId = z
  .union([z.uuid(), z.literal('')])
  .nullish()
  .transform((v) => (v ? v : null))

/** The visit half. Same fields as task 3.5, minus the patient — this request creates it. */
export const checkInVisitSchema = z.object({
  type: z.enum(VISIT_CREATE_TYPES),
  departmentId: z.uuid('Choose a department.'),
  practitionerId: optionalId,
  chiefComplaint: optionalText(500),
  referredBy: optionalText(120),
  referralSource: optionalText(120),
})

export const checkInRequestSchema = z
  .object({
    /**
     * Exactly one of these two. `patientId` is the returning patient the desk found by
     * searching; `patient` is the walk-in nobody has seen before, in the same shape task
     * 3.1 already validates. Reusing that schema means the two doors cannot drift: a
     * field that becomes required at registration becomes required here on the same day.
     */
    patientId: z.uuid().nullish(),
    patient: createPatientRequestSchema.nullish(),

    visit: checkInVisitSchema,

    // At least one line. A bill that lists nothing is not a bill, and "what was this
    // patient charged for" is the first question anyone asks of a till.
    items: z.array(checkInItemSchema).min(1, 'Add at least one service.'),

    discount: moneySchema.default('0'),
    discountReason: optionalText(200),

    // Farhat's desk settles in full at the window, so the method is all the server needs
    // — it computes the amount from the catalog itself. Sending the amount would invite
    // a bill and a payment that disagree.
    paymentMethod: paymentMethodSchema,
    paymentReference: optionalText(60),

    acknowledgeDuplicate: z.boolean().default(false),
    acknowledgeOpenVisit: z.boolean().default(false),
  })
  .refine((v) => (v.patientId == null) !== (v.patient == null), {
    message: 'Give either an existing patient or a new one, not both.',
    path: ['patientId'],
  })
  // Checked here as well as on the server: a discount with no reason is how cash leaves
  // a till, and the form should say so before the request is made.
  .refine((v) => v.discount === '0' || Number(v.discount) === 0 || Boolean(v.discountReason), {
    message: 'Give a reason for the discount.',
    path: ['discountReason'],
  })
export type CheckInRequest = z.infer<typeof checkInRequestSchema>

// ---------------------------------------------------------------------------------
// What comes back: the receipt
// ---------------------------------------------------------------------------------

export const invoiceLineSchema = z.object({
  id: z.uuid(),
  description: z.string(),
  quantity: z.number().int(),
  unitPrice: z.string(),
  total: z.string(),
})
export type InvoiceLine = z.infer<typeof invoiceLineSchema>

export const invoiceSummarySchema = z.object({
  id: z.uuid(),
  invoiceNo: z.string(),
  status: invoiceStatusSchema,
  subtotal: z.string(),
  discount: z.string(),
  discountReason: z.string().nullable(),
  total: z.string(),
  paidAmount: z.string(),
  currency: z.string(),
  items: z.array(invoiceLineSchema),
  paymentMethod: paymentMethodSchema.nullable(),
  paidAt: z.string().nullable(),
})
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>

/**
 * The three blocks a printed slip carries besides the charges — the hospital it is
 * printed on, who it is for, and (when there is one) which visit it belongs to. Named
 * exports rather than anonymous shapes because the invoice reprint (task 6.1) prints the
 * SAME receipt from a stored invoice, and reusing these means the check-in slip and the
 * reprint cannot drift a field apart.
 */
export const receiptFacilitySchema = z.object({
  // The hospital the invoice is printed on. Name is always present; the local names,
  // address, phone and email are filled in as far as the facility record has them, and
  // the printed invoice simply omits whichever lines are blank.
  name: z.string(),
  nameLocalPrs: z.string().nullable(),
  nameLocalPs: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
})
export type ReceiptFacility = z.infer<typeof receiptFacilitySchema>

export const receiptPatientSchema = z.object({
  id: z.uuid(),
  mrn: z.string(),
  name: z.string(),
  gender: z.string(),
  // Age in whole years for the bill's "Age/Sex" line, aged forward from the estimate —
  // null when neither a birth date nor an estimate was ever recorded.
  ageYears: z.number().int().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  isNew: z.boolean(),
})
export type ReceiptPatient = z.infer<typeof receiptPatientSchema>

export const receiptVisitSchema = z.object({
  id: z.uuid(),
  visitNo: z.string(),
  type: z.string(),
  status: z.string(),
  departmentName: z.string(),
  practitionerName: z.string().nullable(),
  startedAt: z.string(),
})
export type ReceiptVisit = z.infer<typeof receiptVisitSchema>

/**
 * Everything the printed slip needs, from one save. The patient and visit come back in
 * full because the receipt carries them: an MRN the patient keeps, and a visit number
 * the queue is called from.
 */
export const checkInResponseSchema = z.object({
  facility: receiptFacilitySchema,
  patient: receiptPatientSchema,
  visit: receiptVisitSchema,
  invoice: invoiceSummarySchema,
})
export type CheckInResponse = z.infer<typeof checkInResponseSchema>
