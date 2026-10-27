import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CRM_DEFAULT_SETTINGS,
  crmSettingsResponseSchema,
  type UpdateCrmSettings,
  type CrmWorkspace,
} from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../auth/auth-context';

const SETTINGS_KEY = 'crm.settings';

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  async workspace(auth: AuthContext): Promise<CrmWorkspace> {
    const [facility, row] = await Promise.all([
      this.prisma.db.facility.findUniqueOrThrow({
        where: { id: auth.facilityId },
        select: { name: true, timezone: true },
      }),
      this.prisma.db.setting.findUnique({
        where: { facilityId_key: { facilityId: auth.facilityId, key: SETTINGS_KEY } },
      }),
    ]);
    return {
      facilityName: facility.name,
      timezone: facility.timezone,
      canConfigure: auth.permissions.has('crm.configure'),
      settings: crmSettingsResponseSchema.parse(
        row?.value ?? { ...CRM_DEFAULT_SETTINGS, version: 0 },
      ),
    };
  }

  async configure(facilityId: string, input: UpdateCrmSettings) {
    try {
      return await this.prisma.db.$transaction(async (tx) => {
        const where = { facilityId_key: { facilityId, key: SETTINGS_KEY } };
        const row = await tx.setting.findUnique({ where });
        const current = crmSettingsResponseSchema.parse(
          row?.value ?? { ...CRM_DEFAULT_SETTINGS, version: 0 },
        );
        if (input.expectedVersion !== current.version) throw this.conflict();
        const { expectedVersion, ...settings } = input;
        const value = {
          ...settings,
          interactionRetentionDays:
            settings.interactionRetentionDays ?? current.interactionRetentionDays,
          version: expectedVersion + 1,
        };
        // Existing audited Setting model and serializable transaction protect both
        // persistence and before/after history. No duplicate CRM settings database.
        await tx.setting.upsert({
          where,
          create: { facilityId, key: SETTINGS_KEY, value },
          update: { value },
        });
        return value;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw this.conflict();
      throw error;
    }
  }

  private conflict() {
    return new ConflictException({
      code: 'crm_settings_conflict',
      message: 'CRM settings changed at another workstation. Reload before saving.',
    });
  }
}
