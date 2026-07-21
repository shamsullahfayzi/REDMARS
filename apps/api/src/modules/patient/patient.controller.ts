import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  addPatientIdentifierRequestSchema,
  createPatientRequestSchema,
  duplicateCheckQuerySchema,
  patientSearchQuerySchema,
  updatePatientRequestSchema,
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

  /**
   * Declared AFTER @Get('duplicates'). Nest matches routes in declaration order, so a
   * ':id' above it would swallow /patients/duplicates and try to parse "duplicates" as a
   * uuid. Order is load-bearing here.
   */
  @Get(':id')
  @RequirePermission('patient.read_demographics')
  findOne(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const auth = this.auth(req);
    return this.patientService.findById(auth.facilityId, id);
  }

  @Patch(':id')
  @RequirePermission('patient.edit_demographics')
  update(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = updatePatientRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid patient',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    return this.patientService.update(auth.facilityId, id, parsed.data);
  }

  /** The Medi-Pro migration hook (task 7.6) — an old number stays attached to its human. */
  @Post(':id/identifiers')
  @RequirePermission('patient.edit_demographics')
  addIdentifier(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = addPatientIdentifierRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid identifier',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    return this.patientService.addIdentifier(auth.facilityId, id, parsed.data);
  }

  @Delete(':id/identifiers/:identifierId')
  @RequirePermission('patient.edit_demographics')
  removeIdentifier(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('identifierId', ParseUUIDPipe) identifierId: string,
  ) {
    const auth = this.auth(req);
    return this.patientService.removeIdentifier(auth.facilityId, id, identifierId);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
