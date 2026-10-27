import { Module } from '@nestjs/common';
import { PatientModule } from '../patient/patient.module';
import { CrmPatientsService } from './crm-patients.service';
import { CrmPatientsController } from './crm-patients.controller';
import { AppointmentModule } from '../appointment/appointment.module';
import { CrmAppointmentsService } from './crm-appointments.service';
import { CrmAppointmentsController } from './crm-appointments.controller';
import { RateLimitService } from '../../common/rate-limit.service';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { CrmRateLimitGuard } from './crm-rate-limit.guard';
import { CrmContactsService } from './crm-contacts.service';
import { CrmContactsController } from './crm-contacts.controller';
import { CrmLeadsService } from './crm-leads.service';
import { CrmLeadsController } from './crm-leads.controller';
import { CrmTimelineController } from './crm-timeline.controller';
import { CrmTimelineService } from './crm-timeline.service';
import { CrmCallsService } from './crm-calls.service';
import { CrmCallsController } from './crm-calls.controller';
import { CrmTasksService } from './crm-tasks.service';
import { CrmTasksController } from './crm-tasks.controller';

@Module({
  imports: [AppointmentModule, PatientModule],
  controllers: [
    CrmPatientsController,
    CrmAppointmentsController,
    CrmController,
    CrmContactsController,
    CrmLeadsController,
    CrmTimelineController,
    CrmCallsController,
    CrmTasksController,
  ],
  providers: [
    CrmPatientsService,
    CrmAppointmentsService,
    CrmService,
    CrmContactsService,
    CrmLeadsService,
    CrmTimelineService,
    CrmCallsService,
    CrmTasksService,
    RateLimitService,
    CrmRateLimitGuard,
  ],
})
export class CrmModule {}
