import { facilityDateString, facilityDayBoundsFor } from './facility-time';

/**
 * The default-window logic Reports (6c) established: a `from`/`to` pair defaults to the
 * trailing week ending today, not an all-time scan. Pulled out of `reports.service.ts` so a
 * second heavy list (Collections) can default the same way instead of growing its own
 * unbounded query — an admin worklist that starts printing thousands of rows the day it
 * ships is the same "reads fine on a demo, dies on real data" bug this pattern already
 * closed for reports.
 */

export interface DateRange {
  start: Date;
  end: Date;
  from: string;
  to: string;
}

/** `days` before a YYYY-MM-DD, in the same string shape. */
export function daysBefore(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return facilityDateString(d);
}

/**
 * Absent `to` means today; absent `from` means `windowDays - 1` days before `to` — a
 * `windowDays` of 7 is a week ending today, the default every current caller uses.
 */
export function resolveRange(query: { from?: string; to?: string }, windowDays = 7): DateRange {
  const to = query.to ?? query.from ?? facilityDateString();
  const from = query.from ?? daysBefore(to, windowDays - 1);
  const start = facilityDayBoundsFor(from).start;
  const end = facilityDayBoundsFor(to).end;
  return { start, end, from, to };
}
