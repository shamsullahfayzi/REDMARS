import { Module } from '@nestjs/common';
import { ReferenceRangeController } from './reference-range.controller';
import { ReferenceRangeService } from './reference-range.service';

@Module({
  controllers: [ReferenceRangeController],
  providers: [ReferenceRangeService],
})
export class ReferenceRangeModule {}
