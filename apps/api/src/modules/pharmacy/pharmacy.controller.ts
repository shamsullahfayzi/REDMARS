import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  DispenseResponse,
  PharmacyPrescription,
  PharmacyQueueResponse,
} from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { AuthContext } from '../../auth/auth-context';
import { DispenseService } from './dispense.service';
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
  constructor(
    private readonly pharmacy: PharmacyService,
    private readonly dispensing: DispenseService,
  ) {}

  @Get('queue')
  @RequirePermission('pharmacy.read_queue')
  @AuditRead('Prescription')
  queue(@Req() req: Request): Promise<PharmacyQueueResponse> {
    return this.pharmacy.queue(this.auth(req).facilityId);
  }

  /**
   * Task 6.9 — one prescription, drugs and allergies only (R6). Same `pharmacy.read_queue`
   * gate as the queue it opens from; audited, because it opens a named patient's drugs and
   * allergies. The shape the service returns carries nothing else clinical — the boundary is
   * enforced by what is read, not only by what the screen chooses to show.
   */
  @Get('prescriptions/:id')
  @RequirePermission('pharmacy.read_queue')
  @AuditRead('Prescription')
  prescription(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PharmacyPrescription> {
    return this.pharmacy.prescription(this.auth(req).facilityId, id);
  }

  /**
   * Task 6.10 — dispense a prescription and raise the pharmacy bill. `pharmacy.dispense` is
   * the pharmacist's alone. No body: the drugs and their prices are the server's, read from
   * the prescription and the formulary. The bill it returns is then paid at the till with
   * the ordinary payment endpoint (6.3).
   */
  @Post('prescriptions/:id/dispense')
  @RequirePermission('pharmacy.dispense')
  @HttpCode(200)
  dispense(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string): Promise<DispenseResponse> {
    const auth = this.auth(req);
    return this.dispensing.dispense(auth.facilityId, auth.userId, id);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
