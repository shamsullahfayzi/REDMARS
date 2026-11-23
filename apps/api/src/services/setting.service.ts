import { Injectable, BadRequestException } from '@nestjs/common';
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

  async branding(facilityId?: string) {
    const rows = await this.prisma.facility.findMany({
      where: facilityId ? { id: facilityId } : { isActive: true },
      take: 2,
      select: { name: true, logoPath: true },
    });
    // The login screen can identify a facility only on a single-facility installation.
    const facility = rows.length === 1 ? rows[0] : null;
    return {
      name: facility?.name ?? null,
      logo: facility?.logoPath?.startsWith('data:image/png;base64,') ? facility.logoPath : null,
    };
  }

  async setBranding(facilityId: string, name: string, logo?: string | null) {
    if (logo) {
      const png = Buffer.from(logo.slice('data:image/png;base64,'.length), 'base64');
      if (
        png.length < 45 ||
        png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
        png.subarray(12, 16).toString() !== 'IHDR' ||
        png.readUInt32BE(16) !== 96 ||
        png.readUInt32BE(20) !== 96 ||
        png.subarray(-8, -4).toString() !== 'IEND'
      )
        throw new BadRequestException('Invalid hospital logo');
    }
    await this.prisma.db.facility.update({
      where: { id: facilityId },
      data: { name, ...(logo !== undefined ? { logoPath: logo } : {}) },
    });
    return this.branding(facilityId);
  }

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
