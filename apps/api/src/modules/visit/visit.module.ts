import { Module } from '@nestjs/common';
import { NumberSequenceModule } from '../../services/number-sequence.module';
import { VisitController } from './visit.controller';
import { VisitService } from './visit.service';

@Module({
  // The visit-number issuer (task 2.10). Yearly and gapless — V-2026-0001.
  imports: [NumberSequenceModule],
  controllers: [VisitController],
  providers: [VisitService],
  exports: [VisitService],
})
export class VisitModule {}
