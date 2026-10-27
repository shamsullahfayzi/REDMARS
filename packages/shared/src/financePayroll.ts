import { z } from 'zod'
import { financeDateSchema } from './finance.js'
import { moneyDecimal as d } from './money.js'

const amount = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/)
const positive = amount.refine(
  (v) => /[1-9]/.test(v),
  'Amount must be positive',
)
const text = z.string().trim().min(1).max(160)
const key = z.uuid()
export const AFGHAN_MONTHLY_TAX = [
  { from: '0', rate: '0' },
  { from: '5000', rate: '2' },
  { from: '12500', rate: '10' },
  { from: '100000', rate: '20' },
]
export const payrollEmployeeInputSchema = z
  .object({
    code: text,
    name: text,
    nameDari: z.string().trim().max(160).default(''),
    basic: positive,
    allowance: amount.default('0'),
    overtimeRate: amount.default('0'),
    currency: z.literal('AFN').default('AFN'),
    costCentreId: z.uuid(),
    startsOn: financeDateSchema,
    endsOn: financeDateSchema.nullable().default(null),
    isActive: z.boolean().default(true),
    idempotencyKey: key,
  })
  .refine(
    (v) => !v.endsOn || v.endsOn >= v.startsOn,
    'End date must follow start date',
  )
export const payrollTaxBandSchema = z.object({
  from: amount,
  rate: amount.refine((v) => d(v).lte('100')),
})
export const payrollConfigInputSchema = z
  .object({
    taxName: text,
    taxBands: z.array(payrollTaxBandSchema).min(1).max(20),
    idempotencyKey: key,
  })
  .refine(
    (v) =>
      d(v.taxBands[0].from).isZero() &&
      v.taxBands.every((b, i) => !i || d(b.from).gt(v.taxBands[i - 1].from)),
    'Tax bands must start at zero and increase',
  )
export const payrollAdjustmentSchema = z.object({
  employeeId: z.uuid(),
  absenceDays: amount.default('0'),
  overtimeHours: amount.default('0'),
  bonus: amount.default('0'),
  otherDeduction: amount.default('0'),
  note: z.string().trim().max(240).default(''),
})
export const payrollCalculateSchema = z
  .object({
    periodId: z.uuid(),
    date: financeDateSchema,
    adjustments: z.array(payrollAdjustmentSchema).max(500),
    idempotencyKey: key,
  })
  .refine(
    (v) =>
      new Set(v.adjustments.map((a) => a.employeeId)).size ===
      v.adjustments.length,
    'Duplicate employee',
  )
export const payrollLoanInputSchema = z
  .object({
    employeeId: z.uuid(),
    kind: z.enum(['loan', 'advance']),
    reference: text,
    amount: positive,
    installment: positive,
    date: financeDateSchema,
    firstPeriodId: z.uuid(),
    cashAccountId: z.uuid(),
    idempotencyKey: key,
  })
  .refine(
    (v) => d(v.installment).lte(v.amount),
    'Installment exceeds principal',
  )
export const payrollActionSchema = z.object({
  version: z.number().int().positive(),
  idempotencyKey: key,
})
export const payrollPaymentSchema = z.object({
  itemId: z.uuid(),
  amount: positive,
  date: financeDateSchema,
  cashAccountId: z.uuid(),
  reference: text,
  idempotencyKey: key,
})

/** Monthly salary; calendar-day proration. Absence reduces basic pay, not allowances.
 * Tax bands are marginal rates on gross after absence. Each component rounds half up. */
