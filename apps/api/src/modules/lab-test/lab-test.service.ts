import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateLabTestRequest,
  LabTestListResponse,
  LabTestSummary,
  SetActiveRequest,
  UpdateLabTestRequest,
} from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

const LAB_TEST_SELECT = {
  id: true,
  code: true,
  name: true,
  nameLocalPrs: true,
  nameLocalPs: true,
  loincCode: true,
  specimen: true,
  unit: true,
  price: true,
  isActive: true,
} as const;

type LabTestRow = {
  id: string;
  code: string;
  name: string;
  nameLocalPrs: string | null;
  nameLocalPs: string | null;
  loincCode: string | null;
  specimen: string | null;
  unit: string | null;
  price: Prisma.Decimal | null;
  isActive: boolean;
};

function toSummary(row: LabTestRow): LabTestSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nameLocalPrs: row.nameLocalPrs,
    nameLocalPs: row.nameLocalPs,
    loincCode: row.loincCode,
    specimen: row.specimen,
    unit: row.unit,
    // Two places on the wire when priced, null when not. toFixed on a Decimal keeps
    // exact money — never a float.
    price: row.price ? row.price.toFixed(2) : null,
    isActive: row.isActive,
  };
}

// The writable fields common to create and update. Optional text and the optional
// price are stored as null when absent, so clearing a field on edit clears the row.
function toFields(input: CreateLabTestRequest | UpdateLabTestRequest) {
  return {
    name: input.name,
    nameLocalPrs: input.nameLocalPrs ?? null,
    nameLocalPs: input.nameLocalPs ?? null,
    loincCode: input.loincCode ?? null,
    specimen: input.specimen ?? null,
    unit: input.unit ?? null,
    price: input.price ? new Prisma.Decimal(input.price) : null,
  };
}

@Injectable()
export class LabTestService {
  constructor(private readonly prisma: PrismaService) {}

  async list(facilityId: string): Promise<LabTestListResponse> {
    const tests = await this.prisma.db.labTest.findMany({
      where: { facilityId },
      orderBy: { code: 'asc' },
      select: LAB_TEST_SELECT,
    });
    return { tests: tests.map(toSummary) };
  }

  /**
   * The catalog a doctor may ORDER from — active tests only.
   *
   * Kept apart from `list()` because the two answer different questions for different
   * people: the manage screen lists everything, withdrawn tests included, so an admin can
   * bring one back; the order picker lists only what can actually be ordered today, so a
   * doctor is never offered a test the save would refuse. It is gated on `lab_order.create`
   * rather than `labtest.manage` for the same reason — the right to order implies the right
   * to see what is orderable, and the doctor holds the former, not the latter.
   */
  async listOrderable(facilityId: string): Promise<LabTestListResponse> {
    const tests = await this.prisma.db.labTest.findMany({
      where: { facilityId, isActive: true },
      orderBy: { name: 'asc' },
      select: LAB_TEST_SELECT,
    });
    return { tests: tests.map(toSummary) };
  }

  async create(facilityId: string, input: CreateLabTestRequest): Promise<LabTestSummary> {
    const clash = await this.prisma.db.labTest.findUnique({
      where: { facilityId_code: { facilityId, code: input.code } },
    });
    if (clash) {
      throw new ConflictException(`Lab test code '${input.code}' already exists`);
    }

    const created = await this.prisma.db.labTest.create({
      data: { facilityId, code: input.code, ...toFields(input) },
      select: LAB_TEST_SELECT,
    });
    return toSummary(created);
  }

  async update(
    facilityId: string,
    id: string,
    input: UpdateLabTestRequest,
  ): Promise<LabTestSummary> {
    await this.assertTestInFacility(facilityId, id);
    const updated = await this.prisma.db.labTest.update({
      where: { id },
      data: toFields(input),
      select: LAB_TEST_SELECT,
    });
    return toSummary(updated);
  }

  async setActive(
    facilityId: string,
    id: string,
    input: SetActiveRequest,
  ): Promise<LabTestSummary> {
    await this.assertTestInFacility(facilityId, id);
    const updated = await this.prisma.db.labTest.update({
      where: { id },
      data: { isActive: input.isActive },
      select: LAB_TEST_SELECT,
    });
    return toSummary(updated);
  }

  private async assertTestInFacility(facilityId: string, id: string): Promise<void> {
    const test = await this.prisma.db.labTest.findFirst({
      where: { id, facilityId },
      select: { id: true },
    });
    if (!test) {
      throw new NotFoundException('Lab test not found');
    }
  }
}
