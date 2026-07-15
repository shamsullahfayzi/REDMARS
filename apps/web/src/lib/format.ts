/**
 * Numbers are ALWAYS rendered with Latin digits (0-9), in every language.
 *
 * Dari and Pashto are commonly written with Eastern Arabic numerals (۱۲۳), and
 * Intl will happily produce them if you hand it a locale. We do not want that.
 * An MRN, a dose, a lab value and a price must look identical in all three
 * languages, because staff read across languages all day and mixed numeral
 * systems on a prescription invite a misread. Latin digits everywhere is a
 * clinical-safety decision, not a style preference.
 *
 * Consequence: never call `value.toLocaleString()` or hand a UI locale to Intl
 * for anything numeric. Route it through here.
 */
const NUMERIC_LOCALE = 'en-US'

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(NUMERIC_LOCALE, options).format(value)
}
