import { Module } from '@nestjs/common';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './appointment.service';

@Module({
  controllers: [AppointmentController],
  providers: [AppointmentService],
  // Reception imports this to fulfil a booking inside the check-in transaction (3.10).
  exports: [AppointmentService],
})
export class AppointmentModule {}
