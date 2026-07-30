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
import {
  applyDiscountRequestSchema,
  invoiceListQuerySchema,
  recordPaymentRequestSchema,
  refundPaymentRequestSchema,
} from '@redmars/shared';
import type {
  ApplyDiscountResponse,
  InvoiceDetail,
  InvoiceListResponse,
  RecordPaymentResponse,
  RefundPaymentResponse,
  VisitBillsResponse,
} from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { AuthContext } from '../../auth/auth-context';
import { DiscountService } from './discount.service';
import { InvoiceService } from './invoice.service';
import { PaymentService } from './payment.service';

/**
 * Task 6.1 — the invoice register and one bill in full.
 *
 * No @RequiresModule: the same reasoning as the reception desk (3.6). Billing-as-a-module
 * gates panels and statements, not the act of reading an OPD bill; Farhat has it off, and a
 * tag here would 403 the desk that raised the invoice in the first place.
 *
 * Task 6b.9 split the gate in two. `list` — the facility-wide register, browsable by day —
 * is `invoice.list` (admin, pharmacist, management); a receptionist reading it could back
 * into the hospital's revenue, which is not the front desk's to see. Every other route here
 * names one invoice or one visit the caller already reached through their own work, and
 * stays on the wider `invoice.read` (admin, receptionist, pharmacist, management).
 *
 * R12 narrows the pharmacist's grip on both further: a lab order's own bill is excluded
 * from whatever `invoice.read`/`invoice.list` would otherwise show them — see
 * InvoiceService.detail/list/byVisit for where that is actually enforced.
 */
@Controller('invoices')
export class InvoiceController {
  constructor(
    private readonly invoices: InvoiceService,
    private readonly payments: PaymentService,
    private readonly discounts: DiscountService,
  ) {}

  @Get()
  @RequirePermission('invoice.list')
  list(@Req() req: Request, @Query() rawQuery: unknown): Promise<InvoiceListResponse> {
    const parsed = invoiceListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid invoice query',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const auth = this.auth(req);
    return this.invoices.list(auth.facilityId, parsed.data, auth.permissions);
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
    const auth = this.auth(req);
    return this.invoices.byVisit(auth.facilityId, visitId, auth.permissions);
  }

  @Get(':id')
  @RequirePermission('invoice.read')
  @AuditRead('Invoice')
  detail(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string): Promise<InvoiceDetail> {
    const auth = this.auth(req);
    return this.invoices.detail(auth.facilityId, id, auth.permissions);
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

  /**
   * Task 6.6 — refund one payment, Rule R5. `payment.refund` (admin, receptionist,
   * pharmacist) opens the door; the same-day window is the service's to enforce, since the
   * guard cannot see when the payment was taken. The reversal rows carry their own author,
   * time and receipt, so the refund is logged by the write itself.
   */
  @Post(':id/payments/:paymentId/refund')
  @RequirePermission('payment.refund')
  @HttpCode(200)
  refund(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: unknown,
  ): Promise<RefundPaymentResponse> {
    const parsed = refundPaymentRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid refund',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const auth = this.auth(req);
    return this.payments.refund(
      auth.facilityId,
      auth.userId,
      auth.permissions,
      id,
      paymentId,
      parsed.data,
    );
  }

  /**
   * Task 6.4 — discount a bill after it was raised, Rule R10. `discount.apply` opens the
   * door (admin, receptionist, pharmacist); the 10% ceiling and the mandatory reason are the
   * service's to enforce, since the cap is a percentage of a subtotal no guard has seen. The
   * change is audited by the write itself — the invoice.update carries its own before/after.
   */
  @Post(':id/discount')
  @RequirePermission('discount.apply')
  @HttpCode(200)
  discount(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<ApplyDiscountResponse> {
    const parsed = applyDiscountRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid discount',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const auth = this.auth(req);
    return this.discounts.apply(auth.facilityId, auth.userId, auth.permissions, id, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
