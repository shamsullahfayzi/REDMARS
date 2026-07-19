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
  createDepartmentRequestSchema,
  setDepartmentActiveRequestSchema,
  type DepartmentListResponse,
  type DepartmentSummary,
} from '@redmars/shared';
import type { AuthContext } from '../../auth/auth-context';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { DepartmentService } from './department.service';

/**
 * Admin-only department master data (task 2.1). Every route names one permission,
 * held only by admin; there is no @Public and no unguarded route, so a new
 * endpoint here is denied to everyone until it declares what it needs.
 */
@Controller('departments')
export class DepartmentController {
  constructor(private readonly departments: DepartmentService) {}

  @RequirePermission('department.manage')
  @Get()
  list(@Req() req: Request): Promise<DepartmentListResponse> {
    return this.departments.list(this.auth(req).facilityId);
  }

  @RequirePermission('department.manage')
  @Post()
  @HttpCode(201)
  create(@Req() req: Request, @Body() body: unknown): Promise<DepartmentSummary> {
    // Parsed, not trusted: @Body() is unknown because the type is gone at runtime.
    const parsed = createDepartmentRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid department',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.departments.create(this.auth(req).facilityId, parsed.data);
  }

  @RequirePermission('department.manage')
  @Patch(':id/active')
  setActive(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DepartmentSummary> {
    const parsed = setDepartmentActiveRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid request',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.departments.setActive(this.auth(req).facilityId, id, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
