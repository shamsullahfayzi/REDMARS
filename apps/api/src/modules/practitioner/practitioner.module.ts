import { Module } from '@nestjs/common';
import { PractitionerController } from './practitioner.controller';
import { PractitionerService } from './practitioner.service';

@Module({
  controllers: [PractitionerController],
  providers: [PractitionerService],
})
export class PractitionerModule {}
