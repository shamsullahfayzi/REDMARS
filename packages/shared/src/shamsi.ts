/**
 * Finance task 0.1: the sole boundary around the calendar dependency.
 * Civil dates are YYYY-MM-DD strings; instants are Date objects. Never pass a
 * host-local Date to jalaali-js. All application imports go through this module.
 * Supported years deliberately stay inside our exhaustively verified interval.
 */
import { toGregorian, toJalaali, isLeapJalaaliYear, jalaaliMonthLength } from 'jalaali-js'

export const SHAMSI_MIN_YEAR = 1350
export const SHAMSI_MAX_YEAR = 1499
export const SHAMSI_TIME_ZONE = 'Asia/Kabul'

// Kabul has used UTC+04:30 without DST throughout the supported interval.
// Source: IANA tzdb, asia / Asia/Kabul. Reverify if the jurisdiction changes it.
const KABUL_OFFSET_MS = 270 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const MONTHS = {
  en: [
    'Hamal',
    'Sawr',
    'Jawza',
    'Saratan',
    'Asad',
    'Sunbula',
    'Mizan',
    'Aqrab',
    'Qaws',
    'Jadi',
    'Dalwa',
    'Hoot',
  ],
  prs: ['حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله', 'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت'],
  ps: [
    'وری',
    'غویی',
    'غبرګولی',
    'چنګاښ',
    'زمری',
    'وږی',
    'تله',
    'لړم',
    'لیندۍ',
    'مرغومی',
    'سلواغه',
    'کب',
  ],
} as const

export type ShamsiDateParts = { year: number; month: number; day: number }

function yearInRange(year: number): void {
  if (!Number.isInteger(year) || year < SHAMSI_MIN_YEAR || year > SHAMSI_MAX_YEAR)
    throw new RangeError(`Shamsi year must be between ${SHAMSI_MIN_YEAR} and ${SHAMSI_MAX_YEAR}.`)
}

function dateParts(value: string): ShamsiDateParts {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new RangeError('Use YYYY-MM-DD with Latin digits.')
  const [year, month, day] = value.split('-').map(Number)
  return { year, month, day }
}

function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function isShamsiLeapYear(year: number): boolean {
  yearInRange(year)
  return isLeapJalaaliYear(year)
}

export function shamsiMonthLength(year: number, month: number): number {
  yearInRange(year)
  if (!Number.isInteger(month) || month < 1 || month > 12)
    throw new RangeError('Shamsi month must be between 1 and 12.')
  return jalaaliMonthLength(year, month)
}

export function parseShamsiDate(value: string): ShamsiDateParts {
  const parts = dateParts(value)
  const length = shamsiMonthLength(parts.year, parts.month)
  if (parts.day < 1 || parts.day > length)
    throw new RangeError(`This Shamsi month has ${length} days.`)
  return parts
}

/** Calendar conversion only: neither input nor output is an instant. */
export function shamsiToGregorian(value: string): string {
  const { year, month, day } = parseShamsiDate(value)
  const { gy, gm, gd } = toGregorian(year, month, day)
  return isoDate(gy, gm, gd)
}

export function gregorianToShamsi(value: string): string {
  const { year, month, day } = dateParts(value)
  // Validate before conversion: Date and the library otherwise normalize invalid days.
  const instant = new Date(`${value}T00:00:00.000Z`)
  if (
    !Number.isFinite(instant.getTime()) ||
    instant.getUTCFullYear() !== year ||
    instant.getUTCMonth() + 1 !== month ||
    instant.getUTCDate() !== day
  )
    throw new RangeError('Invalid Gregorian date.')
  const { jy, jm, jd } = toJalaali(year, month, day)
  const result = isoDate(jy, jm, jd)
  parseShamsiDate(result)
  return result
}

/** Start of the civil day in Kabul, returned as an absolute UTC instant. */
export function shamsiToUtc(value: string): Date {
  return new Date(Date.parse(`${shamsiToGregorian(value)}T00:00:00.000Z`) - KABUL_OFFSET_MS)
}

/** Project an absolute instant onto the Kabul Shamsi calendar (time of day is discarded). */
export function utcToShamsi(instant: Date): string {
  if (!(instant instanceof Date) || !Number.isFinite(instant.getTime()))
    throw new RangeError('A valid Date instant is required.')
  const local = new Date(instant.getTime() + KABUL_OFFSET_MS)
  if (!Number.isFinite(local.getTime()))
    throw new RangeError('Instant is outside the supported range.')
  return gregorianToShamsi(
    isoDate(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate()),
  )
}

/** Half-open interval: start is included; endExclusive belongs to the next day. */
export function shamsiDayBounds(value: string): { start: Date; endExclusive: Date } {
  const start = shamsiToUtc(value)
  return { start, endExclusive: new Date(start.getTime() + DAY_MS) }
}

export function formatShamsiDate(value: string, language: 'en' | 'prs' | 'ps' = 'en'): string {
  const { year, month, day } = parseShamsiDate(value)
  return `${day} ${MONTHS[language][month - 1]} ${year}`
}
