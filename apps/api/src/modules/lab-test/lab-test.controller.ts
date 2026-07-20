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
  createLabTestRequestSchema,
  setActiveRequestSchema,
  updateLabTestRequestSchema,
  type LabTestListResponse,
  type LabTestSummary,
} from '@redmars/shared';
import type { AuthContext } from '../../auth/auth-context';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequiresModule } from '../../auth/decorators/requires-module.decorator';
import { LabTestService } from './lab-test.service';

/**
 * Lab test catalog (task 2.7). Gated on labtest.manage — held unconditionally by
 * admin, and by the lab technician under R9 ("propose additions"). R9 is a ⚠️ grant
 * the guard passes today, so a lab_tech reaches these routes; the approval workflow
 * that R9 describes is a later refinement, not built here.
 */
@RequiresModule('lab')
@Controller('lab-tests')
export class LabTestController {
  constructor(private readonly tests: LabTestService) {}

  @RequirePermission('labtest.manage')
  @Get()
  list(@Req() req: Request): Promise<LabTestListResponse> {
    return this.tests.list(this.auth(req).facilityId);
  }

  @RequirePermission('labtest.manage')
  @Post()
  @HttpCode(201)
  create(@Req() req: Request, @Body() body: unknown): Promise<LabTestSummary> {
    const parsed = createLabTestRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid lab test',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.tests.create(this.auth(req).facilityId, parsed.data);
  }

  @RequirePermission('labtest.manage')
  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<LabTestSummary> {
    const parsed = updateLabTestRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid lab test',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.tests.update(this.auth(req).facilityId, id, parsed.data);
  }

  @RequirePermission('labtest.manage')
  @Patch(':id/active')
  setActive(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<LabTestSummary> {
    const parsed = setActiveRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid request',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.tests.setActive(this.auth(req).facilityId, id, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
