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
 * Its own permissions (`lab_charge.read` / `lab_charge.collect`), not `invoice.read` /
 * `payment.receive`: those two are the reception desk's general till and a pharmacist holds
 * both unconditionally, but a lab bill is not a pharmacist's to see at all (R12) — a
 * permission they hold generally cannot be the gate on a door they must not walk through.
 * Module-gated on the lab, so a facility without it never reaches here.
 */
@RequiresModule('lab')
@Controller('lab-charges')
export class LabBillingController {
  constructor(private readonly billing: LabBillingService) {}

  @Get()
  @RequirePermission('lab_charge.read')
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
  @RequirePermission('lab_charge.collect')
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
