import { formatShamsiDate, shamsiDayBounds, shamsiMonthLength, shamsiToUtc } from './shamsi.js'

/** Contiguous Kabul civil months, stored as half-open UTC intervals [start, end). */
export function fiscalYearCalendar(year: number) {
  const periods = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const label = `${year}-${String(month).padStart(2, '0')}`
    const first = `${label}-01`
    const last = `${label}-${shamsiMonthLength(year, month)}`
    return {
      month,
      label,
      name: formatShamsiDate(first).replace(/^1 /, ''),
      startsOn: shamsiToUtc(first),
      endsOn: shamsiDayBounds(last).endExclusive,
    }
  })
  return {
    year,
    label: String(year),
    startsOn: periods[0].startsOn,
    endsOn: periods[11].endsOn,
    periods,
  }
}
