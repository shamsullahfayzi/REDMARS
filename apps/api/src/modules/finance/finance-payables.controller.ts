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
import { FinancePayablesService } from './finance-payables.service';
import { csvRows } from './finance-opening';

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException({
      message: 'Invalid payables request',
      errors: result.error.flatten(),
    });
  return result.data;
}
@Controller('finance/payables')
@RequiresModule('finance')
export class FinancePayablesController {
  constructor(private readonly service: FinancePayablesService) {}
  private actor(req: Request) {
    if (!req.auth) throw new UnauthorizedException();
    return { facilityId: req.auth.facilityId, userId: req.auth.userId };
  }
  @Get()
  @RequirePermission('finance.read')
  workspace(@Req() req: Request) {
    return this.service.workspace(this.actor(req).facilityId);
  }
  @Post('centres')
  @RequirePermission('finance.configure')
  centre(@Req() req: Request, @Body() body: unknown) {
    return this.service.centre(this.actor(req), parse(c.costCentreInputSchema, body));
  }
  @Post('mappings')
  @RequirePermission('finance.configure')
  mapping(@Req() req: Request, @Body() body: unknown) {
    return this.service.mapping(this.actor(req), parse(c.expenseMappingInputSchema, body));
  }
  @Post('suppliers/:id')
  @RequirePermission('finance.write')
  supplier(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.service.updateSupplier(this.actor(req), id, parse(c.supplierUpdateSchema, body));
  }
  @Post('opening')
  @RequirePermission('finance.write')
  opening(@Req() req: Request, @Body() body: unknown) {
    return this.service.opening(this.actor(req), parse(c.supplierOpeningSchema, body));
  }
  @Post('charges')
  @RequirePermission('finance.write')
  charge(@Req() req: Request, @Body() body: unknown) {
    return this.service.charge(this.actor(req), parse(c.payableChargeSchema, body));
  }
  @Post('payments')
  @RequirePermission('finance.write')
  payment(@Req() req: Request, @Body() body: unknown) {
    return this.service.payment(this.actor(req), parse(c.supplierPaymentSchema, body));
  }
  @Post('receipts')
  @RequirePermission('finance.write')
  receipt(@Req() req: Request, @Body() body: unknown) {
    return this.service.receipt(this.actor(req), parse(c.procurementReceiptSchema, body));
  }
  @Post('receipts/preview')
  @RequirePermission('finance.write')
  receiptPreview(@Body() body: unknown) {
    const { csv } = parse(z.object({ csv: z.string().min(1).max(80000) }), body);
    const rows = csvRows(csv);
    if (rows.shift()?.join(',') !== 'sourceLineId,description,quantity,unitCost,category')
      throw new BadRequestException('Use the supplied CSV template headings.');
    const lines = rows.map((r, i) => {
      if (r.length !== 5) throw new BadRequestException(`CSV row ${i + 2} must have five columns.`);
      const [sourceLineId, description, quantity, unitCost, category] = r;
      return { sourceLineId, description, quantity, unitCost, category };
    });
    return { lines: parse(c.procurementReceiptSchema.shape.lines, lines) };
  }
  @Post('receipts/:id/bill')
  @RequirePermission('finance.write')
  receiptBill(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.service.receiptBill(this.actor(req), id, parse(c.procurementBillSchema, body));
  }
  @Get('aging')
  @RequirePermission('finance.read')
  @AuditRead('FinancePayables')
  report(@Req() req: Request, @Query() query: unknown) {
    const q = parse(c.payablesQuerySchema, query);
    return this.service.report(this.actor(req).facilityId, q.asOf, q.supplierId);
  }
  @Post('receipts/:id/remove')
  @RequirePermission('finance.write')
  discardReceipt(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.service.discardReceipt(this.actor(req), id, parse(c.financeCommandSchema, body));
  }
  @Get('suppliers/:id/statement')
  @RequirePermission('finance.read')
  @AuditRead('FinanceSupplierStatement')
  statement(@Req() req: Request, @Param('id') id: string, @Query() query: unknown) {
    const q = parse(c.financeReportQuerySchema, query);
    return this.service.statement(this.actor(req).facilityId, id, q.from, q.to);
  }
  @Get('journals/:id/source')
  @RequirePermission('finance.read')
  @AuditRead('FinancePayableSource')
  source(@Req() req: Request, @Param('id') id: string) {
    return this.service.source(this.actor(req).facilityId, id);
  }
}
