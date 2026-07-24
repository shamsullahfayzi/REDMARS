import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { PharmacyQueueResponse } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { AuthContext } from '../../auth/auth-context';
import { PharmacyService } from './pharmacy.service';

/**
 * Task 6.8 — the pharmacy queue.
 *
 * No @RequiresModule: pharmacy is OPD core (Farhat dispenses), not a toggled module. The
 * gate is `pharmacy.read_queue` — the pharmacist, and an admin. @AuditRead names the read:
 * the queue is a list of named patients with their drugs, and looking at it is a clinical
 * read like opening a chart.
 */
@Controller('pharmacy')
export class PharmacyController {
  constructor(private readonly pharmacy: PharmacyService) {}

  @Get('queue')
  @RequirePermission('pharmacy.read_queue')
  @AuditRead('Prescription')
  queue(@Req() req: Request): Promise<PharmacyQueueResponse> {
    return this.pharmacy.queue(this.auth(req).facilityId);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
