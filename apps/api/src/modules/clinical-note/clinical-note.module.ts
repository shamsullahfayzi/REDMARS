import { Module } from '@nestjs/common';
import { ClinicalNoteController } from './clinical-note.controller';
import { ClinicalNoteService } from './clinical-note.service';

@Module({
  controllers: [ClinicalNoteController],
  providers: [ClinicalNoteService],
})
export class ClinicalNoteModule {}
