import { FinanceCloseService } from './finance-close.service';
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
import * as contracts from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequiresModule } from '../../auth/decorators/requires-module.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { FinanceLedgerService } from './finance-ledger.service';
import { FinanceOperationsService } from './finance-operations.service';
import { FinanceRevenueService } from './finance-revenue.service';

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new BadRequestException({
      message: 'Invalid finance request',
      errors: result.error.flatten(),
    });
  return result.data;
}

@Controller('finance')
@RequiresModule('finance')
export class FinanceController {
  constructor(
    private readonly ledger: FinanceLedgerService,
    private readonly closing: FinanceCloseService,
    private readonly operations: FinanceOperationsService,
    private readonly revenue: FinanceRevenueService,
  ) {}
  private actor(req: Request) {
    if (!req.auth) throw new UnauthorizedException();
    return { facilityId: req.auth.facilityId, userId: req.auth.userId };
  }

  @Get()
  @RequirePermission('finance.read')
  @AuditRead('FinanceWorkspace')
  workspace(@Req() req: Request) {
    return this.operations.workspace(this.actor(req).facilityId);
  }
  @Post('setup')
  @RequirePermission('finance.configure')
  setup(@Req() req: Request, @Body() body: unknown) {
    return this.ledger.setup(this.actor(req), parse(contracts.financeSetupSchema, body));
  }
  @Post('opening/preview')
  @RequirePermission('finance.write')
  openingPreview(@Req() req:Request,@Body() body:unknown) { return this.ledger.previewOpening(this.actor(req).facilityId,parse(contracts.financeOpeningInputSchema,body)); }
  @Post('opening/import')
  @RequirePermission('finance.write')
  openingImport(@Req() req:Request,@Body() body:unknown) { return this.ledger.importOpening(this.actor(req),parse(contracts.financeOpeningInputSchema,body)); }
  @Post('accounts')
  @RequirePermission('finance.configure')
  account(@Req() req: Request, @Body() body: unknown) {
    return this.ledger.createAccount(
      this.actor(req),
      parse(contracts.financeAccountInputSchema, body),
    );
  }
  @Post('fiscal-years')
  @RequirePermission('finance.configure')
  period(@Req() req: Request, @Body() body: unknown) {
    return this.ledger.createFiscalYear(
      this.actor(req),
      parse(contracts.fiscalYearInputSchema, body),
    );
  }
  @Post('periods/:id/close')
  @RequirePermission('finance.close')
  close(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.closing.action(
      this.actor(req),
      id,
      'close',
      parse(contracts.periodActionSchema, body),
    );
  }
  @Get('journals/:id')
  @RequirePermission('finance.read')
  @AuditRead('FinanceJournal')
  journal(@Req() req: Request, @Param('id') id: string) {
    return this.ledger.getJournal(this.actor(req).facilityId, id);
  }
  @Get('journals')
  @RequirePermission('finance.read')
  journals(@Req() req: Request, @Query() query: unknown) {
    const q = parse(contracts.financeJournalQuerySchema, query);
    return this.ledger.journalPage(this.actor(req).facilityId,q.page,q.status);
  }
  @Get('journals/:id/audit')
  @RequirePermission('finance.read')
  audit(@Req() req: Request, @Param('id') id: string, @Query() query: unknown) {
    const q = parse(contracts.financeJournalQuerySchema, query);
    return this.ledger.audit(this.actor(req).facilityId,id,q.page);
  }
  @Post('journals')
  @RequirePermission('finance.write')
  create(@Req() req: Request, @Body() body: unknown) {
    return this.ledger.createJournal(
      this.actor(req),
      parse(contracts.financeJournalInputSchema, body),
    );
  }
  @Post('journals/:id/edit')
  @RequirePermission('finance.write')
  edit(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.ledger.editJournal(
      this.actor(req),
      id,
      parse(contracts.financeJournalEditSchema, body),
    );
  }
  @Post('journals/:id/remove')
  @RequirePermission('finance.write')
  remove(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.ledger.deleteDraft(this.actor(req), id, parse(contracts.financePostSchema, body));
  }
  @Post('journals/:id/post')
  @RequirePermission('finance.post')
  post(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.ledger.postJournal(this.actor(req), id, parse(contracts.financePostSchema, body));
  }
  @Post('journals/:id/reverse')
  @RequirePermission('finance.post')
  reverse(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.ledger.reverse(this.actor(req), id, parse(contracts.financeReverseSchema, body));
  }
  @Post('suppliers')
  @RequirePermission('finance.write')
  supplier(@Req() req: Request, @Body() body: unknown) {
    return this.operations.createSupplier(
      this.actor(req),
      parse(contracts.financeSupplierInputSchema, body),
    );
  }
  @Post('expenses')
  @RequirePermission('finance.post')
  expense(@Req() req: Request, @Body() body: unknown) {
    return this.operations.expense(
      this.actor(req),
      parse(contracts.financeExpenseInputSchema, body),
    );
  }
  @Post('bills')
  @RequirePermission('finance.post')
  bill(@Req() req: Request, @Body() body: unknown) {
    return this.operations.bill(this.actor(req), parse(contracts.financeBillInputSchema, body));
  }
  @Post('bills/:id/pay')
  @RequirePermission('finance.post')
  pay(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.operations.settle(
      this.actor(req),
      id,
      parse(contracts.financeSettlementInputSchema, body),
    );
  }
  @Post('sync')
  @RequirePermission('finance.post')
  sync(@Req() req: Request) {
    return this.operations.sync(this.actor(req));
  }
  @Post('statements')
  @RequirePermission('finance.reconcile')
  statement(@Req() req: Request, @Body() body: unknown) {
    return this.operations.statement(
      this.actor(req),
      parse(contracts.financeStatementInputSchema, body),
    );
  }
  @Post('statement-lines/:id/match')
  @RequirePermission('finance.reconcile')
  match(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.operations.match(this.actor(req), id, parse(contracts.financeMatchSchema, body));
  }
  @Post('statements/:id/finalize')
  @RequirePermission('finance.reconcile')
  finalize(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.operations.reconcile(
      this.actor(req),
      id,
      parse(contracts.financeCommandSchema, body),
    );
  }
  @Get('reports')
  @RequirePermission('finance.read')
  @AuditRead('FinanceReport')
  report(@Req() req: Request, @Query() query: unknown) {
    const q = parse(contracts.financeReportQuerySchema, query);
    return this.ledger.report(this.actor(req).facilityId, q.from, q.to);
  }
  @Get('revenue')
  @RequirePermission('finance.read')
  revenueWorkspace(@Req() req:Request) { return this.revenue.workspace(this.actor(req).facilityId); }
  @Post('revenue/mappings')
  @RequirePermission('finance.configure')
  revenueMapping(@Req() req:Request,@Body() body:unknown) { return this.revenue.mapping(this.actor(req),parse(contracts.revenueMappingInputSchema,body)); }
  @Post('panels')
  @RequirePermission('finance.write')
  panelCreate(@Req() req:Request,@Body() body:unknown) { return this.revenue.panel(this.actor(req),parse(contracts.financePanelInputSchema,body)); }
  @Post('invoices/:id/panel')
  @RequirePermission('finance.write')
  panelAssign(@Req() req:Request,@Param('id') id:string,@Body() body:unknown) { return this.revenue.assignPanel(this.actor(req),id,parse(contracts.financeAssignPanelSchema,body)); }
  @Post('panels/receipts')
  @RequirePermission('finance.write')
  panelReceipt(@Req() req:Request,@Body() body:unknown) { return this.revenue.panelReceipt(this.actor(req),parse(contracts.financePanelReceiptSchema,body)); }
  @Get('panels/:id/statement')
  @RequirePermission('finance.read')
  @AuditRead('FinancePanelStatement')
  panelStatement(@Req() req:Request,@Param('id') id:string,@Query() query:unknown) {
    const q=parse(contracts.financeReportQuerySchema,query);
    return this.revenue.panelStatement(this.actor(req).facilityId,id,q.from,q.to);
  }
  @Get('receivables/:kind')
  @RequirePermission('finance.read')
  @AuditRead('FinanceReceivables')
  receivables(@Req() req:Request,@Param('kind') kind:string,@Query() query:unknown) {
    if(kind!=='patient' && kind!=='panel') throw new BadRequestException('Choose patient or panel receivables.');
    const q=parse(contracts.financeArQuerySchema,query);
    return this.revenue.ar(this.actor(req).facilityId,q.asOf,kind,q.panelId,q.patientId);
  }
  @Post('tills/preview')
  @RequirePermission('finance.reconcile')
  tillPreview(@Req() req:Request,@Body() body:unknown) { return this.revenue.tillPreview(this.actor(req).facilityId,parse(contracts.financeTillInputSchema,body)); }
  @Post('tills/close')
  @RequirePermission('finance.reconcile')
  tillClose(@Req() req:Request,@Body() body:unknown) { return this.revenue.closeTill(this.actor(req),parse(contracts.financeTillInputSchema,body)); }
  @Post('tills/:id/approve')
  @RequirePermission('finance.post')
  tillApprove(@Req() req:Request,@Param('id') id:string,@Body() body:unknown) { return this.revenue.approveTill(this.actor(req),id,parse(contracts.financeCommandSchema,body)); }
  @Post('deposits')
  @RequirePermission('finance.write')
  deposit(@Req() req:Request,@Body() body:unknown) { return this.revenue.deposit(this.actor(req),parse(contracts.financeDepositInputSchema,body)); }
  @Get('journals/:id/source')
  @RequirePermission('finance.read')
  @AuditRead('FinanceSource')
  source(@Req() req:Request,@Param('id') id:string) { return this.revenue.source(this.actor(req).facilityId,id); }
  @Get('ledger')
  @RequirePermission('finance.read')
  @AuditRead('FinanceLedger')
  ledgerReport(@Req() req: Request, @Query() query: unknown) {
    const q = parse(contracts.financeReportQuerySchema, query);
    if (!q.accountId) throw new BadRequestException('Choose an account.');
    return this.ledger.ledger(this.actor(req).facilityId, q.accountId, q.from, q.to, q.page);
  }
}
