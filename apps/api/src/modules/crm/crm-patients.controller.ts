import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import {
  linkCrmPatientSchema,
  registerCrmPatientSchema,
  unlinkCrmPatientSchema,
} from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequiresModule } from '../../auth/decorators/requires-module.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { CrmRateLimitGuard } from './crm-rate-limit.guard';
import { CrmPatientsService } from './crm-patients.service';
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new BadRequestException('Confirm identity and duplicate review; check required fields.');
  return r.data;
}
function auth(req: Request) {
  if (!req.auth) throw new UnauthorizedException();
  return req.auth;
}
@Controller('crm/leads/:id/patient')
@RequiresModule('crm')
@UseGuards(CrmRateLimitGuard)
export class CrmPatientsController {
  constructor(private readonly patients: CrmPatientsService) {}
  @Get()
  @RequirePermission('crm.read')
  @AuditRead('CrmLeadPatient')
  detail(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.patients.detail(auth(req), id);
  }
  @Post('link')
  @RequirePermission('crm.patients.link')
  link(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.patients.change(auth(req), id, parse(linkCrmPatientSchema, body), 'link');
  }
  @Post('register')
  @RequirePermission('crm.patients.link')
  register(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.patients.change(auth(req), id, parse(registerCrmPatientSchema, body), 'register');
  }
  @Post('unlink')
  @RequirePermission('crm.patients.link')
  unlink(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.patients.change(auth(req), id, parse(unlinkCrmPatientSchema, body), 'unlink');
  }
}
