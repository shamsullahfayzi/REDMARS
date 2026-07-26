import { Injectable } from '@nestjs/common';
import { DISCOUNT_MAX_PERCENT_DEFAULT } from '@redmars/shared';
import { PrismaService } from '../prisma/prisma.service';

const DISCOUNT_MAX_PERCENT_KEY = 'discount.max_percent';

/**
 * Task 6b.1 — facility-scoped settings, backed by the `Setting` table that has existed
 * since Phase 0 with nothing writing to it. A missing row reads as the feature's own
 * default, so a facility that never opens the settings screen behaves exactly as before.
 *
 * Kept narrow to the one setting that exists rather than built as a general framework
 * ahead of a second one turning up.
 */
@Injectable()
export class SettingService {
  constructor(private readonly prisma: PrismaService) {}

  async getDiscountMaxPercent(facilityId: string): Promise<number> {
    const row = await this.prisma.db.setting.findUnique({
      where: { facilityId_key: { facilityId, key: DISCOUNT_MAX_PERCENT_KEY } },
      select: { value: true },
    });
    const value = row?.value;
    return typeof value === 'number' ? value : DISCOUNT_MAX_PERCENT_DEFAULT;
  }

  async setDiscountMaxPercent(facilityId: string, maxPercent: number): Promise<number> {
    await this.prisma.db.setting.upsert({
      where: { facilityId_key: { facilityId, key: DISCOUNT_MAX_PERCENT_KEY } },
      update: { value: maxPercent },
      create: { facilityId, key: DISCOUNT_MAX_PERCENT_KEY, value: maxPercent },
    });
    return maxPercent;
  }
}
