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
  createLabPanelRequestSchema,
  setActiveRequestSchema,
  setLabPanelTestsRequestSchema,
  updateLabPanelRequestSchema,
  type LabPanelListResponse,
  type LabPanelSummary,
} from '@redmars/shared';
import type { AuthContext } from '../../auth/auth-context';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequiresModule } from '../../auth/decorators/requires-module.decorator';
import { LabPanelService } from './lab-panel.service';

/**
 * Lab panel catalog (task 2.7). Admin-only — panel.manage is granted to admin
 * alone in the matrix. A panel groups lab tests for one-click ordering.
 */
@RequiresModule('lab')
@Controller('lab-panels')
export class LabPanelController {
  constructor(private readonly panels: LabPanelService) {}

  @RequirePermission('panel.manage')
  @Get()
  list(@Req() req: Request): Promise<LabPanelListResponse> {
    return this.panels.list(this.auth(req).facilityId);
  }

  @RequirePermission('panel.manage')
  @Post()
  @HttpCode(201)
  create(@Req() req: Request, @Body() body: unknown): Promise<LabPanelSummary> {
    const parsed = createLabPanelRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid lab panel',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.panels.create(this.auth(req).facilityId, parsed.data);
  }

  @RequirePermission('panel.manage')
  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<LabPanelSummary> {
    const parsed = updateLabPanelRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid lab panel',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.panels.update(this.auth(req).facilityId, id, parsed.data);
  }

  @RequirePermission('panel.manage')
  @Patch(':id/active')
  setActive(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<LabPanelSummary> {
    const parsed = setActiveRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid request',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.panels.setActive(this.auth(req).facilityId, id, parsed.data);
  }

  @RequirePermission('panel.manage')
  @Put(':id/tests')
  setTests(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<LabPanelSummary> {
    // PUT, not PATCH: this REPLACES the whole test set, it does not merge.
    const parsed = setLabPanelTestsRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid request',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.panels.setTests(this.auth(req).facilityId, id, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
