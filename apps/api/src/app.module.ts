import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './modules/users/users.module';
import { DepartmentModule } from './modules/department/department.module';
import { RoomModule } from './modules/room/room.module';
import { SpecialityModule } from './modules/speciality/speciality.module';
import { PractitionerModule } from './modules/practitioner/practitioner.module';
import { ServiceModule } from './modules/service/service.module';
import { DrugModule } from './modules/drug/drug.module';
import { LabTestModule } from './modules/lab-test/lab-test.module';
import { LabPanelModule } from './modules/lab-panel/lab-panel.module';
import { ReferenceRangeModule } from './modules/reference-range/reference-range.module';
import { IcdModule } from './modules/icd/icd.module';
import { DrugInteractionModule } from './modules/drug-interaction/drug-interaction.module';
import { FacilityModuleModule } from './modules/facility-module/facility-module.module';
import { NumberSequenceModule } from './services/number-sequence.module';
import { PatientModule } from './modules/patient/patient.module';
import { VisitModule } from './modules/visit/visit.module';
import { ReceptionModule } from './modules/reception/reception.module';
import { AppointmentModule } from './modules/appointment/appointment.module';
import { VitalsModule } from './modules/vitals/vitals.module';
import { TemplateModule } from './modules/template/template.module';
import { DiagnosisModule } from './modules/diagnosis/diagnosis.module';
import { AllergyModule } from './modules/allergy/allergy.module';
import { PrescriptionModule } from './modules/prescription/prescription.module';
import { ClinicalNoteModule } from './modules/clinical-note/clinical-note.module';
import { HistoryModule } from './modules/history/history.module';

@Module({
  imports: [
    // isGlobal: ConfigService injectable anywhere without re-importing.
    // validate: runs env.validation.ts at boot — bad config kills startup.
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    DepartmentModule,
    RoomModule,
    SpecialityModule,
    PractitionerModule,
    ServiceModule,
    DrugModule,
    LabTestModule,
    LabPanelModule,
    ReferenceRangeModule,
    IcdModule,
    DrugInteractionModule,
    FacilityModuleModule,
    NumberSequenceModule,
    PatientModule,
    VisitModule,
    ReceptionModule,
    AppointmentModule,
    VitalsModule,
    TemplateModule,
    DiagnosisModule,
    AllergyModule,
    PrescriptionModule,
    ClinicalNoteModule,
    HistoryModule,
  ],
  providers: [
    // Global. Runs after the guards on every route, so request.auth is already
    // set — it opens the AsyncLocalStorage scope the Prisma audit middleware reads
    // to attribute each write to its actor. See audit.interceptor.ts.
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
