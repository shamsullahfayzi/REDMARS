import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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

  /**
   * Gated on `template.manage.own`, with ownership decided in the service: your own goes,
   * a shared one needs `template.manage.shared`, and a colleague's private one answers 404
   * — whether another doctor has a template by that name is not this caller's to learn.
   *
   * Returns the remaining list of the same type, which is this codebase's DELETE
   * convention and not a preference: `apiDelete` on the browser side takes a schema and
   * parses the body unconditionally, so a 204 would throw in the client rather than
   * resolve. The convention already decided this; the endpoint follows it.
   */
  @Delete(':id')
  @RequirePermission('template.manage.own')
  remove(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TemplateListResponse> {
    const auth = this.auth(req);
    return this.templates.remove(auth.facilityId, auth.userId, auth.permissions, id);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
