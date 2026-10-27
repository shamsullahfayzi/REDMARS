import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { createCrmCallSchema, completeCrmCallSchema, crmCallQuerySchema } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequiresModule } from '../../auth/decorators/requires-module.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { CrmRateLimitGuard } from './crm-rate-limit.guard';
import { CrmCallsService } from './crm-calls.service';
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new BadRequestException({
      code: 'invalid_crm_call',
      message: 'Check call direction, state, times, outcome and next action.',
    });
  return r.data;
}
function auth(req: Request) {
  if (!req.auth) throw new UnauthorizedException();
  return req.auth;
}
@Controller('crm/calls')
@RequiresModule('crm')
@UseGuards(CrmRateLimitGuard)
export class CrmCallsController {
  constructor(private readonly calls: CrmCallsService) {}
  @Get() @RequirePermission('crm.read') @AuditRead('CrmCall') list(
    @Req() req: Request,
    @Query() q: unknown,
  ) {
    return this.calls.list(auth(req), parse(crmCallQuerySchema, q));
  }
  @Get(':id') @RequirePermission('crm.read') @AuditRead('CrmCall') detail(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.calls.detail(auth(req), id);
  }
  @Post() @RequirePermission('crm.calls.write') create(@Req() req: Request, @Body() body: unknown) {
    return this.calls.create(auth(req), parse(createCrmCallSchema, body));
  }
  @Post(':id/complete') @RequirePermission('crm.calls.write') complete(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.calls.complete(auth(req), id, parse(completeCrmCallSchema, body));
  }
}
