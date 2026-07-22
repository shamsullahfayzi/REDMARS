import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { createTemplateRequestSchema, templateListQuerySchema } from '@redmars/shared';
import type { Template, TemplateListResponse } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuthContext } from '../../auth/auth-context';
import { TemplateService } from './template.service';

/**
 * Task 4.4 — the saved phrases a consultation is typed from.
 *
 * No @AuditRead: a template holds no patient data. R1 audits reads of RECORDS, and
 * logging every time a doctor opened a list of stock phrases is exactly the flood the
 * opt-in design exists to prevent.
 */
@Controller('templates')
export class TemplateController {
  constructor(private readonly templates: TemplateService) {}

  @Get()
  @RequirePermission('template.read')
  list(@Req() req: Request, @Query() query: unknown): Promise<TemplateListResponse> {
    const parsed = templateListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid template filter',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    return this.templates.list(auth.facilityId, auth.userId, parsed.data);
  }

  /**
   * Gated on `template.manage.own`. Saving a SHARED one needs `template.manage.shared`
   * as well, which the service checks — one route, one guard, and the conditional second
   * permission enforced where the request that needs it can be seen.
   */
  @Post()
  @RequirePermission('template.manage.own')
  @HttpCode(201)
  create(@Req() req: Request, @Body() body: unknown): Promise<Template> {
    const parsed = createTemplateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid template',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    return this.templates.create(auth.facilityId, auth.userId, auth.permissions, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
