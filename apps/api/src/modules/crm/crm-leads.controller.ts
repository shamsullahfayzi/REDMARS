import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import {
  createCrmLeadSchema,
  updateCrmLeadSchema,
  crmLeadQuerySchema,
  claimCrmLeadSchema,
} from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequiresModule } from '../../auth/decorators/requires-module.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { CrmRateLimitGuard } from './crm-rate-limit.guard';
import { CrmLeadsService } from './crm-leads.service';
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new BadRequestException({
      code: 'invalid_crm_lead',
      message: 'Check the required lead fields, qualification confirmations and closure reason.',
      errors: parsed.error.flatten().fieldErrors,
    });
  return parsed.data;
}
function auth(req: Request) {
  if (!req.auth) throw new UnauthorizedException();
  return req.auth;
}
@Controller('crm/leads')
@RequiresModule('crm')
@UseGuards(CrmRateLimitGuard)
export class CrmLeadsController {
  constructor(private readonly leads: CrmLeadsService) {}
  @Get()
  @RequirePermission('crm.read')
  @AuditRead('CrmLead')
  list(@Req() req: Request, @Query() query: unknown) {
    return this.leads.list(auth(req), parse(crmLeadQuerySchema, query));
  }
  @Get('options')
  @RequirePermission('crm.read')
  @AuditRead('CrmLeadOptions')
  options(@Req() req: Request) {
    return this.leads.options(auth(req));
  }
  @Get(':id')
  @RequirePermission('crm.read')
  @AuditRead('CrmLead')
  detail(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.leads.detail(auth(req), id);
  }
  @Post()
  @RequirePermission('crm.leads.write')
  create(@Req() req: Request, @Body() body: unknown) {
    return this.leads.create(auth(req), parse(createCrmLeadSchema, body));
  }
  @Put(':id')
  @RequirePermission('crm.leads.write')
  update(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.leads.update(auth(req), id, parse(updateCrmLeadSchema, body));
  }
  @Post(':id/claim')
  @RequirePermission('crm.leads.write')
  claim(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.leads.claim(auth(req), id, parse(claimCrmLeadSchema, body).expectedVersion);
  }
}
