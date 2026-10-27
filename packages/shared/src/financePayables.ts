import { z } from 'zod'
import { financeDateSchema } from './finance.js'

const text = z.string().trim().min(1).max(240)
const money = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/)
  .refine((v) => /[1-9]/.test(v), 'Amount must be positive')
const key = z.uuid()
export const costCentreInputSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{2,20}$/),
  name: text,
  idempotencyKey: key,
})
export const expenseMappingInputSchema = z.object({
  category: text,
  accountId: z.uuid(),
  costCentreId: z.uuid().nullable().optional(),
  idempotencyKey: key,
})
export const supplierUpdateSchema = z.object({
  name: text,
  reference: z.string().trim().max(120),
  termsDays: z.number().int().min(0).max(365),
  terms: z.string().trim().max(240),
  contact: z.string().trim().max(240),
  isActive: z.boolean(),
  idempotencyKey: key,
})
export const supplierOpeningSchema = z.object({
  supplierId: z.uuid(),
  reference: text,
  dueOn: financeDateSchema,
  amount: money,
  idempotencyKey: key,
})
export const payableChargeSchema = z
  .object({
    date: financeDateSchema,
    memo: text,
    category: text.optional(),
    accountId: z.uuid().optional(),
    costCentreId: z.uuid().nullable().optional(),
    amount: money,
    mode: z.enum(['cash', 'payable']),
    cashAccountId: z.uuid().optional(),
    supplierId: z.uuid().optional(),
    reference: text.optional(),
    dueOn: financeDateSchema.optional(),
    idempotencyKey: key,
  })
  .refine(
    (v) => !!v.category || !!v.accountId,
    'Choose an expense category or account',
  )
  .refine(
    (v) =>
      v.mode === 'cash' ? !!v.cashAccountId : !!v.supplierId && !!v.reference,
    'Choose cash account or supplier and invoice reference',
  )
  .refine(
    (v) => !v.dueOn || v.dueOn >= v.date,
    'Due date must not precede bill date',
  )
export const supplierPaymentSchema = z
  .object({
    supplierId: z.uuid(),
    date: financeDateSchema,
    reference: text,
    cashAccountId: z.uuid(),
    allocations: z
      .array(z.object({ billId: z.uuid(), amount: money }))
      .min(1)
      .max(50),
    idempotencyKey: key,
  })
  .refine(
    (v) =>
      new Set(v.allocations.map((a) => a.billId)).size === v.allocations.length,
    'Each bill can appear once',
  )
export const procurementReceiptSchema = z
  .object({
    supplierId: z.uuid(),
    sourceSystem: text,
    poReference: text,
    grnReference: text,
    receivedOn: financeDateSchema,
    lines: z
      .array(
        z.object({
          sourceLineId: text,
          description: text,
          quantity: z
            .string()
            .regex(/^\d{1,9}(\.\d{1,3})?$/)
            .refine((v) => /[1-9]/.test(v)),
          unitCost: money,
          category: text,
        }),
      )
      .min(1)
      .max(50),
    idempotencyKey: key,
  })
  .refine(
    (v) => new Set(v.lines.map((l) => l.sourceLineId)).size === v.lines.length,
    'Receipt line references must be unique',
  )
export const procurementBillSchema = z
  .object({
    reference: text,
    date: financeDateSchema,
    dueOn: financeDateSchema.optional(),
    idempotencyKey: key,
  })
  .refine(
    (v) => !v.dueOn || v.dueOn >= v.date,
    'Due date must not precede bill date',
  )
export const payablesQuerySchema = z.object({
  asOf: financeDateSchema,
  supplierId: z.uuid().optional(),
})
const centre = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  isActive: z.boolean(),
})
export const payablesWorkspaceSchema = z.object({
  centres: z.array(centre),
  mappings: z.array(
    z.object({
      category: z.string(),
      accountId: z.string(),
      costCentreId: z.string().nullable(),
    }),
  ),
  receipts: z.array(
    z.object({
      id: z.string(),
      supplierId: z.string(),
      supplierName: z.string(),
      sourceSystem: z.string(),
      poReference: z.string(),
      grnReference: z.string(),
      receivedOn: z.string(),
      amount: z.string(),
      billId: z.string().nullable(),
      journalId: z.string().nullable(),
      lines: z.array(
        z.object({
          sourceLineId: z.string(),
          description: z.string(),
          quantity: z.string(),
          unitCost: z.string(),
          category: z.string(),
          amount: z.string(),
        }),
      ),
    }),
  ),
})
export const payablesReportSchema = z.object({
  asOf: z.string(),
  total: z.string(),
  controlBalance: z.string(),
  allocatedBalance: z.string(),
  difference: z.string(),
  pending: z.number(),
  rows: z.array(
    z.object({
      billId: z.string(),
      journalId: z.string(),
      supplierId: z.string(),
      supplierName: z.string(),
      reference: z.string(),
      kind: z.string(),
      date: z.string(),
      dueOn: z.string(),
      amount: z.string(),
      paid: z.string(),
      outstanding: z.string(),
      reserved: z.string(),
      available: z.string(),
      days: z.number(),
      current: z.string(),
      days1to30: z.string(),
      days31to60: z.string(),
      days61to90: z.string(),
      over90: z.string(),
    }),
  ),
})
export const supplierStatementSchema = z.object({
  supplierName: z.string(),
  opening: z.string(),
  closing: z.string(),
  lines: z.array(
    z.object({
      journalId: z.string(),
      date: z.string(),
      number: z.string().nullable(),
      reference: z.string(),
      kind: z.string(),
      movement: z.string(),
      balance: z.string(),
    }),
  ),
})
export const payableSourceSchema = z.object({
  bills: z.array(
    z.object({
      id: z.string(),
      reference: z.string(),
      supplierName: z.string(),
      kind: z.string(),
      amount: z.string(),
      dueOn: z.string(),
      allocation: z.string().nullable(),
      procurement: z
        .object({
          poReference: z.string(),
          grnReference: z.string(),
          sourceSystem: z.string(),
          receivedOn: z.string(),
          lines: z.array(
            procurementReceiptSchema.shape.lines.element.extend({
              amount: z.string(),
            }),
          ),
        })
        .nullable(),
    }),
  ),
})
