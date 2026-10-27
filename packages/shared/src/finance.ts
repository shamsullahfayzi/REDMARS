import { z } from 'zod'
import {
  gregorianToShamsi,
  SHAMSI_MIN_YEAR,
  SHAMSI_MAX_YEAR,
} from './shamsi.js'

// Wire dates are Gregorian Kabul civil dates; UI renders Shamsi, storage uses UTC instants.
export const financeDateSchema = z.iso.date().refine((value) => {
  try {
    gregorianToShamsi(value)
    return true
  } catch {
    return false
  }
}, 'Date is outside the verified fiscal calendar (1350–1499)')
const money = z
  .string()
  .regex(
    /^\d{1,12}(\.\d{1,2})?$/,
    'Use a positive decimal amount with at most two decimal places',
  )
const positiveMoney = money.refine(
  (v) => /[1-9]/.test(v),
  'Amount must be greater than zero',
)
const signedMoney = z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/)
const key = z.uuid()
export const fiscalYearInputSchema = z.object({
  year: z.number().int().min(SHAMSI_MIN_YEAR).max(SHAMSI_MAX_YEAR),
  idempotencyKey: key,
})
const text = z.string().trim().min(1).max(240)
export const financeAccountTypeSchema = z.enum([
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense',
])
export const financeSetupSchema = z.object({
  cutoverDate: financeDateSchema,
  idempotencyKey: key,
})
export const financeAccountInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{2,20}$/),
    name: text,
    type: financeAccountTypeSchema,
    parentId: z.uuid().nullable().optional(),
    normalBalance: z.enum(['debit', 'credit']).optional(),
    isPosting: z.boolean().default(true),
    isCash: z.boolean().default(false),
    idempotencyKey: key,
  })
  .refine((v) => !v.isCash || v.type === 'asset', {
    message: 'Cash/bank accounts must be assets',
    path: ['type'],
  })
export const financePeriodInputSchema = z
  .object({
    name: text,
    startsOn: financeDateSchema,
    endsOn: financeDateSchema,
    idempotencyKey: key,
  })
  .refine((v) => v.startsOn <= v.endsOn, {
    message: 'End date must follow start date',
    path: ['endsOn'],
  })
export const financeJournalLineInputSchema = z
  .object({
    accountId: z.uuid(),
    costCentreId: z.uuid().nullable().optional(),
    description: z.string().trim().max(240).default(''),
    debit: money.default('0'),
    credit: money.default('0'),
  })
  .refine(
    (v) => /[1-9]/.test(v.debit) !== /[1-9]/.test(v.credit),
    'Each line needs a debit OR a credit',
  )
export const financeJournalInputSchema = z.object({
  date: financeDateSchema,
  memo: text,
  lines: z.array(financeJournalLineInputSchema).min(2).max(100),
  idempotencyKey: key,
})
export const financeJournalEditSchema = financeJournalInputSchema.extend({
  expectedVersion: z.number().int().positive(),
})
export const financePostSchema = z.object({
  expectedVersion: z.number().int().positive(),
  idempotencyKey: key,
})
export const financeReverseSchema = z.object({
  date: financeDateSchema,
  reason: text,
  idempotencyKey: key,
})
export const financeCommandSchema = z.object({ idempotencyKey: key })
export const financeSupplierInputSchema = z.object({
  name: text,
  reference: z.string().trim().max(120).optional(),
  termsDays: z.number().int().min(0).max(365).optional(),
  terms: z.string().trim().max(240).optional(),
  contact: z.string().trim().max(240).optional(),
  idempotencyKey: key,
})
export const financeExpenseInputSchema = z.object({
  date: financeDateSchema,
  memo: text,
  expenseAccountId: z.uuid(),
  cashAccountId: z.uuid(),
  amount: positiveMoney,
  costCentreId: z.uuid().nullable().optional(),
  idempotencyKey: key,
})
export const financeBillInputSchema = z
  .object({
    date: financeDateSchema,
    dueOn: financeDateSchema,
    supplierId: z.uuid(),
    reference: text,
    memo: text,
    expenseAccountId: z.uuid(),
    amount: positiveMoney,
    costCentreId: z.uuid().nullable().optional(),
    idempotencyKey: key,
  })
  .refine((v) => v.dueOn >= v.date, {
    message: 'Due date must not precede bill date',
    path: ['dueOn'],
  })
