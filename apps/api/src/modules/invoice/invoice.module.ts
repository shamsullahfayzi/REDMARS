import { Module } from '@nestjs/common';
import { NumberSequenceModule } from '../../services/number-sequence.module';
import { SettingModule } from '../../services/setting.module';
import { DiscountService } from './discount.service';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { PaymentService } from './payment.service';

@Module({
  imports: [NumberSequenceModule, SettingModule],
  controllers: [InvoiceController],
  providers: [InvoiceService, PaymentService, DiscountService],
})
export class InvoiceModule {}
