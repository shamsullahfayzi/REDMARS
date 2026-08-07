import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  auditLogQuerySchema,
  errorLogQuerySchema,
  patientExportQuerySchema,
  reportRangeQuerySchema,
} from '@redmars/shared';
import type {
  AuditLogResponse,
  CensusReportResponse,
  DiagnosisReportResponse,
  ErrorLogResponse,
  PatientExportResponse,
  RevenueReportResponse,
  WaitTimeReportResponse,
} from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuthContext } from '../../auth/auth-context';
import { ReportsService } from './reports.service';

/**
 * Task 6c — the reports the matrix already promised (`report.operational`,
 * `report.financial`, `report.clinical_aggregate`, `audit_log.read`, `data.export`),
 * seeded since 1.2 and unread until now.
 *
 * No @AuditRead on any route here, and that mirrors CollectionsController and
 * FollowUpController's own reasoning: every one of these is a tally over many visits,
 * many payments, many diagnoses — never a look into one patient's record — except
 * `patient-export`, which names no single id either but is the one door onto raw
 * patient identity, and is audited explicitly in the service instead (R11).
 */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('census')
  @RequirePermission('report.operational')
  async census(@Req() req: Request, @Query() rawQuery: unknown): Promise<CensusReportResponse> {
    const query = this.parseRange(rawQuery);
    const auth = this.auth(req);
    const ownerId = auth.permissions.get('report.operational') === 'R8' ? auth.userId : null;
    return this.reports.census(auth.facilityId, query, ownerId);
  }

  @Get('wait-times')
  @RequirePermission('report.operational')
  async waitTimes(
    @Req() req: Request,
    @Query() rawQuery: unknown,
  ): Promise<WaitTimeReportResponse> {
    const query = this.parseRange(rawQuery);
    const auth = this.auth(req);
    const ownerId = auth.permissions.get('report.operational') === 'R8' ? auth.userId : null;
    return this.reports.waitTimes(auth.facilityId, query, ownerId);
  }

  @Get('revenue')
  @RequirePermission('report.financial')
  async revenue(@Req() req: Request, @Query() rawQuery: unknown): Promise<RevenueReportResponse> {
    const query = this.parseRange(rawQuery);
    return this.reports.revenue(this.auth(req).facilityId, query);
  }

  @Get('diagnoses')
  @RequirePermission('report.clinical_aggregate')
  async diagnoses(
    @Req() req: Request,
    @Query() rawQuery: unknown,
  ): Promise<DiagnosisReportResponse> {
    const query = this.parseRange(rawQuery);
    const auth = this.auth(req);
    // Admin and management read the facility; a doctor's grant is unconditional too, but
    // counts, no names still means THEIR counts — the facility's whole diagnosis list is
    // not a doctor's to browse just because the row carries no name on it. Scoped only when
    // 'doctor' is the SOLE reason they hold this grant: Dr. Hafizullah, who per the open
    // questions in roles-and-permissions.md may hold both `doctor` and `admin`, reaches this
    // tab on his oversight hat too, and admin/management's facility-wide view must win.
    const doctorOnly =
      auth.roles.includes('doctor') &&
      !auth.roles.includes('admin') &&
      !auth.roles.includes('management');
    // Forced to self when doctor-only (not a choice); otherwise an admin/management filter,
    // optional, taken from the query exactly like departmentId.
    const practitionerId = doctorOnly
      ? await this.reports.practitionerIdOf(auth.facilityId, auth.userId)
      : (query.practitionerId ?? null);
    return this.reports.diagnoses(
      auth.facilityId,
      query,
      practitionerId,
      doctorOnly ? 'own' : 'facility',
    );
  }

  @Get('audit-log')
  @RequirePermission('audit_log.read')
  async auditLog(@Req() req: Request, @Query() rawQuery: unknown): Promise<AuditLogResponse> {
    const parsed = auditLogQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid audit log query',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.reports.auditLog(this.auth(req).facilityId, parsed.data);
  }

  /**
   * Task 7.8 — "you can debug a 2am call" without SSH: every 5xx AllExceptionsFilter
   * caught, with its stack trace, browsable from here. Same shape and reasoning as
   * audit-log above — `error_log.read` is admin/management, oversight, not clinical.
   */
  @Get('error-log')
  @RequirePermission('error_log.read')
  async errorLog(@Req() req: Request, @Query() rawQuery: unknown): Promise<ErrorLogResponse> {
    const parsed = errorLogQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid error log query',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.reports.errorLog(this.auth(req).facilityId, parsed.data);
  }

  @Get('patient-export')
  @RequirePermission('data.export')
  async patientExport(
    @Req() req: Request,
    @Query() rawQuery: unknown,
  ): Promise<PatientExportResponse> {
    const parsed = patientExportQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'A reason is required to export the patient list.',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const auth = this.auth(req);
    return this.reports.exportPatients(auth.facilityId, auth.userId, parsed.data.reason);
  }

  private parseRange(rawQuery: unknown) {
    const parsed = reportRangeQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid report range',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return parsed.data;
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
