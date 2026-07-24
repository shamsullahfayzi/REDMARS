import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { tillReportQuerySchema } from '@redmars/shared';
import type { TillReportResponse } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuthContext } from '../../auth/auth-context';
import { TillService } from './till.service';

/**
 * Task 6.12 — the daily till reconciliation.
 *
 * Two doors onto the same report, because two different people close a till. The operator
 * counts their OWN drawer at closing — gated on `payment.receive`, the same grant that let
 * them take the money — and may never ask for another till. The oversight view, every till
 * at once, is `report.financial` (admin, management), the money-reports grant. Neither is
 * @RequiresModule: taking OPD and pharmacy cash is core, and Farhat runs both tills.
 */
@Controller('reports/till')
export class TillController {
  constructor(private readonly till: TillService) {}

  /** The caller's own drawer for the day. Never anyone else's — userId is forced to self. */
  @Get('mine')
  @RequirePermission('payment.receive')
  mine(@Req() req: Request, @Query('date') date?: string): Promise<TillReportResponse> {
    const parsed = tillReportQuerySchema.safeParse({ date });
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid till query',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const auth = this.auth(req);
    return this.till.report(auth.facilityId, parsed.data.date, auth.userId);
  }

  /** Every till (or one named), for oversight. The financial-reports grant. */
  @Get()
  @RequirePermission('report.financial')
  all(@Req() req: Request, @Query() rawQuery: unknown): Promise<TillReportResponse> {
    const parsed = tillReportQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid till query',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.till.report(this.auth(req).facilityId, parsed.data.date, parsed.data.userId);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
