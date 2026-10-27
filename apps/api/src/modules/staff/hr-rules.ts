export type CredentialState =
  'not_expiring' | 'valid' | 'due_90' | 'due_60' | 'due_30' | 'expires_today' | 'expired';

const DAY = 86_400_000;

export function dateOnly(value: string | Date): Date {
  if (value instanceof Date)
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

export function dateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((dateOnly(to).getTime() - dateOnly(from).getTime()) / DAY);
}

export function credentialState(
  expiresOn: Date | null,
  today = new Date(),
): {
  state: CredentialState;
  daysUntilExpiry: number | null;
} {
  if (!expiresOn) return { state: 'not_expiring', daysUntilExpiry: null };
  const days = daysBetween(today, expiresOn);
  if (days < 0) return { state: 'expired', daysUntilExpiry: days };
  if (days === 0) return { state: 'expires_today', daysUntilExpiry: days };
  if (days <= 30) return { state: 'due_30', daysUntilExpiry: days };
  if (days <= 60) return { state: 'due_60', daysUntilExpiry: days };
  if (days <= 90) return { state: 'due_90', daysUntilExpiry: days };
  return { state: 'valid', daysUntilExpiry: days };
}

export function datesInclusive(start: Date, end: Date): Date[] {
  const result: Date[] = [];
  for (
    let cursor = dateOnly(start);
    cursor <= dateOnly(end);
    cursor = new Date(cursor.getTime() + DAY)
  )
    result.push(cursor);
  return result;
}

export function countWorkingDays(
  start: Date,
  end: Date,
  restDays: readonly number[],
  holidays: ReadonlySet<string>,
): number {
  return datesInclusive(start, end).filter(
    (day) => !restDays.includes(day.getUTCDay()) && !holidays.has(dateString(day)),
  ).length;
}

export function timeToMinutes(value: string): number {
  const [h, m] = value.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}
