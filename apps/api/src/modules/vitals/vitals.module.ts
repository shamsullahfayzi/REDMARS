import { Module } from '@nestjs/common';
import { VisitModule } from '../visit/visit.module';
import { VitalsController } from './vitals.controller';
import { VitalsService } from './vitals.service';

@Module({
  imports: [VisitModule],
  controllers: [VitalsController],
  providers: [VitalsService],
})
export class VitalsModule {}
