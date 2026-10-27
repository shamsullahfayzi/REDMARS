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
import { FinanceStatementsService } from './finance-statements.service';
import { FinanceCloseService } from './finance-close.service';
import { financeWorkbook } from './finance-workbook';
function parse<T>(schema: z.ZodType<T>, body: unknown) {
  const r = schema.safeParse(body);
  if (!r.success)
    throw new BadRequestException({ message: 'Invalid report request', errors: r.error.flatten() });
  return r.data;
}
@Controller('finance/statements')
@RequiresModule('finance')
export class FinanceStatementsController {
  constructor(
    private readonly service: FinanceStatementsService,
    private readonly close: FinanceCloseService,
  ) {}
  private actor(req: Request) {
    if (!req.auth) throw new UnauthorizedException();
    return { facilityId: req.auth.facilityId, userId: req.auth.userId };
  }
  @Get('workspace')
  @RequirePermission('finance.read')
  @AuditRead('FinanceReportingWorkspace')
  workspace(@Req() req: Request) {
    return this.service.workspace(this.actor(req));
  }
  @Get()
  @RequirePermission('finance.read')
  @AuditRead('FinanceStatements')
  pack(@Req() req: Request, @Query() q: unknown) {
    return this.service.pack(this.actor(req), parse(c.statementQuerySchema, q));
  }
  @Get('print')
  @RequirePermission('finance.export')
  @AuditRead('FinanceStatementPdfExport')
  print(@Req() req: Request, @Query() q: unknown) {
    return this.service.pack(this.actor(req), parse(c.statementQuerySchema, q));
  }
  @Get('excel')
  @RequirePermission('finance.export')
  @AuditRead('FinanceStatementExcelExport')
  async excel(@Req() req: Request, @Query() q: unknown) {
    const p = await this.service.pack(this.actor(req), parse(c.statementQuerySchema, q));
    const file = financeWorkbook([
      {
        name: 'Summary',
        rows: [
          ['Financial statements', 'AFN'],
          ['From', c.gregorianToShamsi(p.from)],
          ['To', c.gregorianToShamsi(p.to)],
          ['Generated', p.generatedAt],
          ['Facilities', p.facilities.map((f) => f.name).join(', ')],
          [
            'Money format',
            'Exact decimal text; convert to numbers only within Excel precision limits',
          ],
          ...p.warnings.map((w) => ['Review', w]),
          ...Object.entries(p.totals),
        ],
      },
      {
        name: 'Accrual P and L',
        rows: [
          ['Facility', 'Code', 'Account', 'Type', 'Amount'],
          ...p.profitLoss.map((r) => [r.facility, r.code, r.name, r.type, r.result]),
        ],
      },
      {
        name: 'Trial balance',
        rows: [
          [
            'Facility',
            'Code',
            'Account',
            'Type',
            'Opening debit less credit',
            'Debits',
            'Credits',
            'Closing debit less credit',
          ],
          ...p.accounts.map((r) => [
            r.facility,
            r.code,
            r.name,
            r.type,
            r.opening,
            r.debit,
            r.credit,
            r.closing,
          ]),
        ],
      },
      {
        name: 'Balance sheet',
        rows: [
          ['Facility', 'Code', 'Account', 'Type', 'Amount'],
          ...p.accounts
            .filter((r) => ['asset', 'liability', 'equity'].includes(r.type))
            .map((r) => [
              r.facility,
              r.code,
              r.name,
              r.type,
              r.type === 'asset' ? r.closing : c.moneyDecimal(r.closing).negated().toFixed(2),
            ]),
          ['', '', 'Unclosed earnings', 'equity', p.totals.unclosedResult],
        ],
      },
      {
        name: 'Cash summary',
        rows: [
          ['Measure', 'AFN'],
          ...Object.entries(p.cash)
            .filter(([, v]) => typeof v === 'string')
            .map(([k, v]) => [k, v as string]),
        ],
      },
      {
        name: 'Cash movements',
        rows: [
          ['Facility', 'Journal', 'Date (Shamsi)', 'Category', 'Allocation', 'Amount', 'Memo'],
          ...p.cash.rows.map((r) => [
            r.facility,
            r.number,
            c.gregorianToShamsi(r.date),
            r.category,
            r.label,
            r.amount,
            r.memo,
          ]),
        ],
      },
      {
        name: 'Cash positions',
        rows: [
          [
            'Facility',
            'Account',
            'Opening',
            'Receipts including transfers',
            'Payments including transfers',
            'Closing',
          ],
          ...p.cash.positions.map((r) => [
            r.facility,
            r.account,
            r.opening,
            r.receipts,
            r.payments,
            r.closing,
          ]),
        ],
      },
      {
        name: 'Departments',
        rows: [
          ['Facility', 'Department', 'Income', 'Expenses', 'Net income'],
          ...p.departments.map((r) => [r.facility, r.name, r.income, r.expenses, r.netIncome]),
        ],
      },
    ]);
    return { filename: `finance-${p.from}-${p.to}.xlsx`, base64: file.toString('base64') };
  }
  @Post('access')
  @RequirePermission('finance.consolidation.manage')
  grant(@Req() req: Request, @Body() body: unknown) {
    return this.service.grant(this.actor(req), parse(c.reportGrantInputSchema, body));
  }
  @Post('cash/:id')
  @RequirePermission('finance.reconcile')
  classify(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.service.classify(this.actor(req), id, parse(c.cashClassificationInputSchema, body));
  }
  @Post('templates')
  @RequirePermission('finance.configure')
  template(@Req() req: Request, @Body() body: unknown) {
    return this.service.template(this.actor(req), parse(c.reportTemplateInputSchema, body));
  }
  @Get('templates/:id')
  @RequirePermission('finance.read')
  @AuditRead('FinanceCustomReport')
  custom(@Req() req: Request, @Param('id') id: string, @Query() q: unknown) {
    return this.service.custom(this.actor(req), id, parse(c.statementQuerySchema, q));
  }
  @Get('templates/:id/excel')
  @RequirePermission('finance.export')
  @AuditRead('FinanceCustomReportExport')
  async customExcel(@Req() req: Request, @Param('id') id: string, @Query() q: unknown) {
    const r = await this.service.custom(this.actor(req), id, parse(c.statementQuerySchema, q));
    return {
      filename: 'custom-report.xlsx',
      base64: financeWorkbook([
        {
          name: 'Report',
          rows: [
            [r.name, r.authority],
            ['From', c.gregorianToShamsi(r.from)],
            ['To', c.gregorianToShamsi(r.to)],
            ['Definition version', String(r.version)],
            ['Row', 'AFN'],
            ...r.rows.map((x) => [x.label, x.amount]),
          ],
        },
      ]).toString('base64'),
    };
  }
  @Get('periods/:id')
  @RequirePermission('finance.read')
  @AuditRead('FinanceCloseChecklist')
  checklist(@Req() req: Request, @Param('id') id: string) {
    return this.close.checklist(this.actor(req), id);
  }
  @Post('periods/:id/:action')
  @RequirePermission('finance.close')
  period(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('action') action: string,
    @Body() body: unknown,
  ) {
    return this.close.action(
      this.actor(req),
      id,
      parse(z.enum(['close', 'lock', 'reopen']), action),
      parse(c.periodActionSchema, body),
    );
  }
  @Post('years/:id/:action')
  @RequirePermission('finance.close')
  year(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('action') action: string,
    @Body() body: unknown,
  ) {
    return this.close.year(
      this.actor(req),
      id,
      parse(z.enum(['prepare', 'finalize', 'cancel']), action),
      parse(c.periodActionSchema, body),
    );
  }
}
