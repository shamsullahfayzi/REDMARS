import { Decimal } from 'decimal.js'

// Keep policy local: other libraries must not change finance arithmetic globally.
const CurrencyDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP })
export const MONEY_SCALE = 2
export const MONEY_ROUNDING = Decimal.ROUND_HALF_UP

/** Currency enters the application as decimal text, never as a JS number. */
export function moneyDecimal(value: string | Decimal): Decimal {
  if (typeof value !== 'string' && !Decimal.isDecimal(value))
    throw new TypeError('Money must be decimal text or a Decimal')
  const result = new CurrencyDecimal(value)
  if (!result.isFinite()) throw new RangeError('Money must be finite')
  return result
}

/** Round calculated amounts once at the posting boundary; ties away from zero. */
export function roundMoney(value: string | Decimal): string {
  return moneyDecimal(value).toFixed(MONEY_SCALE, MONEY_ROUNDING)
}

/** Group decimal text without passing the amount through Number/Intl.NumberFormat. */
export function formatMoney(value: string | Decimal): string {
  const [whole, fraction] = roundMoney(value).split('.')
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`
}

/** Editable currency fields can be temporarily empty/invalid; never coerce them to a number. */
export function parseMoneyInput(value: string): Decimal | null {
  return /^-?\d{1,16}(\.\d{1,2})?$/.test(value.trim()) ? moneyDecimal(value.trim()) : null
}
