import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import * as c from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequiresModule } from '../../auth/decorators/requires-module.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { FinancePayrollService } from './finance-payroll.service';
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success)
    throw new BadRequestException({
      message: 'Invalid payroll request',
      errors: r.error.flatten(),
    });
  return r.data;
}
@Controller('finance/payroll')
@RequiresModule('finance')
export class FinancePayrollController {
  constructor(private readonly service: FinancePayrollService) {}
  private actor(req: Request) {
    if (!req.auth) throw new UnauthorizedException();
    return { facilityId: req.auth.facilityId, userId: req.auth.userId };
  }
  @Get()
  @RequirePermission('payroll.read')
  @AuditRead('PayrollWorkspace')
  workspace(@Req() req: Request) {
    return this.service.workspace(this.actor(req).facilityId);
  }
  @Get('runs/:id')
  @RequirePermission('payroll.read')
  @AuditRead('PayrollRun')
  detail(@Req() req: Request, @Param('id') id: string) {
    return this.service.detail(this.actor(req).facilityId, id);
  }
  @Get('journals/:id/source')
  @RequirePermission('payroll.read')
  @AuditRead('PayrollSource')
  source(@Req() req: Request, @Param('id') id: string) {
    return this.service.source(this.actor(req).facilityId, id);
  }
  @Post('config')
  @RequirePermission('payroll.configure')
  config(@Req() req: Request, @Body() body: unknown) {
    return this.service.configure(this.actor(req), parse(c.payrollConfigInputSchema, body));
  }
  @Post('employees')
  @RequirePermission('payroll.write')
  create(@Req() req: Request, @Body() body: unknown) {
    return this.service.saveEmployee(
      this.actor(req),
      null,
      parse(c.payrollEmployeeInputSchema, body),
    );
  }
  @Post('employees/:id')
  @RequirePermission('payroll.write')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.service.saveEmployee(
      this.actor(req),
      id,
      parse(c.payrollEmployeeInputSchema, body),
    );
  }
  @Post('loans')
  @RequirePermission('payroll.write')
  loan(@Req() req: Request, @Body() body: unknown) {
    return this.service.issueLoan(this.actor(req), parse(c.payrollLoanInputSchema, body));
  }
  @Post('calculate')
  @RequirePermission('payroll.write')
  calculate(@Req() req: Request, @Body() body: unknown) {
    return this.service.calculate(this.actor(req), parse(c.payrollCalculateSchema, body));
  }
  @Post('runs/:id/review')
  @RequirePermission('payroll.write')
  review(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.service.action(this.actor(req), id, 'review', parse(c.payrollActionSchema, body));
  }
  @Post('runs/:id/approve')
  @RequirePermission('payroll.approve')
  approve(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.service.action(this.actor(req), id, 'approve', parse(c.payrollActionSchema, body));
  }
  @Post('payments')
  @RequirePermission('payroll.pay')
  payment(@Req() req: Request, @Body() body: unknown) {
    return this.service.payment(this.actor(req), parse(c.payrollPaymentSchema, body));
  }
}
