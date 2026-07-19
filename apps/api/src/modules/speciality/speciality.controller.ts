import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  createSpecialityRequestSchema,
  type SpecialityListResponse,
  type SpecialitySummary,
} from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { SpecialityService } from './speciality.service';

/**
 * Speciality lookup (task 2.2). Gated on practitioner.manage — there is no
 * separate speciality permission in the matrix, and specialities exist only to be
 * assigned to practitioners, so whoever manages practitioners manages these.
 *
 * A global lookup, so no facility scoping — but still admin-only, and the auth
 * guard is asserted so an unauthenticated call can never reach the service.
 */
@Controller('specialities')
export class SpecialityController {
  constructor(private readonly specialities: SpecialityService) {}

  @RequirePermission('practitioner.manage')
  @Get()
  list(@Req() req: Request): Promise<SpecialityListResponse> {
    this.assertAuth(req);
    return this.specialities.list();
  }

  @RequirePermission('practitioner.manage')
  @Post()
  @HttpCode(201)
  create(@Req() req: Request, @Body() body: unknown): Promise<SpecialitySummary> {
    this.assertAuth(req);
    const parsed = createSpecialityRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid speciality',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.specialities.create(parsed.data);
  }

  private assertAuth(req: Request): void {
    if (!req.auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
