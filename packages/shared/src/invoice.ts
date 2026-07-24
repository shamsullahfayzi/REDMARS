import { z } from 'zod'
import {
  invoiceStatusSchema,
  invoiceSummarySchema,
  moneySchema,
  paymentMethodSchema,
  receiptFacilitySchema,
  receiptPatientSchema,
  receiptVisitSchema,
} from './reception.js'

/**
 * Task 6.1 — the invoices you handed out, findable again.
 *
 * Reception (3.6) and the lab (5.6) both RAISE invoices; nothing until now could LIST them
 * or open one back up. This is that half: a paged register the desk searches, and a detail
 * that reprints the very same bill the patient was handed — the check-in receipt, rebuilt
 * from what was stored rather than from what a save happened to return.
 *
 * Read-only. Taking money, discounting and refunding are their own later slices with their
 * own permissions; here the desk only looks and reprints.
 */

// ---------------------------------------------------------------------------------
// The register
// ---------------------------------------------------------------------------------

export const invoiceListQuerySchema = z.object({
  /**
   * A single facility day, YYYY-MM-DD, read in the hospital's zone. Absent means "all
   * days" — the register is normally opened to today from the UI, but a search across
   * everything is a legitimate question a null date answers.
   */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional(),
  /** One patient's bills — every invoice raised for them, newest first. */
  patientId: z.uuid().optional(),
  status: invoiceStatusSchema.optional(),
  /**
   * Free text over the invoice number, and the patient's name and MRN. The desk is handed
   * a slip with a number on it, or a name, and should not have to say which.
   */
  q: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>

export const invoiceListItemSchema = z.object({
  id: z.uuid(),
  invoiceNo: z.string(),
  status: invoiceStatusSchema,
  patientId: z.uuid(),
  patientName: z.string(),
  patientMrn: z.string(),
  /** Null for an invoice not tied to a visit — the model allows it, even if today none are. */
  visitNo: z.string().nullable(),
  /** What the bill was for, at a glance: the first line, plus how many more there are. */
  summary: z.string(),
  itemCount: z.number().int(),
  total: z.string(),
  paidAmount: z.string(),
  currency: z.string(),
  createdAt: z.string(),
})
export type InvoiceListItem = z.infer<typeof invoiceListItemSchema>

export const invoiceListResponseSchema = z.object({
  invoices: z.array(invoiceListItemSchema),
  /** Total matches, which may exceed the returned page. */
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
})
export type InvoiceListResponse = z.infer<typeof invoiceListResponseSchema>

// ---------------------------------------------------------------------------------
// One invoice, in full — the reprint
// ---------------------------------------------------------------------------------

/** One settled (or reversed) payment against the invoice — the cash trail on the detail. */
export const invoicePaymentSchema = z.object({
  id: z.uuid(),
  amount: z.string(),
  method: paymentMethodSchema,
  reference: z.string().nullable(),
  receiptNo: z.string().nullable(),
  receivedAt: z.string(),
  isReversed: z.boolean(),
})
export type InvoicePayment = z.infer<typeof invoicePaymentSchema>

/**
 * Everything the reprinted bill needs, rebuilt from the stored invoice. The same three
 * blocks the check-in receipt carries — facility, patient, visit — so the printed page is
 * identical to the one handed over at the window. `createdAt` is the receipt date for a
 * reprint (the visit's start time is when they arrived, not when this bill was raised),
 * and `visit` is nullable because the invoice model does not require one.
 */
export const invoiceDetailSchema = z.object({
  facility: receiptFacilitySchema,
  patient: receiptPatientSchema,
  visit: receiptVisitSchema.nullable(),
  invoice: invoiceSummarySchema,
  createdAt: z.string(),
  createdByName: z.string().nullable(),
  payments: z.array(invoicePaymentSchema),
})
export type InvoiceDetail = z.infer<typeof invoiceDetailSchema>

// ---------------------------------------------------------------------------------
// One visit, all its tills — task 6.2
// ---------------------------------------------------------------------------------

/**
 * Which till raised a bill, read off its lines. One visit can gather three separate
 * invoices — the consult and card at reception, the tests at the lab, the medicines at
 * the pharmacy — each settled at its own window. The origin is not stored on the invoice;
 * it is what the invoice is FOR, derived from the ref types of its items:
 *  - `prescription_item` → pharmacy
 *  - `lab_order_item`    → lab
 *  - `service` / `card_registration` → reception
 *  - anything else (or an empty bill) → other
 */
export const INVOICE_ORIGINS = ['reception', 'lab', 'pharmacy', 'other'] as const
export const invoiceOriginSchema = z.enum(INVOICE_ORIGINS)
export type InvoiceOrigin = z.infer<typeof invoiceOriginSchema>

/** A register row, plus which till it belongs to and what is still owed on it. */
export const visitBillSchema = invoiceListItemSchema.extend({
  origin: invoiceOriginSchema,
  /** total − paid, two places; '0.00' once the bill is settled. */
  outstanding: z.string(),
})
export type VisitBill = z.infer<typeof visitBillSchema>

/**
 * Every bill one visit carries, across the three tills, with the visit's own running
 * total: what was charged, what has been paid, and what is still open — so the desk sees
 * the whole financial picture of a visit at once rather than one window at a time.
 */
export const visitBillsResponseSchema = z.object({
  visit: z.object({
    id: z.uuid(),
    visitNo: z.string(),
    patientId: z.uuid(),
    patientName: z.string(),
    patientMrn: z.string(),
  }),
  bills: z.array(visitBillSchema),
  totals: z.object({
    billed: z.string(),
    paid: z.string(),
    outstanding: z.string(),
    currency: z.string(),
  }),
})
export type VisitBillsResponse = z.infer<typeof visitBillsResponseSchema>

// ---------------------------------------------------------------------------------
// Taking the money — task 6.3
// ---------------------------------------------------------------------------------

/**
 * A payment is real money crossing the counter, so the methods here are the real tenders
 * only — `waiver` and `panel` from the full PaymentMethod enum are deliberately absent.
 * Writing off a bill is a discount (6.4), and an employer/NGO settling it is panel billing
 * (6.7); neither is cash taken at the till, and letting them through this door would be a
 * back way to mark a bill paid with no money behind it.
 */
export const PAYMENT_TENDERS = ['cash', 'card', 'bank_transfer', 'mobile_money'] as const
export const paymentTenderSchema = z.enum(PAYMENT_TENDERS)
export type PaymentTender = z.infer<typeof paymentTenderSchema>

export const recordPaymentRequestSchema = z.object({
  /**
   * What the patient handed over. Server-clamped: never more than the bill still owes, so
   * an instalment settles part and the balance stays exact. A payment is a tender, not a
   * price — the server does not trust it as a charge, only as cash received against a total
   * it computed itself.
   */
  amount: moneySchema.refine((v) => Number(v) > 0, 'Enter an amount greater than zero'),
  method: paymentTenderSchema,
  /** A card slip number, a transfer reference — free text, optional. */
  reference: z.string().trim().max(120).optional(),
})
export type RecordPaymentRequest = z.infer<typeof recordPaymentRequestSchema>

/**
 * The result of taking a payment: the bill's new standing — what it now shows paid and
 * still owes, and whether that closed it — plus the payment itself, receipt number and all,
 * for the slip the patient walks away with.
 */
export const recordPaymentResponseSchema = z.object({
  invoiceId: z.uuid(),
  status: invoiceStatusSchema,
  total: z.string(),
  paidAmount: z.string(),
  outstanding: z.string(),
  currency: z.string(),
  payment: invoicePaymentSchema,
})
export type RecordPaymentResponse = z.infer<typeof recordPaymentResponseSchema>
