import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { saveLabOrderRequestSchema } from '@redmars/shared';
import type { LabOrderResponse } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequiresModule } from '../../auth/decorators/requires-module.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { AuthContext } from '../../auth/auth-context';
import { LabOrderService } from './lab-order.service';

/**
 * Phase 5 — the lab order, hung off the visit it was written in.
 *
 * PUT rather than POST: the whole order is saved at once and saving it twice must leave one
 * order (see the service). Both routes are gated on `lab_order.create` — the doctor alone.
 * Reading is scoped to the same permission on purpose: this endpoint exists to PLACE an
 * order from the consult screen, and the only person who prepares one is the one who may
 * write it. The lab's own read of the queue is a different route with a different
 * permission (`lab_order.read_queue`), built in the next slice.
 *
 * `@RequiresModule('lab')` — a facility that has not licensed the laboratory never reaches
 * here. The route param is `:id` so the audit interceptor can name the visit that was read.
 */
@RequiresModule('lab')
@Controller('visits/:id/lab-order')
export class LabOrderController {
  constructor(private readonly orders: LabOrderService) {}

  @Get()
  @RequirePermission('lab_order.create')
  @AuditRead('LabOrder')
  find(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) visitId: string,
  ): Promise<LabOrderResponse> {
    return this.orders.find(this.auth(req).facilityId, visitId);
  }

  @Put()
  @RequirePermission('lab_order.create')
  save(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) visitId: string,
    @Body() body: unknown,
  ): Promise<LabOrderResponse> {
    const parsed = saveLabOrderRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid lab order',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    return this.orders.save(auth.facilityId, auth.userId, visitId, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
