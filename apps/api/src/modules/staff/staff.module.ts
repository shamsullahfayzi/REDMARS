import { Module } from '@nestjs/common';
import { NumberSequenceModule } from '../../services/number-sequence.module';
import { HrFoundationController, StaffController } from './staff.controller';
import { StaffOperationsController } from './staff-operations.controller';
import { StaffOperationsService } from './staff-operations.service';
import { StaffService } from './staff.service';

@Module({
  imports: [NumberSequenceModule],
  controllers: [StaffController, HrFoundationController, StaffOperationsController],
  providers: [StaffService, StaffOperationsService],
  exports: [StaffService, StaffOperationsService],
})
export class StaffModule {}
