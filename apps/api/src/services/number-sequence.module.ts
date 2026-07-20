import { Module } from '@nestjs/common';
import { NumberSequenceService } from './number-sequence.service';

/**
 * Infrastructure module (task 2.10). Exports the issuer so the patient, visit and
 * billing modules can inject it when they land. PrismaService comes from the global
 * PrismaModule, so it needs no import here.
 */
@Module({
  providers: [NumberSequenceService],
  exports: [NumberSequenceService],
})
export class NumberSequenceModule {}
