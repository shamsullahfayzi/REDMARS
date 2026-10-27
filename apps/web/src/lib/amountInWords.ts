/**
 * A money amount spelled out in English words, for the bill's "Received with thanks …"
 * line — the way Axon's old Medi-Pro bill printed it ("Afghani Three Hundred Only").
 *
 * English regardless of the interface language, on purpose: it matches the bill the
 * hospital has handed out for years, and staff read the amount in figures beside it.
 * Uses exact integer groups through quadrillions. Fractional afghanis are shown as
 * "and NN/100", the standard cheque form; no amount passes through a JS number.
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
function underThousand(n: bigint): string {
  const word = (values: string[], index: bigint) => values.find((_, i) => BigInt(i) === index)!
  if (n < 20n) return word(ONES, n)
  if (n < 100n) {
    const t = word(TENS, n / 10n)
    const r = n % 10n
    return r === 0n ? t : `${t} ${word(ONES, r)}`
  }
  const h = `${word(ONES, n / 100n)} Hundred`
  const r = n % 100n
  return r === 0n ? h : `${h} ${underThousand(r)}`
}

/** A whole number in words, grouped in exact powers of one thousand. */
function wholeInWords(n: bigint): string {
  if (n === 0n) return ONES[0]
  const parts: string[] = []
  const groups = ['', 'Thousand', 'Million', 'Billion', 'Trillion', 'Quadrillion']
  let index = 0
  while (n > 0n) {
    const group = n % 1000n
    if (group) parts.unshift(`${underThousand(group)}${groups[index] ? ` ${groups[index]}` : ''}`)
    n /= 1000n
    index++
  }
  return parts.join(' ')
}

/**
 * `amount` is the decimal string the invoice carries ("300.00"). Returns the whole part in
 * words, with the fractional part appended as "and NN/100" when it is not zero.
 */
export function amountInWords(amount: string): string {
  const [wholeStr = '0', fracStr = '00'] = amount.split('.')
  const whole = BigInt(wholeStr)
  const words = `${amount.startsWith('-') ? 'Minus ' : ''}${wholeInWords(whole < 0n ? -whole : whole)}`
  const frac = fracStr.padEnd(2, '0').slice(0, 2)
  return /[1-9]/.test(frac) ? `${words} and ${frac}/100` : words
}
