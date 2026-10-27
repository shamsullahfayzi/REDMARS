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
  createCrmInteractionSchema,
  correctCrmInteractionSchema,
  crmTimelineQuerySchema,
} from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequiresModule } from '../../auth/decorators/requires-module.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { CrmRateLimitGuard } from './crm-rate-limit.guard';
import { CrmTimelineService } from './crm-timeline.service';
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({
      code: 'invalid_crm_interaction',
      message: 'Check the interaction fields and subject references.',
    });
  return result.data;
}
function auth(req: Request) {
  if (!req.auth) throw new UnauthorizedException();
  return req.auth;
}
@Controller('crm/timeline')
@RequiresModule('crm')
@UseGuards(CrmRateLimitGuard)
export class CrmTimelineController {
  constructor(private readonly timeline: CrmTimelineService) {}
  @Get()
  @RequirePermission('crm.read')
  @AuditRead('CrmInteraction')
  list(@Req() req: Request, @Query() query: unknown) {
    return this.timeline.list(auth(req), parse(crmTimelineQuerySchema, query));
  }
  @Get(':id')
  @RequirePermission('crm.read')
  @AuditRead('CrmInteraction')
  detail(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.timeline.detail(auth(req), id);
  }
  @Post()
  @RequirePermission('crm.interactions.write')
  create(@Req() req: Request, @Body() body: unknown) {
    return this.timeline.create(auth(req), parse(createCrmInteractionSchema, body));
  }
  @Put(':id')
  @RequirePermission('crm.interactions.write')
  correct(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.timeline.correct(auth(req), id, parse(correctCrmInteractionSchema, body));
  }
}
