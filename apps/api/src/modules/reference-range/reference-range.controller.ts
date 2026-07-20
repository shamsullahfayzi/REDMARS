import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
  createReferenceRangeRequestSchema,
  updateReferenceRangeRequestSchema,
  type ReferenceRangeListResponse,
  type ReferenceRangeSummary,
} from '@redmars/shared';
import type { AuthContext } from '../../auth/auth-context';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { ReferenceRangeService } from './reference-range.service';

/**
 * Reference ranges (task 2.8) — the normal-value bands nested under one lab test.
 * The testId comes from the route, so a range can only ever be attached to a test
 * the caller's facility owns (the service checks). Gated on labtest.manage, the
 * same permission as the test catalog these bands belong to — admin, and the lab
 * technician under R9.
 */
@Controller('lab-tests/:testId/ranges')
export class ReferenceRangeController {
  constructor(private readonly ranges: ReferenceRangeService) {}

  @RequirePermission('labtest.manage')
  @Get()
  list(@Req() req: Request, @Param('testId') testId: string): Promise<ReferenceRangeListResponse> {
    return this.ranges.list(this.auth(req).facilityId, testId);
  }

  @RequirePermission('labtest.manage')
  @Post()
  @HttpCode(201)
  create(
    @Req() req: Request,
    @Param('testId') testId: string,
    @Body() body: unknown,
  ): Promise<ReferenceRangeSummary> {
    const parsed = createReferenceRangeRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid reference range',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.ranges.create(this.auth(req).facilityId, testId, parsed.data);
  }

  @RequirePermission('labtest.manage')
  @Patch(':rangeId')
  update(
    @Req() req: Request,
    @Param('testId') testId: string,
    @Param('rangeId') rangeId: string,
    @Body() body: unknown,
  ): Promise<ReferenceRangeSummary> {
    const parsed = updateReferenceRangeRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid reference range',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.ranges.update(this.auth(req).facilityId, testId, rangeId, parsed.data);
  }

  @RequirePermission('labtest.manage')
  @Delete(':rangeId')
  remove(
    @Req() req: Request,
    @Param('testId') testId: string,
    @Param('rangeId') rangeId: string,
  ): Promise<ReferenceRangeListResponse> {
    return this.ranges.remove(this.auth(req).facilityId, testId, rangeId);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
