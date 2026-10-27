import { NumberSequenceModule } from '../../services/number-sequence.module';
import { Module } from '@nestjs/common';
import { LabBillingController } from './lab-billing.controller';
import { LabBillingService } from './lab-billing.service';

@Module({
  imports: [NumberSequenceModule],
  controllers: [LabBillingController],
  providers: [LabBillingService],
})
export class LabBillingModule {}
