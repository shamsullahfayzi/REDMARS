import { Module } from '@nestjs/common';
import { NumberSequenceModule } from '../../services/number-sequence.module';
import { DispenseService } from './dispense.service';
import { PharmacyController } from './pharmacy.controller';
import { PharmacyService } from './pharmacy.service';

import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

@Module({
  imports: [NumberSequenceModule],
  controllers: [PharmacyController, InventoryController],
  providers: [PharmacyService, DispenseService, InventoryService],
})
export class PharmacyModule {}
