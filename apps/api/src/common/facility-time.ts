/**
 * What "today" means at the hospital.
 *
 * Farhat is UTC+04:30 with no daylight saving. The server may well run in UTC, so a
 * naive `new Date()` day boundary is four and a half hours out: a patient registered at
 * 08:00 Kabul on Tuesday is 03:30 UTC Tuesday (fine), but one registered at 02:00 Kabul
 * on Tuesday is 21:30 UTC MONDAY — and would drop off Tuesday's queue entirely. A night
 * shift is exactly when nobody is watching a screen closely enough to notice.
 *
 * Reading the zone per facility is a later refinement; there is one facility per
 * database today, which is the same assumption the number issuer already makes.
 */
export const FACILITY_TIME_ZONE = 'Asia/Kabul';

/**
 * How far the facility's wall clock is ahead of UTC at a given instant, in milliseconds.
 *
 * Computed by asking Intl what the wall clock reads there and then treating that reading
 * as if it were UTC — the difference is the offset. Doing it this way rather than
 * hard-coding +04:30 means the constant above is the only thing to change if the zone
 * ever does, and it stays correct for a zone that observes DST.
 */
function offsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: FACILITY_TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    // Intl can render midnight as hour 24 under hour12: false. Fold it back to 0.
    value('hour') % 24,
    value('minute'),
    value('second'),
  );
  return asUtc - at.getTime();
}

/** Midnight-to-midnight, in the facility's zone, as the UTC instants a query compares against. */
export function facilityDayBounds(at: Date = new Date()): { start: Date; end: Date } {
  const offset = offsetMs(at);
  // Shift into wall-clock space, truncate to the day there, then shift back.
  const wall = new Date(at.getTime() + offset);
  const midnightWall = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());

  const start = new Date(midnightWall - offset);
  // Recomputed rather than start + 24h: across a DST change the local day is not 24
  // hours long. Kabul has no DST, but a helper that is only right for one zone is a
  // helper that will be wrong the first time it is reused.
  const nextWall = midnightWall + 24 * 60 * 60 * 1000;
  const end = new Date(nextWall - offsetMs(new Date(nextWall - offset)));

  return { start, end };
}

/** YYYY-MM-DD as the facility reads it — what a date filter in the URL means. */
export function facilityDateString(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FACILITY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** The bounds of a YYYY-MM-DD the caller asked for, read in the facility's zone. */
export function facilityDayBoundsFor(date: string): { start: Date; end: Date } {
  // Noon UTC lands inside the intended local day for every real-world offset, so the
  // day this resolves to is never the one either side of it.
  return facilityDayBounds(new Date(`${date}T12:00:00Z`));
}
