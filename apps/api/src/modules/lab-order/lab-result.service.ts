import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Gender } from '@prisma/client';
import type {
  LabResult,
  SaveLabResultRequest,
  SaveLabResultResponse,
  VerifyResultRequest,
  VerifyResultResponse,
  VisitLabResultItem,
  VisitLabResultsResponse,
} from '@redmars/shared';
import { currentAgeYears } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Entering a result (Phase 5, fourth slice).
 *
 * The technician types what a test produced; the server records it and — for a numeric value
 * — flags it against the normal band. The flag is NEVER trusted from the browser: the same
 * number is normal for a woman and low for a man, so which band applies is decided here from
 * the patient's own gender and age (referenceRange.ts), and H/L falls out of the comparison.
 *
 * A result is entered while the test is `sample_collected` (or `in_progress`); doing so moves
 * it to `resulted`. Re-entering before verification overwrites — a mistyped value is fixed by
 * typing it again, not by a separate correction — but once a result is `verified` it is the
 * amender's job (lab.amend_result), not this one, so entry refuses a verified test.
 */

/** The chosen band, or null when none of a test's ranges fit this patient. */
interface Band {
  low: Prisma.Decimal | null;
  high: Prisma.Decimal | null;
  text: string | null;
}

@Injectable()
export class LabResultService {
  constructor(private readonly prisma: PrismaService) {}

