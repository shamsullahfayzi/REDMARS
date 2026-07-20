import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateLabPanelRequest,
  LabPanelListResponse,
  LabPanelSummary,
  SetActiveRequest,
  SetLabPanelTestsRequest,
  UpdateLabPanelRequest,
} from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

const LAB_PANEL_SELECT = {
  id: true,
  code: true,
  name: true,
  price: true,
  isActive: true,
  tests: { select: { testId: true } },
} as const;

type LabPanelRow = {
  id: string;
  code: string;
  name: string;
  price: Prisma.Decimal | null;
  isActive: boolean;
  tests: Array<{ testId: string }>;
};

function toSummary(row: LabPanelRow): LabPanelSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    price: row.price ? row.price.toFixed(2) : null,
    isActive: row.isActive,
    testIds: row.tests.map((t) => t.testId),
  };
}

@Injectable()
export class LabPanelService {
  constructor(private readonly prisma: PrismaService) {}

  async list(facilityId: string): Promise<LabPanelListResponse> {
    const panels = await this.prisma.db.labPanel.findMany({
      where: { facilityId },
      orderBy: { code: 'asc' },
      select: LAB_PANEL_SELECT,
    });
    return { panels: panels.map(toSummary) };
  }

  async create(facilityId: string, input: CreateLabPanelRequest): Promise<LabPanelSummary> {
    await this.assertTestsInFacility(facilityId, input.testIds);

    const clash = await this.prisma.db.labPanel.findUnique({
      where: { facilityId_code: { facilityId, code: input.code } },
    });
    if (clash) {
      throw new ConflictException(`Lab panel code '${input.code}' already exists`);
    }

    // One transaction: the panel and its member links land together or not at all.
    // Each membership is its own create (not createMany) so every link is an
    // attributable audit row — same reason a practitioner's departments are.
    const created = await this.prisma.db.$transaction(async (tx) => {
      const panel = await tx.labPanel.create({
        data: {
          facilityId,
          code: input.code,
          name: input.name,
          price: input.price ? new Prisma.Decimal(input.price) : null,
        },
      });
      for (const testId of dedupe(input.testIds)) {
        await tx.labPanelTest.create({ data: { panelId: panel.id, testId } });
      }
      return panel;
    });

    return this.getSummaryOrThrow(created.id);
  }

  async update(
    facilityId: string,
    id: string,
    input: UpdateLabPanelRequest,
  ): Promise<LabPanelSummary> {
    await this.assertPanelInFacility(facilityId, id);
    await this.prisma.db.labPanel.update({
      where: { id },
      data: {
        name: input.name,
        price: input.price ? new Prisma.Decimal(input.price) : null,
      },
    });
    return this.getSummaryOrThrow(id);
  }

  async setActive(
    facilityId: string,
    id: string,
    input: SetActiveRequest,
  ): Promise<LabPanelSummary> {
    await this.assertPanelInFacility(facilityId, id);
    await this.prisma.db.labPanel.update({
      where: { id },
      data: { isActive: input.isActive },
    });
    return this.getSummaryOrThrow(id);
  }

  /**
   * Replaces a panel's whole test set — the point of the task ("LFT expands to its
   * member tests"). Delete-then-recreate inside one transaction so a half-changed
   * membership can never be observed.
   */
  async setTests(
    facilityId: string,
    id: string,
    input: SetLabPanelTestsRequest,
  ): Promise<LabPanelSummary> {
    await this.assertPanelInFacility(facilityId, id);
    await this.assertTestsInFacility(facilityId, input.testIds);

    await this.prisma.db.$transaction(async (tx) => {
      await tx.labPanelTest.deleteMany({ where: { panelId: id } });
      for (const testId of dedupe(input.testIds)) {
        await tx.labPanelTest.create({ data: { panelId: id, testId } });
      }
    });

    return this.getSummaryOrThrow(id);
  }

  // --- validation helpers ---------------------------------------------------

  /**
   * Every member test must exist in this facility. A panel and its tests are both
   * facility-scoped, but the LabPanelTest join carries no facilityId of its own, so
   * the guard against pulling in another tenant's test lives here.
   */
  private async assertTestsInFacility(facilityId: string, testIds: string[]): Promise<void> {
    if (testIds.length === 0) return;
    const unique = dedupe(testIds);
    const found = await this.prisma.db.labTest.count({
      where: { id: { in: unique }, facilityId },
    });
    if (found !== unique.length) {
      throw new BadRequestException('One or more tests do not exist in this facility');
    }
  }

  private async assertPanelInFacility(facilityId: string, id: string): Promise<void> {
    const panel = await this.prisma.db.labPanel.findFirst({
      where: { id, facilityId },
      select: { id: true },
    });
    if (!panel) {
      throw new NotFoundException('Lab panel not found');
    }
  }

  private async getSummaryOrThrow(id: string): Promise<LabPanelSummary> {
    const full = await this.prisma.db.labPanel.findUniqueOrThrow({
      where: { id },
      select: LAB_PANEL_SELECT,
    });
    return toSummary(full);
  }
}

// A caller sending the same test id twice must not slip past the count check by
// coincidence, nor create two identical join rows.
function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}
