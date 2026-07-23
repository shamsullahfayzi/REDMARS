import { Module } from '@nestjs/common';
import { NumberSequenceModule } from '../../services/number-sequence.module';
import { LabOrderController } from './lab-order.controller';
import { LabOrderService } from './lab-order.service';
import { LabQueueController } from './lab-queue.controller';
import { LabQueueService } from './lab-queue.service';
import { LabResultService } from './lab-result.service';
import { LabSampleService } from './lab-sample.service';
import { VisitLabResultsController } from './visit-lab-results.controller';

@Module({
  // The order raises an invoice, so it issues both an order number and an invoice number
  // from the shared sequence — inside the caller's transaction, so a rollback takes them.
  imports: [NumberSequenceModule],
  controllers: [LabOrderController, LabQueueController, VisitLabResultsController],
  providers: [LabOrderService, LabQueueService, LabSampleService, LabResultService],
})
export class LabOrderModule {}
