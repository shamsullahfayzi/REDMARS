import { Module } from '@nestjs/common';
import { NumberSequenceModule } from '../../services/number-sequence.module';
import { PatientController } from './patient.controller';
import { PatientService } from './patient.service';

@Module({
  // The MRN issuer (task 2.10) lives here — a patient without one is not registered.
  imports: [NumberSequenceModule],
  controllers: [PatientController],
  providers: [PatientService],
  exports: [PatientService],
})
export class PatientModule {}
