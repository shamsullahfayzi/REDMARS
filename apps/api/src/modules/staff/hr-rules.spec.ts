import { countWorkingDays, credentialState } from './hr-rules';

describe('HR business rules', () => {
  it('uses exact credential reminder boundaries', () => {
    const today = new Date('2026-10-26T00:00:00Z');
    expect(credentialState(new Date('2027-01-24'), today).state).toBe('due_90');
    expect(credentialState(new Date('2026-11-25'), today).state).toBe('due_30');
    expect(credentialState(new Date('2026-10-26'), today).state).toBe('expires_today');
    expect(credentialState(new Date('2026-10-25'), today).state).toBe('expired');
  });

  it('excludes configured rest days and public holidays from leave', () => {
    expect(
      countWorkingDays(
        new Date('2026-10-25'),
        new Date('2026-10-31'),
        [5],
        new Set(['2026-10-27']),
      ),
    ).toBe(5);
  });
});
