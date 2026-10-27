import { z } from "zod";
import { financeDateSchema } from "./finance.js";
const text = z.string().trim().min(1).max(240);
const money = z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/);
export const statementQuerySchema = z
  .object({
    from: financeDateSchema,
    to: financeDateSchema,
    facilityIds: z.string().optional(),
    costCentreId: z.uuid().optional(),
  })
  .refine((v) => v.from <= v.to, "Invalid date range");
export const reportGrantInputSchema = z.object({
  viewerId: z.uuid(),
  active: z.boolean(),
  reason: text,
  expectedVersion: z.number().int().min(0),
  idempotencyKey: z.uuid(),
});
export const cashCategorySchema = z.enum([
  "operating",
  "investing",
  "financing",
  "opening",
  "unclassified",
]);
export const cashClassificationInputSchema = z.object({
  rows: z
    .array(
      z.object({
        category: cashCategorySchema,
        accountId: z.uuid().nullable(),
        amount: money,
        label: text,
      }),
    )
    .min(1)
    .max(100),
  reason: text,
  expectedVersion: z.number().int().min(0),
  idempotencyKey: z.uuid(),
});
export const reportDefinitionSchema = z
  .array(
    z.object({
      label: text,
      accountIds: z.array(z.uuid()).min(1).max(200),
      measure: z.enum(["movement", "closing", "debit", "credit"]),
      sign: z.enum(["debit", "credit"]),
      costCentreId: z.uuid().nullable().optional(),
    }),
  )
  .min(1)
  .max(100);
export const reportTemplateInputSchema = z.object({
  name: text,
  authority: text,
  definition: reportDefinitionSchema,
  expectedVersion: z.number().int().min(0),
  idempotencyKey: z.uuid(),
});
export const periodActionSchema = z.object({
  reason: text,
  idempotencyKey: z.uuid(),
});
const moneyRow = z.object({
  facilityId: z.string(),
  facility: z.string(),
  accountId: z.string(),
  code: z.string(),
  name: z.string(),
  type: z.string(),
  opening: z.string(),
  debit: z.string(),
  credit: z.string(),
  closing: z.string(),
  result: z.string(),
});
export const statementPackSchema = z.object({
  from: z.string(),
  to: z.string(),
  currency: z.literal("AFN"),
  facilities: z.array(z.object({ id: z.string(), name: z.string() })),
  generatedAt: z.string(),
  warnings: z.array(z.string()),
  accounts: z.array(moneyRow),
  profitLoss: z.array(moneyRow),
  totals: z.object({
    income: z.string(),
    expenses: z.string(),
    netIncome: z.string(),
    assets: z.string(),
    liabilities: z.string(),
    equity: z.string(),
    unclosedResult: z.string(),
    balanceDifference: z.string(),
    receivables: z.string(),
    payables: z.string(),
  }),
  departments: z.array(
    z.object({
      facility: z.string(),
      name: z.string(),
      income: z.string(),
      expenses: z.string(),
      netIncome: z.string(),
    }),
  ),
  cash: z.object({
    opening: z.string(),
    closing: z.string(),
    operating: z.string(),
    investing: z.string(),
    financing: z.string(),
    openingAdjustments: z.string(),
    unclassified: z.string(),
    difference: z.string(),
    receipts: z.string(),
    payments: z.string(),
    income: z.string(),
    expenses: z.string(),
    netIncome: z.string(),
    rows: z.array(
      z.object({
        journalId: z.string(),
        facilityId: z.string(),
        facility: z.string(),
        number: z.string(),
        date: z.string(),
        memo: z.string(),
        category: cashCategorySchema,
        accountId: z.string().nullable(),
        label: z.string(),
        amount: z.string(),
        plType: z.string().nullable(),
        version: z.number(),
      }),
    ),
    positions: z.array(
      z.object({
        facility: z.string(),
        account: z.string(),
        opening: z.string(),
        receipts: z.string(),
        payments: z.string(),
        closing: z.string(),
      }),
    ),
  }),
});
export const financeCloseChecklistSchema = z.object({
  periodId: z.string(),
  label: z.string(),
  state: z.enum(["open", "closed", "locked"]),
  canClose: z.boolean(),
  checks: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      passed: z.boolean(),
      detail: z.string(),
    }),
  ),
  events: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      reason: z.string(),
      actor: z.string(),
      at: z.string(),
    }),
  ),
});
export const reportingWorkspaceSchema = z.object({
  viewerId: z.string(),
  facilities: z.array(z.object({ id: z.string(), name: z.string() })),
  grants: z.array(
    z.object({
      viewerId: z.string(),
      name: z.string(),
      facility: z.string(),
      active: z.boolean(),
      version: z.number(),
      reason: z.string(),
    }),
  ),
  templates: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      authority: z.string(),
      version: z.number(),
      definition: reportDefinitionSchema,
    }),
  ),
  years: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      journalId: z.string().nullable(),
      prepared: z.boolean(),
      finalized: z.boolean(),
    }),
  ),
  centres: z.array(z.object({ id: z.string(), name: z.string() })),
});
export const customReportResultSchema = z.object({
  name: z.string(),
  authority: z.string(),
  version: z.number(),
  from: z.string(),
  to: z.string(),
  rows: z.array(z.object({ label: z.string(), amount: z.string() })),
});
