/**
 * A money amount spelled out in English words, for the bill's "Received with thanks …"
 * line — the way Farhat's old Medi-Pro bill printed it ("Afghani Three Hundred Only").
 *
 * English regardless of the interface language, on purpose: it matches the bill the
 * hospital has handed out for years, and staff read the amount in figures beside it.
 * Integers only up to the millions — a clinic bill never needs more, and pretending to
 * handle a billion would only add cases nobody will ever exercise. Any fractional afghanis
 * are shown as "and NN/100", the standard cheque form.
 */

const ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen',
]
const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
]

/** 0–999 in words. */
function underThousand(n: number): string {
  if (n < 20) return ONES[n]
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)]
    const r = n % 10
    return r === 0 ? t : `${t} ${ONES[r]}`
  }
  const h = `${ONES[Math.floor(n / 100)]} Hundred`
  const r = n % 100
  return r === 0 ? h : `${h} ${underThousand(r)}`
}

/** A whole number in words. Groups by thousand/million; caps beyond the millions. */
function wholeInWords(n: number): string {
  if (n === 0) return ONES[0]
  const parts: string[] = []
  const millions = Math.floor(n / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1000)
  const rest = n % 1000
  if (millions > 0) parts.push(`${underThousand(millions)} Million`)
  if (thousands > 0) parts.push(`${underThousand(thousands)} Thousand`)
  if (rest > 0) parts.push(underThousand(rest))
  return parts.join(' ')
}

/**
 * `amount` is the decimal string the invoice carries ("300.00"). Returns the whole part in
 * words, with the fractional part appended as "and NN/100" when it is not zero.
 */
export function amountInWords(amount: string): string {
  const [wholeStr = '0', fracStr = '00'] = amount.split('.')
  const whole = Math.floor(Number(wholeStr)) || 0
  const words = wholeInWords(whole)
  const frac = Number(fracStr.padEnd(2, '0').slice(0, 2))
  return frac > 0 ? `${words} and ${String(frac).padStart(2, '0')}/100` : words
}
