import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  createDrugRequestSchema,
  importDrugsRequestSchema,
  setDrugActiveRequestSchema,
  updateDrugRequestSchema,
  type DrugListResponse,
  type DrugSummary,
  type ImportDrugsResponse,
} from '@redmars/shared';
import type { AuthContext } from '../../auth/auth-context';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { DrugService } from './drug.service';

/**
 * Drug formulary (task 2.4). Gated on drug.manage — held by admin AND pharmacist,
 * so unlike the other master-data screens this one is not admin-only.
 */
@Controller('drugs')
export class DrugController {
  constructor(private readonly drugs: DrugService) {}

  @RequirePermission('drug.manage')
  @Get()
  list(@Req() req: Request, @Query('q') q?: string): Promise<DrugListResponse> {
    return this.drugs.list(this.auth(req).facilityId, q);
  }

  @RequirePermission('drug.manage')
  @Post()
  @HttpCode(201)
  create(@Req() req: Request, @Body() body: unknown): Promise<DrugSummary> {
    const parsed = createDrugRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid drug',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.drugs.create(this.auth(req).facilityId, parsed.data);
  }

  @RequirePermission('drug.manage')
  @Post('import')
  @HttpCode(200)
  import(@Req() req: Request, @Body() body: unknown): Promise<ImportDrugsResponse> {
    const parsed = importDrugsRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid import',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.drugs.importCsv(this.auth(req).facilityId, parsed.data.csv);
  }

  @RequirePermission('drug.manage')
  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DrugSummary> {
    const parsed = updateDrugRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid drug',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.drugs.update(this.auth(req).facilityId, id, parsed.data);
  }

  @RequirePermission('drug.manage')
  @Patch(':id/active')
  setActive(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DrugSummary> {
    const parsed = setDrugActiveRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid request',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.drugs.setActive(this.auth(req).facilityId, id, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
