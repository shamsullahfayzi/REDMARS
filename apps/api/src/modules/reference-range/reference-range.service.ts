import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateReferenceRangeRequest,
  ReferenceRangeListResponse,
  ReferenceRangeSummary,
  UpdateReferenceRangeRequest,
} from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

const REFERENCE_RANGE_SELECT = {
  id: true,
  testId: true,
  gender: true,
  minAge: true,
  maxAge: true,
  lowValue: true,
  highValue: true,
  textValue: true,
} as const;

type ReferenceRangeRow = {
  id: string;
  testId: string;
  gender: 'male' | 'female' | 'other' | 'unknown' | null;
  minAge: number | null;
  maxAge: number | null;
  lowValue: Prisma.Decimal | null;
  highValue: Prisma.Decimal | null;
  textValue: string | null;
};

function toSummary(row: ReferenceRangeRow): ReferenceRangeSummary {
  return {
    id: row.id,
    testId: row.testId,
    gender: row.gender,
    minAge: row.minAge,
    maxAge: row.maxAge,
    // A lab value is exact but not money — toString keeps 13.5 as "13.5", no forced
    // trailing zeros. Still a string on the wire so the exact value survives.
    low: row.lowValue ? row.lowValue.toString() : null,
    high: row.highValue ? row.highValue.toString() : null,
    textValue: row.textValue,
  };
}

// The writable fields common to create and update. Absent becomes null, so clearing
// a field on edit clears the row.
function toFields(input: CreateReferenceRangeRequest | UpdateReferenceRangeRequest) {
  return {
    gender: input.gender ?? null,
    minAge: input.minAge ?? null,
    maxAge: input.maxAge ?? null,
    lowValue: input.low ? new Prisma.Decimal(input.low) : null,
    highValue: input.high ? new Prisma.Decimal(input.high) : null,
    textValue: input.textValue ?? null,
  };
}

@Injectable()
export class ReferenceRangeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(facilityId: string, testId: string): Promise<ReferenceRangeListResponse> {
    await this.assertTestInFacility(facilityId, testId);
    const ranges = await this.prisma.db.referenceRange.findMany({
      where: { testId },
      orderBy: [{ gender: 'asc' }, { minAge: 'asc' }],
      select: REFERENCE_RANGE_SELECT,
    });
    return { ranges: ranges.map(toSummary) };
  }

  async create(
    facilityId: string,
    testId: string,
    input: CreateReferenceRangeRequest,
  ): Promise<ReferenceRangeSummary> {
    await this.assertTestInFacility(facilityId, testId);
    const created = await this.prisma.db.referenceRange.create({
      data: { testId, ...toFields(input) },
      select: REFERENCE_RANGE_SELECT,
    });
    return toSummary(created);
  }

  async update(
    facilityId: string,
    testId: string,
    rangeId: string,
    input: UpdateReferenceRangeRequest,
  ): Promise<ReferenceRangeSummary> {
    await this.assertRangeOnTest(facilityId, testId, rangeId);
    const updated = await this.prisma.db.referenceRange.update({
      where: { id: rangeId },
      data: toFields(input),
      select: REFERENCE_RANGE_SELECT,
    });
    return toSummary(updated);
  }

  // Reference ranges are reference data with no active/inactive state — a wrong band
  // should be gone, not lingering as a normal-value the flag logic might still read.
  // So this is a hard delete (audited by the Prisma wrapper). Returns the fresh list.
  async remove(
    facilityId: string,
    testId: string,
    rangeId: string,
  ): Promise<ReferenceRangeListResponse> {
    await this.assertRangeOnTest(facilityId, testId, rangeId);
    await this.prisma.db.referenceRange.delete({ where: { id: rangeId } });
    return this.list(facilityId, testId);
  }

  private async assertTestInFacility(facilityId: string, testId: string): Promise<void> {
    const test = await this.prisma.db.labTest.findFirst({
      where: { id: testId, facilityId },
      select: { id: true },
    });
    if (!test) {
      throw new NotFoundException('Lab test not found');
    }
  }

  private async assertRangeOnTest(
    facilityId: string,
    testId: string,
    rangeId: string,
  ): Promise<void> {
    await this.assertTestInFacility(facilityId, testId);
    const range = await this.prisma.db.referenceRange.findFirst({
      where: { id: rangeId, testId },
      select: { id: true },
    });
    if (!range) {
      throw new NotFoundException('Reference range not found');
    }
  }
}
