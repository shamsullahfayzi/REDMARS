import { Controller, Get, Param, ParseUUIDPipe, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { VisitLabResultsResponse } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequiresModule } from '../../auth/decorators/requires-module.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { AuthContext } from '../../auth/auth-context';
import { LabResultService } from './lab-result.service';

/**
 * Results flowing back to the doctor — read on the consult screen where the tests were
 * ordered. Gated on `lab_result.read` (the doctor's, the bench's, the nurse's under R7), which
 * is a READ right distinct from entering or verifying. Module-gated on the lab.
 */
@RequiresModule('lab')
@Controller('visits/:id/lab-results')
export class VisitLabResultsController {
  constructor(private readonly results: LabResultService) {}

  @Get()
  @RequirePermission('lab_result.read')
  @AuditRead('LabResult')
  forVisit(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) visitId: string,
  ): Promise<VisitLabResultsResponse> {
    return this.results.forVisit(this.auth(req).facilityId, visitId);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
