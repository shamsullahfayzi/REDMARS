import { Injectable } from '@nestjs/common';
import { ModuleKey } from '@prisma/client';
import type {
  FacilityModuleListResponse,
  FacilityModuleSummary,
  ModuleKey as ModuleKeyContract,
} from '@redmars/shared';
import { MODULE_KEYS } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

type ModuleRow = { module: ModuleKey; enabled: boolean; enabledAt: Date | null };

@Injectable()
export class FacilityModuleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The full set of toggleable modules for a facility, always all of them. A module
   * with no row yet reads as off, so the admin screen is a stable list of switches
   * whether or not the facility has ever been seeded.
   */
  async list(facilityId: string): Promise<FacilityModuleListResponse> {
    const rows = await this.prisma.db.facilityModule.findMany({ where: { facilityId } });
    const byModule = new Map(rows.map((r) => [r.module, r]));
    const modules: FacilityModuleSummary[] = MODULE_KEYS.map((module) => {
      const row = byModule.get(module);
      return {
        module,
        enabled: row?.enabled ?? false,
        enabledAt: row?.enabledAt?.toISOString() ?? null,
      };
    });
    return { modules };
  }

  /**
   * Turn a module on or off. Upserts so a facility with no row yet still toggles.
   * enabledAt is stamped when switching on and cleared when switching off — the
   * audit log holds the full history; this column is just "since when, if on".
   *
   * This records the flag only. The 403 that a disabled module produces on its own
   * endpoints is the ModuleGuard's job (task 2.13), not this write's.
   */
  async setEnabled(
    facilityId: string,
    module: ModuleKeyContract,
    enabled: boolean,
  ): Promise<FacilityModuleSummary> {
    const enabledAt = enabled ? new Date() : null;
    const row: ModuleRow = await this.prisma.db.facilityModule.upsert({
      where: { facilityId_module: { facilityId, module } },
      update: { enabled, enabledAt },
      create: { facilityId, module, enabled, enabledAt },
    });
    return {
      module: row.module,
      enabled: row.enabled,
      enabledAt: row.enabledAt?.toISOString() ?? null,
    };
  }

  /**
   * Is one module on for a facility? The ModuleGuard's read (task 2.13). A missing
   * row means never enabled, so it reads as off — the same default as the column.
   */
  async isEnabled(facilityId: string, module: ModuleKeyContract): Promise<boolean> {
    const row = await this.prisma.db.facilityModule.findUnique({
      where: { facilityId_module: { facilityId, module } },
      select: { enabled: true },
    });
    return row?.enabled ?? false;
  }

  /**
   * The enabled module keys for a facility — what /auth/me hands the client so the
   * nav can hide the modules that are off (courtesy; the guard is the control).
   */
  async enabledKeys(facilityId: string): Promise<ModuleKeyContract[]> {
    const rows = await this.prisma.db.facilityModule.findMany({
      where: { facilityId, enabled: true },
      select: { module: true },
    });
    return rows.map((r) => r.module);
  }
}
