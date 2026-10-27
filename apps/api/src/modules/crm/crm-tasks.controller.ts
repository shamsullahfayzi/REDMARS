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
  createCrmTaskSchema,
  updateCrmTaskSchema,
  crmTaskQuerySchema,
  crmTaskVersionSchema,
  escalateCrmTaskSchema,
} from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequiresModule } from '../../auth/decorators/requires-module.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { CrmRateLimitGuard } from './crm-rate-limit.guard';
import { CrmTasksService } from './crm-tasks.service';
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new BadRequestException({
      code: 'invalid_crm_task',
      message: 'Check the task, owner, schedule, status and required outcome or reason.',
    });
  return r.data;
}
function auth(r: Request) {
  if (!r.auth) throw new UnauthorizedException();
  return r.auth;
}
@Controller('crm/tasks')
@RequiresModule('crm')
@UseGuards(CrmRateLimitGuard)
export class CrmTasksController {
  constructor(private readonly tasks: CrmTasksService) {}
  @Get() @RequirePermission('crm.read') @AuditRead('CrmTask') list(
    @Req() r: Request,
    @Query() q: unknown,
  ) {
    return this.tasks.list(auth(r), parse(crmTaskQuerySchema, q));
  }
  @Get('options') @RequirePermission('crm.read') @AuditRead('CrmTask') options(@Req() r: Request) {
    return this.tasks.options(auth(r));
  }
  @Get('follow-ups/:interactionId') @RequirePermission('crm.read') @AuditRead('CrmTask') followUps(
    @Req() r: Request,
    @Param('interactionId', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.followUps(auth(r), id);
  }
  @Get(':id') @RequirePermission('crm.read') @AuditRead('CrmTask') detail(
    @Req() r: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.detail(auth(r), id);
  }
  @Post() @RequirePermission('crm.tasks.write') create(@Req() r: Request, @Body() b: unknown) {
    return this.tasks.create(auth(r), parse(createCrmTaskSchema, b));
  }
  @Put(':id') @RequirePermission('crm.tasks.write') update(
    @Req() r: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    return this.tasks.update(auth(r), id, parse(updateCrmTaskSchema, b));
  }
  @Post(':id/claim') @RequirePermission('crm.tasks.write') claim(
    @Req() r: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    return this.tasks.action(
      auth(r),
      id,
      parse(crmTaskVersionSchema, b).expectedVersion,
      'claimed',
    );
  }
  @Post(':id/acknowledge') @RequirePermission('crm.tasks.write') acknowledge(
    @Req() r: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    return this.tasks.action(
      auth(r),
      id,
      parse(crmTaskVersionSchema, b).expectedVersion,
      'acknowledged',
    );
  }
  @Post(':id/escalate') @RequirePermission('crm.tasks.write') escalate(
    @Req() r: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    const v = parse(escalateCrmTaskSchema, b);
    return this.tasks.action(auth(r), id, v.expectedVersion, 'escalated', v.reason);
  }
}
