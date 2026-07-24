import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { invoiceListQuerySchema, recordPaymentRequestSchema } from '@redmars/shared';
import type {
  InvoiceDetail,
  InvoiceListResponse,
  RecordPaymentResponse,
  VisitBillsResponse,
} from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { AuthContext } from '../../auth/auth-context';
import { InvoiceService } from './invoice.service';
import { PaymentService } from './payment.service';

/**
 * Task 6.1 — the invoice register and one bill in full.
 *
 * No @RequiresModule: the same reasoning as the reception desk (3.6). Billing-as-a-module
 * gates panels and statements, not the act of reading an OPD bill; Farhat has it off, and a
 * tag here would 403 the desk that raised the invoice in the first place. `invoice.read`
 * (admin, receptionist, pharmacist, management) is the gate.
 */
@Controller('invoices')
export class InvoiceController {
  constructor(
    private readonly invoices: InvoiceService,
    private readonly payments: PaymentService,
  ) {}

  @Get()
  @RequirePermission('invoice.read')
  list(@Req() req: Request, @Query() rawQuery: unknown): Promise<InvoiceListResponse> {
    const parsed = invoiceListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid invoice query',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.invoices.list(this.auth(req).facilityId, parsed.data);
  }

  /**
   * Task 6.2 — every bill one visit gathered, across the three tills. Declared before the
   * `:id` detail below only for readability; `by-visit/:visitId` is two segments and never
   * collides with the single-segment `:id`. Same `invoice.read` gate — the pharmacist reads
   * their own line here too — and audited, since it opens a patient's whole visit ledger.
   */
  @Get('by-visit/:visitId')
  @RequirePermission('invoice.read')
  @AuditRead('Invoice')
  byVisit(
    @Req() req: Request,
    @Param('visitId', ParseUUIDPipe) visitId: string,
  ): Promise<VisitBillsResponse> {
    return this.invoices.byVisit(this.auth(req).facilityId, visitId);
  }

  @Get(':id')
  @RequirePermission('invoice.read')
  @AuditRead('Invoice')
  detail(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string): Promise<InvoiceDetail> {
    return this.invoices.detail(this.auth(req).facilityId, id);
  }

  /**
   * Task 6.3 — take a payment against a bill: cash in full, or an instalment, each with its
   * own receipt number. `payment.receive` (receptionist, pharmacist) — the same gate the
   * reception check-in and the lab counter take money under. Not @AuditRead: this WRITES,
   * and the Payment row it appends is itself the trail, with who took it and when.
   */
  @Post(':id/payments')
  @RequirePermission('payment.receive')
  @HttpCode(200)
  pay(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<RecordPaymentResponse> {
    const parsed = recordPaymentRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid payment',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const auth = this.auth(req);
    return this.payments.pay(auth.facilityId, auth.userId, id, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
