import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { savePrescriptionRequestSchema } from '@redmars/shared';
import type { PrescriptionResponse } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { AuthContext } from '../../auth/auth-context';
import { PrescriptionService } from './prescription.service';

/**
 * Task 4.7 — the prescription, hung off the visit it was written in.
 *
 * PUT rather than POST, because the whole sheet is saved at once and saving it twice must
 * leave one prescription. A doctor pressing F2 four times while filling in a table should
 * not end up with four drug orders.
 *
 * `prescription.write` is the doctor alone. `prescription.read` is much wider — admin
 * under R2, nurse under R7, the PHARMACIST unconditionally, because "the drug list IS what
 * R6 grants them" and dispensing from a prescription you cannot read is not dispensing.
 *
 * The route param is `:id` so the audit interceptor can name the visit that was read.
 */
@Controller('visits/:id/prescription')
export class PrescriptionController {
  constructor(private readonly prescriptions: PrescriptionService) {}

  @Get()
  @RequirePermission('prescription.read')
  @AuditRead('Prescription')
  find(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) visitId: string,
  ): Promise<PrescriptionResponse> {
    return this.prescriptions.find(this.auth(req).facilityId, visitId);
  }

  @Put()
  @RequirePermission('prescription.write')
  save(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) visitId: string,
    @Body() body: unknown,
  ): Promise<PrescriptionResponse> {
    const parsed = savePrescriptionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid prescription',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    return this.prescriptions.save(auth.facilityId, auth.userId, visitId, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
