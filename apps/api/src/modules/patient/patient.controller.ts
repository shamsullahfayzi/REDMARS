import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  createPatientRequestSchema,
  duplicateCheckQuerySchema,
  patientSearchQuerySchema,
} from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuthContext } from '../../auth/auth-context';
import { PatientService } from './patient.service';

/**
 * Task 3.1 — patient registration. Plural, like every other resource controller.
 *
 * No @RequiresModule: a patient is OPD core, and the system IS OPD. Registration is
 * receptionist-only (`patient.create` sits on that role alone) — a doctor who needs a
 * patient registered asks the desk, which keeps one till and one duplicate-check path.
 */
@Controller('patients')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Post()
  @RequirePermission('patient.create')
  create(@Req() req: Request, @Body() body: unknown) {
    const parsed = createPatientRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid patient',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    return this.patientService.create(auth.facilityId, auth.userId, parsed.data);
  }

  /**
   * Search is a far wider grant than create — every clinical role needs to find a
   * patient, only the desk registers one.
   */
  @Get()
  @RequirePermission('patient.search')
  search(@Req() req: Request, @Query() query: unknown) {
    const parsed = patientSearchQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid search',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    return this.patientService.search(
      auth.facilityId,
      parsed.data.q,
      parsed.data.page,
      parsed.data.limit,
    );
  }

  /**
   * Task 3.3 — who might this already be? Declared before the bare @Get() reads, but the
   * literal segment makes the two unambiguous either way.
   *
   * Gated on patient.search rather than patient.create: this only reveals patients the
   * caller could already find by typing the same name into the search box.
   */
  @Get('duplicates')
  @RequirePermission('patient.search')
  async duplicates(@Req() req: Request, @Query() query: unknown) {
    const parsed = duplicateCheckQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid duplicate check',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    return { matches: await this.patientService.findDuplicates(auth.facilityId, parsed.data) };
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
