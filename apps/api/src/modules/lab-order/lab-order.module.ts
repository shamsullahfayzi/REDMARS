import { Module } from '@nestjs/common';
import { NumberSequenceModule } from '../../services/number-sequence.module';
import { LabOrderController } from './lab-order.controller';
import { LabOrderService } from './lab-order.service';

@Module({
  // The order raises an invoice, so it issues both an order number and an invoice number
  // from the shared sequence — inside the caller's transaction, so a rollback takes them.
  imports: [NumberSequenceModule],
  controllers: [LabOrderController],
  providers: [LabOrderService],
})
export class LabOrderModule {}