export const financeSettlementInputSchema = z.object({
  date: financeDateSchema,
  memo: text,
  cashAccountId: z.uuid(),
  amount: positiveMoney,
  idempotencyKey: key,
})
export const financeStatementInputSchema = z
  .object({
    accountId: z.uuid(),
    reference: text,
    startsOn: financeDateSchema,
    endsOn: financeDateSchema,
    openingBalance: signedMoney,
    closingBalance: signedMoney,
    lines: z
      .array(
        z.object({
          date: financeDateSchema,
          description: text,
          amount: signedMoney.refine(
            (v) => /[1-9]/.test(v),
            'Amount cannot be zero',
          ),
        }),
      )
      .max(500),
    idempotencyKey: key,
  })
  .refine(
    (v) =>
      v.startsOn <= v.endsOn &&
      v.lines.every((l) => l.date >= v.startsOn && l.date <= v.endsOn),
    'Statement dates are inconsistent',
  )
export const financeMatchSchema = z.object({
  journalLineId: z.uuid().nullable(),
  idempotencyKey: key,
})
export const financeReportQuerySchema = z
  .object({
    from: financeDateSchema,
    to: financeDateSchema,
    accountId: z.uuid().optional(),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
  })
  .refine((v) => v.from <= v.to, 'Report start must precede end')

