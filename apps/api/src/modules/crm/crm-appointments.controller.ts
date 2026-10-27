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
import {
  createCrmAppointmentSchema,
  cancelCrmAppointmentSchema,
  crmAppointmentQuerySchema,
  crmAvailabilityQuerySchema,
} from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequiresModule } from '../../auth/decorators/requires-module.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { CrmRateLimitGuard } from './crm-rate-limit.guard';
import { CrmAppointmentsService } from './crm-appointments.service';
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success)
    throw new BadRequestException('Check the relationship, provider, date and duration.');
  return r.data;
}
function auth(r: Request) {
  if (!r.auth) throw new UnauthorizedException();
  return r.auth;
}
@Controller('crm/appointments')
@RequiresModule('crm')
@UseGuards(CrmRateLimitGuard)
export class CrmAppointmentsController {
  constructor(private readonly service: CrmAppointmentsService) {}
  @Get('options') @RequirePermission('crm.read') @AuditRead('CrmAppointment') options(
    @Req() r: Request,
  ) {
    return this.service.options(auth(r));
  }
  @Get('availability')
  @RequirePermission('crm.read')
  @AuditRead('CrmAppointmentAvailability')
  availability(@Req() r: Request, @Query() q: unknown) {
    return this.service.availability(auth(r), parse(crmAvailabilityQuerySchema, q));
  }
  @Get() @RequirePermission('crm.read') @AuditRead('CrmAppointment') list(
    @Req() r: Request,
    @Query() q: unknown,
  ) {
    return this.service.list(auth(r), parse(crmAppointmentQuerySchema, q));
  }
  @Post() @RequirePermission('crm.appointments.write') create(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    return this.service.create(auth(r), parse(createCrmAppointmentSchema, b));
  }
  @Post(':id/cancel') @RequirePermission('crm.appointments.write') cancel(
    @Req() r: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    return this.service.cancel(auth(r), id, parse(cancelCrmAppointmentSchema, b));
  }
}