export function calculatePayroll(input: {
  basic: string
  allowance: string
  overtimeRate: string
  eligibleDays: number
  periodDays: number
  absenceDays: string
  overtimeHours: string
  bonus: string
  otherDeduction: string
  loanDeduction: string
  taxBands: z.infer<typeof payrollTaxBandSchema>[]
}) {
  const n = (v: string) => d(v)
  if (n(input.absenceDays).gt(String(input.eligibleDays)))
    throw new Error('Absence exceeds eligible calendar days')
  const basic = n(input.basic)
    .mul(String(input.eligibleDays))
    .div(String(input.periodDays))
    .toFixed(2)
  const allowance = n(input.allowance)
    .mul(String(input.eligibleDays))
    .div(String(input.periodDays))
    .toFixed(2)
  const absence = n(input.basic)
    .mul(input.absenceDays)
    .div(String(input.periodDays))
    .toFixed(2)
  const overtime = n(input.overtimeRate).mul(input.overtimeHours).toFixed(2)
  const gross = n(basic)
    .add(allowance)
    .add(overtime)
    .add(input.bonus)
    .sub(absence)
    .toFixed(2)
  let tax = n('0')
  input.taxBands.forEach((band, i) => {
    const upper = input.taxBands[i + 1]?.from ?? gross
    const taxable = n(gross).lt(upper) ? n(gross) : n(upper)
    if (taxable.gt(band.from))
      tax = tax.add(taxable.sub(band.from).mul(band.rate).div('100'))
  })
  const taxAmount = tax.toFixed(2)
  const deductions = n(taxAmount)
    .add(input.loanDeduction)
    .add(input.otherDeduction)
    .toFixed(2)
  const net = n(gross).sub(deductions).toFixed(2)
  if (n(net).isNegative()) throw new Error('Deductions exceed gross pay')
  return {
    basic,
    allowance,
    absence,
    overtime,
    bonus: n(input.bonus).toFixed(2),
    gross,
    tax: taxAmount,
    loanDeduction: n(input.loanDeduction).toFixed(2),
    otherDeduction: n(input.otherDeduction).toFixed(2),
    deductions,
    net,
  }
}

const journal = z.object({
  id: z.string(),
  status: z.string(),
  reversed: z.boolean(),
})
export const payrollItemSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  code: z.string(),
  name: z.string(),
  nameDari: z.string(),
  costCentreId: z.string(),
  centreName: z.string(),
  currency: z.string(),
  basic: z.string(),
  allowance: z.string(),
  absence: z.string(),
  overtime: z.string(),
  bonus: z.string(),
  gross: z.string(),
  tax: z.string(),
  loanDeduction: z.string(),
  otherDeduction: z.string(),
  deductions: z.string(),
  net: z.string(),
  absenceDays: z.string(),
  overtimeHours: z.string(),
  eligibleDays: z.number(),
  periodDays: z.number(),
  note: z.string(),
  paid: z.string(),
  reserved: z.string(),
  available: z.string(),
})
export const payrollRunSchema = z.object({
  facilityName: z.string(),
  id: z.string(),
  periodId: z.string(),
  period: z.string(),
  date: z.string(),
  status: z.string(),
  version: z.number(),
  createdBy: z.string(),
  approvedBy: z.string().nullable(),
  taxName: z.string(),
  journal: journal.nullable(),
  items: z.array(payrollItemSchema),
  payments: z.array(
    z.object({
      id: z.string(),
      itemId: z.string(),
      amount: z.string(),
      date: z.string(),
      reference: z.string(),
      journal,
    }),
  ),
})
export const payrollSourceSchema = z.object({
  runId: z.string().nullable(),
  period: z.string().nullable(),
  employee: z.string().nullable(),
  reference: z.string().nullable(),
})
export const payrollWorkspaceSchema = z.object({
  config: z
    .object({ taxName: z.string(), taxBands: z.array(payrollTaxBandSchema) })
    .nullable(),
  employees: z.array(
    z
      .object(payrollEmployeeInputSchema.shape)
      .omit({ idempotencyKey: true })
      .extend({ id: z.string() }),
  ),
  centres: z.array(
    z.object({ id: z.string(), name: z.string(), code: z.string() }),
  ),
  runs: z.array(
    z.object({
      id: z.string(),
      period: z.string(),
      date: z.string(),
      status: z.string(),
      gross: z.string(),
      net: z.string(),
    }),
  ),
  loans: z.array(
    z.object({
      id: z.string(),
      employeeId: z.string(),
      employeeName: z.string(),
      kind: z.string(),
      reference: z.string(),
      amount: z.string(),
      installment: z.string(),
      deducted: z.string(),
      reserved: z.string(),
      outstanding: z.string(),
      firstPeriod: z.string(),
      journal,
    }),
  ),
})
