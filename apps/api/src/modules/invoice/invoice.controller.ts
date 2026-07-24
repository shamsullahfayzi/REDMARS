import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { invoiceListQuerySchema } from '@redmars/shared';
import type { InvoiceDetail, InvoiceListResponse, VisitBillsResponse } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { AuthContext } from '../../auth/auth-context';
import { InvoiceService } from './invoice.service';

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
  constructor(private readonly invoices: InvoiceService) {}

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

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
