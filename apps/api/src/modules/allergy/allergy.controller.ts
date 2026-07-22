import {
  BadRequestException,
  Body,
  Controller,
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
import { recordAllergyRequestSchema, updateAllergyRequestSchema } from '@redmars/shared';
import type { Allergy, AllergyListResponse } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { AuthContext } from '../../auth/auth-context';
import { AllergyService } from './allergy.service';

/**
 * Task 4.6 — allergies, hung off the PATIENT.
 *
 * Not off a visit, unlike everything else in this phase. An allergy is true on the day it
 * is recorded and true five years later at a different consultation; filed against an
 * encounter, the penicillin reaction from March would be invisible in September.
 *
 * `allergy.read` is the widest clinical grant in the matrix — admin, nurse, doctor AND
 * pharmacist — and that breadth is R6 doing its job on purpose: "the pharmacist MUST see
 * this. Dispensing without allergies is unsafe." It is the one clinical list the rules
 * spread rather than restrict, which is also why the consult context is allowed to carry
 * it (task 4.1's docblock, revised).
 */
@Controller('patients/:id/allergies')
export class AllergyController {
  constructor(private readonly allergies: AllergyService) {}

  @Get()
  @RequirePermission('allergy.read')
  @AuditRead('Allergy')
  list(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) patientId: string,
  ): Promise<AllergyListResponse> {
    return this.allergies.list(this.auth(req).facilityId, patientId);
  }

  @Post()
  @RequirePermission('allergy.record')
  @HttpCode(201)
  record(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
  ): Promise<Allergy> {
    const parsed = recordAllergyRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid allergy',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    return this.allergies.record(auth.facilityId, auth.userId, patientId, parsed.data);
  }

  /**
   * Edit, or retract by sending isActive: false. There is no DELETE, and there will not
   * be one — an allergy that vanishes leaves a chart indistinguishable from a patient
   * nobody ever asked.
   */
  @Patch(':allergyId')
  @RequirePermission('allergy.record')
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) patientId: string,
    @Param('allergyId', ParseUUIDPipe) allergyId: string,
    @Body() body: unknown,
  ): Promise<Allergy> {
    const parsed = updateAllergyRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid allergy',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    return this.allergies.update(auth.facilityId, auth.userId, patientId, allergyId, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
