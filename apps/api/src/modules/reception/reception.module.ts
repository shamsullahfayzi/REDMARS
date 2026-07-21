import { Module } from '@nestjs/common';
import { NumberSequenceModule } from '../../services/number-sequence.module';
import { PatientModule } from '../patient/patient.module';
import { VisitModule } from '../visit/visit.module';
import { ReceptionController } from './reception.controller';
import { ReceptionService } from './reception.service';

@Module({
  // Reception orchestrates the two existing services rather than reimplementing them:
  // the duplicate guard, the age anchor and the open-visit guard have to behave the same
  // whether the desk uses this screen or the single-purpose ones.
  imports: [NumberSequenceModule, PatientModule, VisitModule],
  controllers: [ReceptionController],
  providers: [ReceptionService],
})
export class ReceptionModule {}
