import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { updateCrmSettingsSchema } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequiresModule } from '../../auth/decorators/requires-module.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { CrmService } from './crm.service';
import { CrmRateLimitGuard } from './crm-rate-limit.guard';

@Controller('crm')
@RequiresModule('crm')
@UseGuards(CrmRateLimitGuard)
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get('workspace')
  @RequirePermission('crm.read')
  @AuditRead('CrmWorkspace')
  workspace(@Req() req: Request) {
    if (!req.auth) throw new UnauthorizedException();
    return this.crm.workspace(req.auth);
  }

  @Put('settings')
  @RequirePermission('crm.configure')
  configure(@Req() req: Request, @Body() body: unknown) {
    if (!req.auth) throw new UnauthorizedException();
    const parsed = updateCrmSettingsSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'invalid_crm_settings',
        message: 'Check the CRM settings and try again.',
        errors: parsed.error.flatten().fieldErrors,
      });
    return this.crm.configure(req.auth.facilityId, parsed.data);
  }
}
