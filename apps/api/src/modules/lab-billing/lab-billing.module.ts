import { Module } from '@nestjs/common';
import { LabBillingController } from './lab-billing.controller';
import { LabBillingService } from './lab-billing.service';

@Module({
  controllers: [LabBillingController],
  providers: [LabBillingService],
})
export class LabBillingModule {}
