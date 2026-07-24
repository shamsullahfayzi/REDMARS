import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FACILITY_TIME_ZONE } from '../common/facility-time';

const SEQUENCE_CONFIG = {
  patient_mrn: { prefix: 'MRN', yearly: false, pad: 6 },
  visit_no: { prefix: 'V', yearly: true, pad: 4 },
  invoice_no: { prefix: 'INV', yearly: true, pad: 4 },
  lab_order_no: { prefix: 'LAB', yearly: true, pad: 4 },
  receipt_no: { prefix: 'RCP', yearly: true, pad: 4 },
} as const;

export type SequenceKey = keyof typeof SEQUENCE_CONFIG;

// Non-yearly sequences store this instead of NULL. A UNIQUE over a nullable column
// does NOT dedupe in Postgres (NULL <> NULL), so two (facility, patient_mrn, NULL)
// counters could coexist and race — the exact hole this issuer exists to close. A
// concrete sentinel makes the unique tuple real and the row lock land on one row.
const NO_YEAR = 0;

// Computing the year in the facility's zone (not the server's UTC) keeps the invoice
// year correct for a registration made just after local midnight on 1 January. The
// constant moved to common/facility-time.ts at task 3.7, when the doctor's queue needed
// the same zone to decide what "today" means — one definition of where the hospital is,
// not two that can drift apart.

export interface IssuedNumber {
  key: SequenceKey;
  /** The year the counter belongs to, or NO_YEAR (0) for a lifelong sequence. */
  year: number;
  /** The raw counter value — 1, 2, 3, … */
  value: number;
  /** The formatted identifier, e.g. "INV-2026-0042" or "MRN-000042". */
  formatted: string;
}

/**
 * Anything that can run a raw query — the service's own client, or a transaction client
 * handed in by a caller (task 3.6).
 *
 * A number issued outside its caller's transaction is a number that survives a rollback,
 * and a survivor in a gapless sequence is a gap. So a caller that may roll back passes
 * its transaction in here and the increment rolls back with everything else.
 */
export interface SequenceRunner {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

@Injectable()
export class NumberSequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Issue the next number for a facility + key. Gapless, unique, per-year — safe to
   * call concurrently. `at` is the moment the number is issued (defaults to now),
   * used only to pick the year for a yearly sequence; pass it explicitly in tests.
   *
   * `runner` lets a caller issue the number INSIDE its own transaction (task 3.6), so a
   * rollback takes the increment with it. The row lock is then held until that
   * transaction commits, which serialises concurrent issuers of the same key — correct,
   * and the trade the word "gapless" was always asking for.
   */
  async next(
    facilityId: string,
    key: SequenceKey,
    at: Date = new Date(),
    runner: SequenceRunner = this.prisma,
  ): Promise<IssuedNumber> {
    const config = SEQUENCE_CONFIG[key];
    if (!config) {
      // A typo'd key would otherwise create a brand-new counter under a bogus name
      // and hand out numbers no one can trace back. Fail loud instead.
      throw new BadRequestException(`Unknown number sequence key: ${key}`);
    }

    const year = config.yearly ? this.yearIn(at) : NO_YEAR;

    // The atomic read-and-increment. Bootstraps the row at 1 on first use, else adds
    // one to the current value under a row lock. Parameterised — $queryRaw binds the
    // values, never string-concatenates them.
    const rows = await runner.$queryRaw<Array<{ current: number }>>`
      INSERT INTO number_sequence (id, facility_id, key, prefix, year, current, updated_at)
      VALUES (${randomUUID()}, ${facilityId}, ${key}, ${config.prefix}, ${year}, 1, now())
      ON CONFLICT (facility_id, key, year)
      DO UPDATE SET current = number_sequence.current + 1, updated_at = now()
      RETURNING current
    `;

    const value = rows[0].current;
    return { key, year, value, formatted: this.format(config, year, value) };
  }

  private format(
    config: (typeof SEQUENCE_CONFIG)[SequenceKey],
    year: number,
    value: number,
  ): string {
    const padded = String(value).padStart(config.pad, '0');
    return config.yearly ? `${config.prefix}-${year}-${padded}` : `${config.prefix}-${padded}`;
  }

  private yearIn(at: Date): number {
    // Intl gives the calendar year in the target zone without pulling in a tz library.
    return Number(
      new Intl.DateTimeFormat('en-US', { timeZone: FACILITY_TIME_ZONE, year: 'numeric' }).format(
        at,
      ),
    );
  }
}
