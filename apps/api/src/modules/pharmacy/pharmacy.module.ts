import { Module } from '@nestjs/common';
import { NumberSequenceModule } from '../../services/number-sequence.module';
import { DispenseService } from './dispense.service';
import { PharmacyController } from './pharmacy.controller';
import { PharmacyService } from './pharmacy.service';

@Module({
  imports: [NumberSequenceModule],
  controllers: [PharmacyController],
  providers: [PharmacyService, DispenseService],
})
export class PharmacyModule {}
