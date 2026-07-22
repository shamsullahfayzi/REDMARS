import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { historyQuerySchema } from '@redmars/shared';
import type { PatientHistoryResponse } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { AuthContext } from '../../auth/auth-context';
import { HistoryService } from './history.service';

/**
 * Task 4.14 — the last twelve months, on one request.
 *
 * `patient.read_history` and not `patient.read_clinical`, and the difference is the point.
 * The matrix wrote read_history as "> 1 month" and granted it to the doctor and to the
 * admin under R2 — and to nobody else. Reading TODAY'S vitals to take a blood pressure is
 * a different act from reading a year of somebody's psychiatric attendance, and the nurse
 * holds the first (R7) and not the second. That distinction already existed; this is the
 * first route that spends it.
 *
 * Its own controller rather than another method on PatientController: this reads across
 * Visit, Diagnosis and Prescription, which is not the patient module's business, and
 * `/patients/:id/history` is two segments so it cannot be swallowed by `@Get(':id')`.
 *
 * @AuditRead against the PATIENT — R1, and this is the read most worth having a row for.
 * "Who pulled up a year of this patient's record, and when" is the question an audit table
 * exists to answer in a hospital where everybody knows everybody.
 */
@Controller('patients/:id/history')
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get()
  @RequirePermission('patient.read_history')
  @AuditRead('Patient')
  forPatient(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) patientId: string,
    @Query() query: unknown,
  ): Promise<PatientHistoryResponse> {
    const parsed = historyQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid history window',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    return this.history.forPatient(this.auth(req).facilityId, patientId, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
