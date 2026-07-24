import { Module } from '@nestjs/common';
import { NumberSequenceModule } from '../../services/number-sequence.module';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { PaymentService } from './payment.service';

@Module({
  imports: [NumberSequenceModule],
  controllers: [InvoiceController],
  providers: [InvoiceService, PaymentService],
})
export class InvoiceModule {}
