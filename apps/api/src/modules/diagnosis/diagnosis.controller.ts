import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { recordDiagnosisRequestSchema, updateDiagnosisRequestSchema } from '@redmars/shared';
import type { Diagnosis, DiagnosisListResponse } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { AuthContext } from '../../auth/auth-context';
import { DiagnosisService } from './diagnosis.service';

/**
 * Task 4.5 — the doctor's conclusion, hung off the visit it was reached in.
 *
 * `diagnosis.record` is the DOCTOR alone — not the nurse, who holds `vitals.record`, and
 * not the admin, whose `diagnosis.read` is R2: read, never write. Concluding what is wrong
 * with someone is the one act in this phase that no other role shares.
 *
 * The route param is `:id` for the same reason as vitals: the audit interceptor takes the
 * entity id from `params.id`, and an R1 row that cannot say WHOSE record was read is a
 * tally rather than an audit entry.
 */
@Controller('visits/:id/diagnoses')
export class DiagnosisController {
  constructor(private readonly diagnoses: DiagnosisService) {}

  @Get()
  @RequirePermission('diagnosis.read')
  @AuditRead('Diagnosis')
  list(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) visitId: string,
  ): Promise<DiagnosisListResponse> {
    return this.diagnoses.list(this.auth(req).facilityId, visitId);
  }

  @Post()
  @RequirePermission('diagnosis.record')
  @HttpCode(201)
  record(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) visitId: string,
    @Body() body: unknown,
  ): Promise<Diagnosis> {
    const parsed = recordDiagnosisRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid diagnosis',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    return this.diagnoses.record(auth.facilityId, auth.userId, visitId, parsed.data);
  }

  @Patch(':diagnosisId')
  @RequirePermission('diagnosis.record')
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) visitId: string,
    @Param('diagnosisId', ParseUUIDPipe) diagnosisId: string,
    @Body() body: unknown,
  ): Promise<Diagnosis> {
    const parsed = updateDiagnosisRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid diagnosis',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    return this.diagnoses.update(this.auth(req).facilityId, visitId, diagnosisId, parsed.data);
  }

  /**
   * Only while the visit is open — see the service, which explains why this exists at all.
   *
   * Returns the remaining list rather than 204, which is this codebase's convention for
   * DELETE and is the right answer here for a second reason: removing a primary diagnosis
   * changes which one is primary, so a caller that got 204 would have to ask again anyway.
   */
  @Delete(':diagnosisId')
  @RequirePermission('diagnosis.record')
  remove(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) visitId: string,
    @Param('diagnosisId', ParseUUIDPipe) diagnosisId: string,
  ): Promise<DiagnosisListResponse> {
    return this.diagnoses.remove(this.auth(req).facilityId, visitId, diagnosisId);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
