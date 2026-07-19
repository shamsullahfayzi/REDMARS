import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  createPractitionerRequestSchema,
  setPractitionerActiveRequestSchema,
  setPractitionerDepartmentsRequestSchema,
  type PractitionerListResponse,
  type PractitionerSummary,
} from '@redmars/shared';
import type { AuthContext } from '../../auth/auth-context';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PractitionerService } from './practitioner.service';

/**
 * Admin-only practitioner master data (task 2.2). Every route names
 * practitioner.manage; no @Public, no unguarded route.
 */
@Controller('practitioners')
export class PractitionerController {
  constructor(private readonly practitioners: PractitionerService) {}

  @RequirePermission('practitioner.manage')
  @Get()
  list(@Req() req: Request): Promise<PractitionerListResponse> {
    return this.practitioners.list(this.auth(req).facilityId);
  }

  @RequirePermission('practitioner.manage')
  @Post()
  @HttpCode(201)
  create(@Req() req: Request, @Body() body: unknown): Promise<PractitionerSummary> {
    const parsed = createPractitionerRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid practitioner',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.practitioners.create(this.auth(req).facilityId, parsed.data);
  }

  @RequirePermission('practitioner.manage')
  @Patch(':id/active')
  setActive(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<PractitionerSummary> {
    const parsed = setPractitionerActiveRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid request',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.practitioners.setActive(this.auth(req).facilityId, id, parsed.data);
  }

  @RequirePermission('practitioner.manage')
  @Put(':id/departments')
  setDepartments(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<PractitionerSummary> {
    // PUT, not PATCH: this REPLACES the whole department set, it does not merge.
    const parsed = setPractitionerDepartmentsRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid request',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.practitioners.setDepartments(this.auth(req).facilityId, id, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
