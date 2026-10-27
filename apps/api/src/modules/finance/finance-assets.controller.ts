import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import * as c from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequiresModule } from '../../auth/decorators/requires-module.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { FinanceAssetsService } from './finance-assets.service';
function parse<T>(schema: z.ZodType<T>, body: unknown) {
  const r = schema.safeParse(body);
  if (!r.success)
    throw new BadRequestException({
      message: 'Invalid asset/budget request',
      errors: r.error.flatten(),
    });
  return r.data;
}
@Controller('finance/assets')
@RequiresModule('finance')
export class FinanceAssetsController {
  constructor(private readonly service: FinanceAssetsService) {}
  private actor(req: Request) {
    if (!req.auth) throw new UnauthorizedException();
    return { facilityId: req.auth.facilityId, userId: req.auth.userId };
  }
  @Get()
  @RequirePermission('finance.read')
  @AuditRead('FinanceAssets')
  workspace(@Req() req: Request) {
    return this.service.workspace(this.actor(req).facilityId);
  }
  @Get('journals/:id/source')
  @RequirePermission('finance.read')
  @AuditRead('FinanceAssetSource')
  source(@Req() req: Request, @Param('id') id: string) {
    return this.service.source(this.actor(req).facilityId, id);
  }
  @Post()
  @RequirePermission('finance.write')
  create(@Req() req: Request, @Body() body: unknown) {
    return this.service.create(this.actor(req), parse(c.assetInputSchema, body));
  }
  @Post('depreciation')
  @RequirePermission('finance.write')
  generate(@Req() req: Request, @Body() body: unknown) {
    return this.service.generate(this.actor(req), parse(c.assetRunSchema, body));
  }
  @Post(':id/disposal')
  @RequirePermission('finance.write')
  dispose(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.service.dispose(this.actor(req), id, parse(c.assetDisposeSchema, body));
  }
  @Post('transfers')
  @RequirePermission('finance.write')
  transfer(@Req() req: Request, @Body() body: unknown) {
    return this.service.transfer(this.actor(req), parse(c.transferInputSchema, body));
  }
  @Post('budgets')
  @RequirePermission('finance.configure')
  budget(@Req() req: Request, @Body() body: unknown) {
    return this.service.budget(this.actor(req), parse(c.budgetInputSchema, body));
  }
  @Get('budgets')
  @RequirePermission('finance.read')
  @AuditRead('FinanceBudget')
  report(@Req() req: Request, @Query() query: unknown) {
    return this.service.report(this.actor(req).facilityId, parse(c.budgetQuerySchema, query).year);
  }
}