  async save(
    facilityId: string,
    userId: string,
    itemId: string,
    input: SaveLabResultRequest,
  ): Promise<SaveLabResultResponse> {
    const item = await this.prisma.db.labOrderItem.findFirst({
      where: { id: itemId, labOrder: { facilityId } },
      select: {
        id: true,
        status: true,
        testId: true,
        test: { select: { unit: true } },
        result: { select: { verifiedAt: true } },
        labOrder: {
          select: {
            visit: {
              select: {
                patient: {
                  select: {
                    gender: true,
                    dateOfBirth: true,
                    estimatedAgeYears: true,
                    estimatedAgeMonths: true,
                    ageRecordedAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Lab test not found');

    // A sample has to exist before it can produce a number.
    if (item.status !== 'sample_collected' && item.status !== 'in_progress') {
      if (item.status === 'resulted' || item.status === 'verified') {
        // resulted is re-enterable; verified is not — that is amendment's job.
        if (item.result?.verifiedAt) {
          throw new BadRequestException({
            message: 'This result is verified. Amending it is a separate action.',
            code: 'already_verified',
          });
        }
      } else {
        throw new BadRequestException({
          message: 'A result can only be entered once the sample has been collected.',
          code: 'no_sample',
        });
      }
    }

    const patient = item.labOrder.visit.patient;

    // The flag. Only a numeric value is measured against a band; a text result carries none.
    let flag: string | null = null;
    let isAbnormal = false;
    let band: Band = { low: null, high: null, text: null };

    if (input.valueNumeric != null) {
      const ageYears = currentAgeYears({
        dateOfBirth: patient.dateOfBirth?.toISOString().slice(0, 10) ?? null,
        estimatedAgeYears: patient.estimatedAgeYears,
        estimatedAgeMonths: patient.estimatedAgeMonths,
        ageRecordedAt: patient.ageRecordedAt?.toISOString() ?? null,
      });
      band = await this.bandFor(item.testId, patient.gender, ageYears);
      const value = new Prisma.Decimal(input.valueNumeric);
      if (band.low != null && value.lessThan(band.low)) {
        flag = 'L';
        isAbnormal = true;
      } else if (band.high != null && value.greaterThan(band.high)) {
        flag = 'H';
        isAbnormal = true;
      }
    } else if (input.valueText != null) {
      // A text band ("Negative") makes anything else abnormal, case-insensitively.
      band = await this.bandFor(item.testId, patient.gender, null);
      if (band.text != null) {
        isAbnormal = input.valueText.trim().toLowerCase() !== band.text.trim().toLowerCase();
      }
    }

    const unit = input.valueNumeric != null ? (input.unit ?? item.test.unit ?? null) : null;
    const now = new Date();

    await this.prisma.db.$transaction(async (tx) => {
      await tx.labResult.upsert({
        where: { labOrderItemId: itemId },
        create: {
          labOrderItemId: itemId,
          valueNumeric: input.valueNumeric ?? null,
          valueText: input.valueText ?? null,
          unit,
          flag,
          isAbnormal,
          comment: input.comment ?? null,
          enteredBy: userId,
          enteredAt: now,
        },
        update: {
          valueNumeric: input.valueNumeric ?? null,
          valueText: input.valueText ?? null,
          unit,
          flag,
          isAbnormal,
          comment: input.comment ?? null,
          enteredBy: userId,
          enteredAt: now,
          // Re-entering a not-yet-verified result clears any stale verification stamp.
          verifiedBy: null,
          verifiedAt: null,
        },
      });
      await tx.labOrderItem.update({ where: { id: itemId }, data: { status: 'resulted' } });
    });

    const result: LabResult = {
      itemId,
      status: 'resulted',
      valueNumeric: input.valueNumeric ?? null,
      valueText: input.valueText ?? null,
      unit,
      flag,
      isAbnormal,
      comment: input.comment ?? null,
      enteredAt: now.toISOString(),
      referenceLow: band.low?.toString() ?? null,
      referenceHigh: band.high?.toString() ?? null,
      referenceText: band.text,
    };
    return { result };
  }

  /**
   * Verify a batch of results — the sign-off that moves `resulted` to `verified` and locks it.
   *
   * All or nothing: every item must be a result waiting to be verified, or none are. The
   * final `resulted` check runs inside the transaction so a result re-entered (which resets it
   * to `resulted` and clears any stamp) between the read and the write cannot be verified out
   * from under the edit.
   */
  async verify(
    facilityId: string,
    userId: string,
    input: VerifyResultRequest,
  ): Promise<VerifyResultResponse> {
    const itemIds = [...new Set(input.itemIds)];

    const items = await this.prisma.db.labOrderItem.findMany({
      where: { id: { in: itemIds }, labOrder: { facilityId } },
      select: { id: true, status: true },
    });
    if (items.length !== itemIds.length) {
      throw new BadRequestException({
        message: 'One of those results is not on this facility’s orders.',
        code: 'unknown_item',
      });
    }
    const notResulted = items.filter((item) => item.status !== 'resulted');
    if (notResulted.length > 0) {
      throw new BadRequestException({
        message: 'Only a result that has been entered can be verified.',
        code: 'not_verifiable',
      });
    }

    const now = new Date();
    await this.prisma.db.$transaction(async (tx) => {
      const stillResulted = await tx.labOrderItem.count({
        where: { id: { in: itemIds }, status: 'resulted' },
      });
      if (stillResulted !== itemIds.length) {
        throw new ConflictException({
          message: 'One of those results just changed. Reload the queue.',
          code: 'result_changed',
        });
      }
      for (const id of itemIds) {
        await tx.labResult.update({
          where: { labOrderItemId: id },
          data: { verifiedBy: userId, verifiedAt: now },
        });
        await tx.labOrderItem.update({ where: { id }, data: { status: 'verified' } });
      }
    });

    return {
      items: itemIds.map((itemId) => ({
        itemId,
        status: 'verified' as const,
        verifiedAt: now.toISOString(),
      })),
    };
  }

  /**
   * The visit's lab results, read back by the doctor who ordered them — the loop closing.
   *
   * Every non-cancelled test on the visit, in the order it was written, each carrying WHERE it
   * is in the pipeline. The value, its flag and the band it was judged against appear only for
   * a VERIFIED result: before the sign-off a number is provisional, and this screen is where a
   * doctor decides, so it shows status but not an unverified value. The band is recomputed from
   * the patient here (it is not stored on the result) so the report can print "normal 70–110".
   */
  async forVisit(facilityId: string, visitId: string): Promise<VisitLabResultsResponse> {
    const visit = await this.prisma.db.visit.findFirst({
      where: { id: visitId, facilityId },
      select: {
        id: true,
        patient: {
          select: {
            gender: true,
            dateOfBirth: true,
            estimatedAgeYears: true,
            estimatedAgeMonths: true,
            ageRecordedAt: true,
          },
        },
      },
    });
    if (!visit) throw new NotFoundException('Visit not found');

    const rows = await this.prisma.db.labOrderItem.findMany({
      where: { labOrder: { visitId }, status: { not: 'cancelled' } },
      orderBy: [{ labOrder: { orderedAt: 'asc' } }, { testNameAtTime: 'asc' }],
      select: {
        id: true,
        status: true,
        testId: true,
        testNameAtTime: true,
        test: { select: { code: true } },
        labOrder: { select: { orderNo: true, orderedAt: true } },
        result: {
          select: {
            valueNumeric: true,
            valueText: true,
            unit: true,
            flag: true,
            isAbnormal: true,
            comment: true,
            verifiedAt: true,
          },
        },
      },
    });

    const ageYears = currentAgeYears({
      dateOfBirth: visit.patient.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      estimatedAgeYears: visit.patient.estimatedAgeYears,
      estimatedAgeMonths: visit.patient.estimatedAgeMonths,
      ageRecordedAt: visit.patient.ageRecordedAt?.toISOString() ?? null,
    });

    const items: VisitLabResultItem[] = [];
    for (const row of rows) {
      const verified = row.status === 'verified' && row.result?.verifiedAt != null;
      const base = {
        itemId: row.id,
        code: row.test.code,
        testName: row.testNameAtTime,
        orderNo: row.labOrder.orderNo,
        orderedAt: row.labOrder.orderedAt.toISOString(),
        status: row.status,
      };
      if (!verified || !row.result) {
        items.push({
          ...base,
          value: null,
          isNumeric: false,
          unit: null,
          flag: null,
          isAbnormal: false,
          referenceLow: null,
          referenceHigh: null,
          referenceText: null,
          verifiedAt: null,
          comment: null,
        });
        continue;
      }
      const numeric = row.result.valueNumeric != null;
      // The band is recomputed for display; a numeric result uses the patient's age band, a
      // text result only its text band.
      const band = await this.bandFor(row.testId, visit.patient.gender, numeric ? ageYears : null);
      items.push({
        ...base,
        value: row.result.valueNumeric?.toString() ?? row.result.valueText ?? '',
        isNumeric: numeric,
        unit: row.result.unit,
        flag: row.result.flag,
        isAbnormal: row.result.isAbnormal,
        referenceLow: band.low?.toString() ?? null,
        referenceHigh: band.high?.toString() ?? null,
        referenceText: band.text,
        verifiedAt: row.result.verifiedAt?.toISOString() ?? null,
        comment: row.result.comment,
      });
    }

    return { visitId: visit.id, items };
  }

  /**
   * The normal band for a test that fits this patient, most specific first.
   *
   * A range applies when its gender matches (or is unset = any) and the patient's age falls
   * inside its bounds (an unset bound is open on that side; an unknown patient age cannot
   * satisfy a bounded range). Among the fits, the most specific wins — a gender-named band
   * over an any-gender one, an age-bounded band over an open one — so "13–17 male" beats a
   * generic fallback.
   */
  private async bandFor(testId: string, gender: Gender, ageYears: number | null): Promise<Band> {
    const ranges = await this.prisma.db.referenceRange.findMany({
      where: { testId },
      select: {
        gender: true,
        minAge: true,
        maxAge: true,
        lowValue: true,
        highValue: true,
        textValue: true,
      },
    });

    const fits = ranges.filter((range) => {
      if (range.gender != null && range.gender !== gender) return false;
      if (range.minAge != null && (ageYears == null || ageYears < range.minAge)) return false;
      if (range.maxAge != null && (ageYears == null || ageYears > range.maxAge)) return false;
      return true;
    });
    if (fits.length === 0) return { low: null, high: null, text: null };

    fits.sort((a, b) => specificity(b) - specificity(a));
    const best = fits[0];
    return { low: best.lowValue, high: best.highValue, text: best.textValue };
  }
}

/** How narrowly a range is targeted — gender named, and each age bound, each count. */
function specificity(range: {
  gender: Gender | null;
  minAge: number | null;
  maxAge: number | null;
}): number {
  return (
    (range.gender != null ? 2 : 0) + (range.minAge != null ? 1 : 0) + (range.maxAge != null ? 1 : 0)
  );
}
