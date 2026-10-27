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
  createCrmContactSchema,
  updateCrmContactSchema,
  crmContactQuerySchema,
  createCrmRelationshipSchema,
  crmRelationshipFieldsSchema,
  recordCrmConsentSchema,
  verifyCrmCallerSchema,
} from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequiresModule } from '../../auth/decorators/requires-module.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { CrmRateLimitGuard } from './crm-rate-limit.guard';
import { CrmContactsService } from './crm-contacts.service';

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new BadRequestException({
      code: 'invalid_crm_contact',
      message: 'Check the required fields and confirmations.',
      errors: parsed.error.flatten().fieldErrors,
    });
  return parsed.data;
}
function auth(req: Request) {
  if (!req.auth) throw new UnauthorizedException();
  return req.auth;
}

@Controller('crm/contacts')
@RequiresModule('crm')
@UseGuards(CrmRateLimitGuard)
export class CrmContactsController {
  constructor(private readonly contacts: CrmContactsService) {}
  @Get()
  @RequirePermission('crm.read')
  @AuditRead('CrmContact')
  list(@Req() req: Request, @Query() query: unknown) {
    return this.contacts.list(auth(req), parse(crmContactQuerySchema, query));
  }
  @Get(':id')
  @RequirePermission('crm.read')
  @AuditRead('CrmContact')
  detail(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.contacts.detail(auth(req), id);
  }
  @Post()
  @RequirePermission('crm.contacts.write')
  create(@Req() req: Request, @Body() body: unknown) {
    return this.contacts.create(auth(req), parse(createCrmContactSchema, body));
  }
  @Put(':id')
  @RequirePermission('crm.contacts.write')
  update(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.contacts.update(auth(req), id, parse(updateCrmContactSchema, body));
  }
  @Post(':id/relationships')
  @RequirePermission('crm.contacts.authorize')
  link(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.contacts.link(auth(req), id, parse(createCrmRelationshipSchema, body));
  }
  @Put(':id/relationships/:linkId')
  @RequirePermission('crm.contacts.authorize')
  authority(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Body() body: unknown,
  ) {
    return this.contacts.authority(auth(req), id, linkId, parse(crmRelationshipFieldsSchema, body));
  }
  @Post(':id/consents')
  @RequirePermission('crm.contacts.write')
  consent(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.contacts.consent(auth(req), id, parse(recordCrmConsentSchema, body));
  }
  @Post(':id/relationships/:linkId/verify')
  @RequirePermission('crm.contacts.write')
  verify(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Body() body: unknown,
  ) {
    return this.contacts.verify(auth(req), id, linkId, parse(verifyCrmCallerSchema, body));
  }
}
