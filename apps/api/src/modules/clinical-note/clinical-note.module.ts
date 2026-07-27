import { Module } from '@nestjs/common';
import { VisitModule } from '../visit/visit.module';
import { ClinicalNoteController } from './clinical-note.controller';
import { ClinicalNoteService } from './clinical-note.service';

@Module({
  imports: [VisitModule],
  controllers: [ClinicalNoteController],
  providers: [ClinicalNoteService],
})
export class ClinicalNoteModule {}
