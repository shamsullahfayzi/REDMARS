import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  createServiceRequestSchema,
  setServiceActiveRequestSchema,
  updateServiceRequestSchema,
  type ServiceListResponse,
  type ServiceSummary,
} from '@redmars/shared';
import type { AuthContext } from '../../auth/auth-context';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { ServiceCatalogService } from './service.service';

/**
 * Admin-only service catalogue (task 2.3). Gated on service.manage.
 *
 * Note: changing a fee also runs through service.manage here. There is a separate
 * price.change permission in the matrix for when a price edit deserves its own
 * route and tighter audit — that is a later refinement; for 2.3 the CRUD carries
 * the fee.
 */
@Controller('services')
export class ServiceController {
  constructor(private readonly services: ServiceCatalogService) {}

  @RequirePermission('service.manage')
  @Get()
  list(@Req() req: Request): Promise<ServiceListResponse> {
    return this.services.list(this.auth(req).facilityId);
  }

  @RequirePermission('service.manage')
  @Post()
  @HttpCode(201)
  create(@Req() req: Request, @Body() body: unknown): Promise<ServiceSummary> {
    const parsed = createServiceRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid service',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.services.create(this.auth(req).facilityId, parsed.data);
  }

  @RequirePermission('service.manage')
  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ServiceSummary> {
    const parsed = updateServiceRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid service',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.services.update(this.auth(req).facilityId, id, parsed.data);
  }

  @RequirePermission('service.manage')
  @Patch(':id/active')
  setActive(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ServiceSummary> {
    const parsed = setServiceActiveRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid request',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.services.setActive(this.auth(req).facilityId, id, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