export const financeAccountSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  type: financeAccountTypeSchema,
  parentId: z.string().nullable(),
  normalBalance: z.enum(['debit', 'credit']),
  isPosting: z.boolean(),
  systemKey: z.string().nullable(),
  isControl: z.boolean(),
  isCash: z.boolean(),
  isActive: z.boolean(),
})
export const financePeriodSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  label: z.string(),
  year: z.number().int(),
  month: z.number().int(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  startsOn: financeDateSchema,
  endsOn: financeDateSchema,
  closedAt: z.string().nullable(),
})
export const financeJournalSchema = z.object({
  id: z.uuid(),
  number: z.string().nullable(),
  date: financeDateSchema,
  effectiveAt: z.iso.datetime(),
  periodLabel: z.string(),
  currency: z.literal('AFN'),
  memo: z.string(),
  status: z.enum(['draft', 'posted']),
  sourceType: z.string(),
  sourceId: z.string().nullable(),
  version: z.number(),
  reversalOfId: z.string().nullable(),
  reversalId: z.string().nullable(),
  postedAt: z.string().nullable(),
  createdBy: z.string(),
  createdByName: z.string(),
  postedByName: z.string().nullable(),
  reversalStatus: z.enum(['draft', 'posted']).nullable(),
  lines: z.array(
    z.object({
      id: z.uuid(),
      accountId: z.uuid(),
      accountCode: z.string(),
      accountName: z.string(),
      description: z.string(),
      debit: z.string(),
      credit: z.string(),
      currency: z.string(),
      exchangeRate: z.string(),
      baseDebit: z.string(),
      baseCredit: z.string(),
      costCentreId: z.string().nullable().optional(),
      costCentreName: z.string().nullable().optional(),
    }),
  ),
})
export const financeSupplierSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  reference: z.string().nullable(),
  isActive: z.boolean(),
  termsDays: z.number().int().default(0),
  terms: z.string().default(''),
  contact: z.string().default(''),
})
export const financeBillSchema = z.object({
  id: z.uuid(),
  supplierId: z.uuid(),
  supplierName: z.string(),
  reference: z.string(),
  date: financeDateSchema,
  dueOn: financeDateSchema,
  amount: z.string(),
  paid: z.string(),
  outstanding: z.string(),
  reserved: z.string(),
  available: z.string(),
  status: z.enum(['draft', 'posted']),
  reversed: z.boolean(),
  journalId: z.uuid(),
  settlements: z.array(
    z.object({
      id: z.uuid(),
      journalId: z.uuid(),
      date: financeDateSchema,
      amount: z.string(),
      reversed: z.boolean(),
      status: z.enum(['draft', 'posted']),
    }),
  ),
})
export const financeStatementSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  reference: z.string(),
  startsOn: financeDateSchema,
  endsOn: financeDateSchema,
  openingBalance: z.string(),
  closingBalance: z.string(),
  reconciledAt: z.string().nullable(),
  lines: z.array(
    z.object({
      id: z.uuid(),
      date: financeDateSchema,
      description: z.string(),
      amount: z.string(),
      journalLineId: z.string().nullable(),
    }),
  ),
})
export const financeWorkspaceSchema = z.object({
  settings: z
    .object({ currency: z.literal('AFN'), cutoverDate: financeDateSchema })
    .nullable(),
  accounts: z.array(financeAccountSchema),
  periods: z.array(financePeriodSchema),
  fiscalYears: z.array(
    z.object({
      id: z.uuid(),
      year: z.number().int(),
      label: z.string(),
      startsAt: z.iso.datetime(),
      endsAt: z.iso.datetime(),
    }),
  ),
  legacyClosedPeriods: z.array(
    z.object({
      name: z.string(),
      startsOn: financeDateSchema,
      endsOn: financeDateSchema,
    }),
  ),
  suppliers: z.array(financeSupplierSchema),
  journals: z.array(financeJournalSchema),
  bills: z.array(financeBillSchema),
  statements: z.array(financeStatementSchema),
  journalCount: z.number(),
  pendingEvents: z.number(),
})
export const financeReportSchema = z.object({
  from: financeDateSchema,
  to: financeDateSchema,
  currency: z.literal('AFN'),
  accounts: z.array(
    z.object({
      accountId: z.uuid(),
      code: z.string(),
      name: z.string(),
      type: financeAccountTypeSchema,
      opening: z.string(),
      debit: z.string(),
      credit: z.string(),
      closing: z.string(),
    }),
  ),
  debit: z.string(),
  credit: z.string(),
  balanced: z.boolean(),
  closingDebit: z.string(),
  closingCredit: z.string(),
  income: z.string(),
  expenses: z.string(),
  netIncome: z.string(),
  assets: z.string(),
  liabilities: z.string(),
  equity: z.string(),
  retainedResult: z.string(),
  balanceSheetDifference: z.string(),
})
export const financeLedgerSchema = z.object({
  opening: z.string(),
  closing: z.string(),
  truncated: z.boolean(),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  lines: z.array(
    z.object({
      id: z.uuid(),
      journalId: z.uuid(),
      number: z.string(),
      date: financeDateSchema,
      memo: z.string(),
      debit: z.string(),
      credit: z.string(),
      balance: z.string(),
      matched: z.boolean(),
    }),
  ),
})
export const financeSyncSchema = z.object({
  drafted: z.number(),
  skipped: z.number(),
  failures: z.array(
    z.object({ eventId: z.string(), type: z.string(), message: z.string() }),
  ),
  remaining: z.number(),
})

export const financeJournalQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  status: z.enum(['draft', 'posted']).optional(),
})
export const financeJournalPageSchema = z.object({
  journals: z.array(financeJournalSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})
export const financeOpeningInputSchema = z.object({
  filename: z.string().trim().min(1).max(120),
  csv: z.string().min(1).max(80000),
  idempotencyKey: key,
})
export const financeOpeningPreviewSchema = z.object({
  date: financeDateSchema,
  filename: z.string(),
  debit: z.string(),
  credit: z.string(),
  rows: z.array(
    z.object({
      accountId: z.string(),
      code: z.string(),
      name: z.string(),
      debit: z.string(),
      credit: z.string(),
      description: z.string(),
    }),
  ),
})
export const financeAuditPageSchema = z.object({
  total: z.number(),
  page: z.number(),
  rows: z.array(
    z.object({
      id: z.string(),
      occurredAt: z.string(),
      actorId: z.string().nullable(),
      actorName: z.string(),
      action: z.string(),
      entity: z.string(),
      entityId: z.string(),
      before: z.unknown(),
      after: z.unknown(),
    }),
  ),
})

export type FinanceJournalInput = z.infer<typeof financeJournalInputSchema>
export type FinanceJournal = z.infer<typeof financeJournalSchema>
export type FinanceWorkspace = z.infer<typeof financeWorkspaceSchema>
export type FinanceReport = z.infer<typeof financeReportSchema>
