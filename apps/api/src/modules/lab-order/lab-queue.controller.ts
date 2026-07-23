import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { labQueueQuerySchema } from '@redmars/shared';
import type { LabQueueResponse } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequiresModule } from '../../auth/decorators/requires-module.decorator';
import { AuthContext } from '../../auth/auth-context';
import { LabQueueService } from './lab-queue.service';

/**
 * Phase 5 — the lab worklist, read by the bench.
 *
 * A different route, a different permission from ordering. `lab_order.read_queue` is the lab
 * tech's and the desk's; the doctor holds it too (they placed the order and may see where it
 * is), but this is not `lab_order.create` — reading the whole facility's work is not the
 * same right as writing one order on one visit. Module-gated: a facility without the lab
 * never reaches here.
 */
@RequiresModule('lab')
@Controller('lab-queue')
export class LabQueueController {
  constructor(private readonly queue: LabQueueService) {}

  @Get()
  @RequirePermission('lab_order.read_queue')
  list(@Req() req: Request, @Query() rawQuery: unknown): Promise<LabQueueResponse> {
    const parsed = labQueueQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid lab queue filter',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.queue.queue(this.auth(req).facilityId, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
