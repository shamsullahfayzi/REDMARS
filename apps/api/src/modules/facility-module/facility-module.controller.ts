import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  moduleKeySchema,
  updateFacilityModuleRequestSchema,
  type FacilityModuleListResponse,
  type FacilityModuleSummary,
} from '@redmars/shared';
import type { AuthContext } from '../../auth/auth-context';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { FacilityModuleService } from './facility-module.service';

/**
 * Admin toggles for the facility's optional modules (task 2.12). Gated on
 * facility.manage — the same admin-only permission that governs the rest of facility
 * configuration. Scoped to the caller's own facility; there is no cross-facility view.
 *
 * OPD is unreachable here by construction: the :module param must parse as a
 * ModuleKey, and OPD is not one — so a request to toggle the core off is a 400, not
 * a special case to remember.
 */
@Controller('facility-modules')
export class FacilityModuleController {
  constructor(private readonly modules: FacilityModuleService) {}

  @RequirePermission('facility.manage')
  @Get()
  list(@Req() req: Request): Promise<FacilityModuleListResponse> {
    const auth = this.auth(req);
    return this.modules.list(auth.facilityId);
  }

  @RequirePermission('facility.manage')
  @Patch(':module')
  setEnabled(
    @Req() req: Request,
    @Param('module') moduleParam: string,
    @Body() body: unknown,
  ): Promise<FacilityModuleSummary> {
    const auth = this.auth(req);
    const module = moduleKeySchema.safeParse(moduleParam);
    if (!module.success) {
      // Not a toggleable module (OPD, or a typo). Deny loudly rather than create a
      // row under a bogus key.
      throw new BadRequestException(`Unknown module: ${moduleParam}`);
    }
    const parsed = updateFacilityModuleRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid module update',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.modules.setEnabled(auth.facilityId, module.data, parsed.data.enabled);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
