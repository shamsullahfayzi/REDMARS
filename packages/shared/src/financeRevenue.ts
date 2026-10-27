import { z } from 'zod'
import { financeDateSchema } from './finance.js'

const key = z.uuid()
const amount = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/)
const positive = amount.refine(v => /[1-9]/.test(v), 'Amount must be positive')
const text = z.string().trim().min(1).max(240)
export const revenueCategories = ['consultation','laboratory','pharmacy','procedure','registration','other','discount','refund'] as const
export const revenueMappingInputSchema = z.object({
  category: z.string().refine(v => (revenueCategories as readonly string[]).includes(v) || /^service:[a-f0-9-]{36}$/.test(v)),
  accountId: key, idempotencyKey: key,
})
export const financePanelInputSchema = z.object({code:z.string().trim().regex(/^[A-Za-z0-9-]{2,30}$/),name:text,contactPerson:z.string().trim().max(120).default(''),phone:z.string().trim().max(40).default(''),idempotencyKey:key})
export const financeAssignPanelSchema = z.object({panelId:key,idempotencyKey:key})
export const financePanelReceiptSchema = z.object({invoiceId:key,panelId:key,cashAccountId:key,amount:positive,date:financeDateSchema,reference:text,idempotencyKey:key})
export const financeArQuerySchema = z.object({asOf:financeDateSchema,panelId:key.optional(),patientId:key.optional()})
export const financeTillInputSchema = z.object({
  userId:key,origin:z.enum(['reception','lab','pharmacy','other']),label:text,
  startsAt:z.iso.datetime(),endsAt:z.iso.datetime(),opening:amount,counted:amount,note:z.string().trim().max(500).default(''),idempotencyKey:key,
}).refine(v=>v.startsAt<v.endsAt,'Shift end must follow start')
export const financeDepositInputSchema = z.object({date:financeDateSchema,fromAccountId:key,toAccountId:key,tillCloseId:key.nullable().optional(),amount:positive,reference:text,idempotencyKey:key})
export const financeRevenueWorkspaceSchema = z.object({
  mappings:z.array(z.object({category:z.string(),accountId:z.string()})),
  services:z.array(z.object({id:z.string(),code:z.string(),name:z.string()})),
  panels:z.array(z.object({id:z.string(),code:z.string(),name:z.string(),contactPerson:z.string().nullable(),phone:z.string().nullable()})),
  users:z.array(z.object({id:z.string(),fullName:z.string()})),
  closes:z.array(z.object({id:z.string(),userId:z.string(),userName:z.string(),label:z.string(),origin:z.string(),startsAt:z.string(),endsAt:z.string(),opening:z.string(),expected:z.string(),counted:z.string(),difference:z.string(),note:z.string(),approvedAt:z.string().nullable(),createdBy:z.string()})),
  deposits:z.array(z.object({id:z.string(),reference:z.string(),amount:z.string(),date:z.string(),status:z.string(),journalId:z.string(),tillCloseId:z.string().nullable(),reversed:z.boolean()})),
})
export const financeArSchema = z.object({
  asOf:z.string(),kind:z.enum(['patient','panel']),total:z.string(),controlBalance:z.string(),difference:z.string(),pending:z.number(),
  rows:z.array(z.object({invoiceId:z.string(),invoiceNo:z.string(),patientId:z.string(),patientName:z.string(),patientMrn:z.string(),panelId:z.string().nullable(),panelName:z.string().nullable(),date:z.string(),days:z.number(),balance:z.string(),current:z.string(),days31to60:z.string(),days61to90:z.string(),over90:z.string()})),
})
export const financeSourceSchema = z.object({
  journalId:z.string(),sourceType:z.string(),sourceId:z.string().nullable(),
  invoice:z.object({id:z.string(),invoiceNo:z.string(),date:z.string(),status:z.string(),total:z.string(),paidAmount:z.string(),patientName:z.string(),mrn:z.string(),visitId:z.string().nullable(),visitNo:z.string().nullable(),panelName:z.string().nullable(),items:z.array(z.object({description:z.string(),total:z.string()}))}).nullable(),
  payment:z.object({receiptNo:z.string().nullable(),amount:z.string(),method:z.string(),receivedAt:z.string()}).nullable(),
  history:z.array(z.object({id:z.string(),date:z.string(),number:z.string().nullable(),memo:z.string(),status:z.string()})),
})
export const financePanelStatementSchema = z.object({panelName:z.string(),from:z.string(),to:z.string(),opening:z.string(),closing:z.string(),lines:z.array(z.object({journalId:z.string(),number:z.string(),date:z.string(),invoiceNo:z.string(),memo:z.string(),debit:z.string(),credit:z.string(),balance:z.string()}))})
