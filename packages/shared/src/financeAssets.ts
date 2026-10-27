import { z } from "zod";
import { financeDateSchema } from "./finance.js";
import { moneyDecimal } from "./money.js";
const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
const positive = money.refine(
  (v) => moneyDecimal(v).gt(0),
  "Amount must be positive",
);
const text = z.string().trim().min(1).max(120);
export const assetInputSchema = z
  .object({
    code: text,
    name: text,
    category: text,
    location: text,
    date: financeDateSchema,
    cost: positive,
    residual: money.default("0"),
    lifeMonths: z.number().int().min(1).max(1200),
    startPeriodId: z.uuid(),
    costCentreId: z.uuid().nullable().optional(),
    billLineId: z.uuid().optional(),
    cashAccountId: z.uuid().optional(),
    idempotencyKey: z.uuid(),
  })
  .refine(
    (v) => moneyDecimal(v.residual).lt(v.cost),
    "Residual must be below cost",
  )
  .refine(
    (v) => !!v.billLineId !== !!v.cashAccountId,
    "Choose a bill line or cash account",
  );
export const assetDisposeSchema = z
  .object({
    date: financeDateSchema,
    proceeds: money,
    cashAccountId: z.uuid().optional(),
    reason: text,
    idempotencyKey: z.uuid(),
  })
  .refine(
    (v) => moneyDecimal(v.proceeds).isZero() || !!v.cashAccountId,
    "Choose the account receiving proceeds",
  );
export const assetRunSchema = z.object({
  through: financeDateSchema,
  idempotencyKey: z.uuid(),
});
export const transferInputSchema = z
  .object({
    date: financeDateSchema,
    fromAccountId: z.uuid(),
    toAccountId: z.uuid(),
    amount: positive,
    reference: text,
    idempotencyKey: z.uuid(),
  })
  .refine(
    (v) => v.fromAccountId !== v.toAccountId,
    "Choose different accounts",
  );
export const budgetInputSchema = z.object({
  periodId: z.uuid(),
  accountId: z.uuid(),
  costCentreId: z.uuid().nullable().optional(),
  amount: money,
  expectedVersion: z.number().int().min(0),
  idempotencyKey: z.uuid(),
});
export const budgetQuerySchema = z.object({
  year: z.coerce.number().int().min(1300).max(1600),
});
// Round each monthly installment, then absorb the rounding remainder in the last month.
export function straightLineAmount(
  cost: string,
  residual: string,
  months: number,
  index: number,
) {
  if (
    !Number.isInteger(months) ||
    months < 1 ||
    !Number.isInteger(index) ||
    index < 0
  )
    throw new Error("Invalid depreciation month");
  const base = moneyDecimal(cost).minus(residual);
  if (base.lt(0)) throw new Error("Residual exceeds cost");
  if (index >= months) return "0.00";
  const monthly = base.div(months).toDecimalPlaces(2);
  const remaining = base.minus(monthly.times(index));
  if (remaining.lte(0)) return "0.00";
  return (
    index === months - 1 || monthly.gt(remaining) ? remaining : monthly
  ).toFixed(2);
}
const entry = z.object({
  id: z.string(),
  kind: z.string(),
  period: z.string(),
  journalId: z.string(),
  date: z.string(),
  status: z.string(),
  reversed: z.boolean(),
  reversalPending: z.boolean(),
  amount: z.string(),
  proceeds: z.string(),
});
export const assetsWorkspaceSchema = z.object({
  assets: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      category: z.string(),
      location: z.string(),
      cost: z.string(),
      residual: z.string(),
      lifeMonths: z.number(),
      acquiredOn: z.string(),
      startPeriod: z.string(),
      costCentreId: z.string().nullable(),
      billReference: z.string().nullable(),
      billJournalId: z.string().nullable(),
      status: z.string(),
      depreciation: z.string(),
      netBookValue: z.string(),
      entries: z.array(entry),
      schedule: z.array(z.object({ period: z.string(), amount: z.string() })),
    }),
  ),
  billLines: z.array(
    z.object({
      id: z.string(),
      reference: z.string(),
      account: z.string(),
      available: z.string(),
    }),
  ),
  centres: z.array(z.object({ id: z.string(), name: z.string() })),
  scheduler: z.object({
    lastRun: z.string().nullable(),
    errors: z.array(z.string()),
  }),
});
export const budgetReportSchema = z.object({
  year: z.number(),
  rows: z.array(
    z.object({
      periodId: z.string(),
      period: z.string(),
      accountId: z.string(),
      account: z.string(),
      type: z.string(),
      costCentreId: z.string().nullable(),
      department: z.string(),
      budget: z.string().nullable(),
      actual: z.string(),
      variance: z.string().nullable(),
      favorable: z.boolean().nullable(),
      version: z.number(),
    }),
  ),
});
