import { FinanceCloseService } from './finance-close.service';
import { FinanceStatementsService } from './finance-statements.service';
import { FinanceStatementsController } from './finance-statements.controller';
import { FinanceAssetsController } from './finance-assets.controller';
import { FinanceAssetsService } from './finance-assets.service';
import { Module } from '@nestjs/common';
import { IntegrationModule } from '../../integration/integration.module';
import { NumberSequenceModule } from '../../services/number-sequence.module';
import { FinanceController } from './finance.controller';
import { FinanceLedgerService } from './finance-ledger.service';
import { FinanceOperationsService } from './finance-operations.service';
import { FinanceRevenueService } from './finance-revenue.service';
import { FinancePayablesService } from './finance-payables.service';
import { FinancePayablesController } from './finance-payables.controller';
import { FinancePayrollController } from './finance-payroll.controller';
import { FinancePayrollService } from './finance-payroll.service';

@Module({
  imports: [IntegrationModule, NumberSequenceModule],
  controllers: [
    FinanceStatementsController,
    FinanceAssetsController,
    FinanceController,
    FinancePayablesController,
    FinancePayrollController,
  ],
  providers: [
    FinanceCloseService,
    FinanceStatementsService,
    FinanceAssetsService,
    FinanceLedgerService,
    FinanceOperationsService,
    FinanceRevenueService,
    FinancePayablesService,
    FinancePayrollService,
  ],
})
export class FinanceModule {}
