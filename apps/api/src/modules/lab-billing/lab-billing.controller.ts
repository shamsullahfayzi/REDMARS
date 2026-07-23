import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { labChargesQuerySchema, payLabChargesRequestSchema } from '@redmars/shared';
import type { LabChargesResponse, PayLabChargesResponse } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequiresModule } from '../../auth/decorators/requires-module.decorator';
import { AuthContext } from '../../auth/auth-context';
import { LabBillingService } from './lab-billing.service';

/**
 * Reception's lab settlement — read a patient's lab charges, take payment per test.
 *
 * The desk's rights, not the bench's: reading is `invoice.read`, collecting is
 * `payment.receive` — the same permissions the reception check-in uses. Module-gated on the
 * lab, so a facility without it never reaches here.
 */
@RequiresModule('lab')
@Controller('lab-charges')
export class LabBillingController {
  constructor(private readonly billing: LabBillingService) {}

  @Get()
  @RequirePermission('invoice.read')
  charges(@Req() req: Request, @Query() rawQuery: unknown): Promise<LabChargesResponse> {
    const parsed = labChargesQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid lab charges query',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.billing.charges(this.auth(req).facilityId, parsed.data);
  }

  @Post('pay')
  @RequirePermission('payment.receive')
  pay(@Req() req: Request, @Body() body: unknown): Promise<PayLabChargesResponse> {
    const parsed = payLabChargesRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid lab payment',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const auth = this.auth(req);
    return this.billing.pay(auth.facilityId, auth.userId, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
