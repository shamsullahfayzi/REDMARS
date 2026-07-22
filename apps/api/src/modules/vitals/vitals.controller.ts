import {
  BadRequestException,
  Body,
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
import { recordVitalsRequestSchema } from '@redmars/shared';
import type { VitalsListResponse, VitalsReading } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { AuthContext } from '../../auth/auth-context';
import { VitalsService } from './vitals.service';

/**
 * Task 4.3 — vitals, hung off the visit they were measured during.
 *
 * Nested under /visits/:visitId on purpose. A vitals row has no facility of its own and
 * no patient of its own — it belongs to one encounter, and the URL says so. It also means
 * the facility check has exactly one place to happen: on the visit.
 *
 * `vitals.record` is nurse and doctor; `vitals.read` adds admin under R2, which is
 * satisfied by construction here because there is nothing to write on a GET.
 *
 * The route param is `:id` and not `:visitId`, which looks like a worse name in a nested
 * path and is not: the audit interceptor takes an entity id from the response's own id or
 * from `params.id`, and a list read has no single row to name. Called anything else, the
 * R1 row would record that somebody read vitals without recording WHOSE — which is not an
 * audit row, it is a tally.
 */
@Controller('visits/:id/vitals')
export class VitalsController {
  constructor(private readonly vitals: VitalsService) {}

  @Post()
  @RequirePermission('vitals.record')
  @HttpCode(201)
  record(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) visitId: string,
    @Body() body: unknown,
  ): Promise<VitalsReading> {
    const parsed = recordVitalsRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid vitals',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    return this.vitals.record(auth.facilityId, auth.userId, visitId, parsed.data);
  }

  /**
   * A clinical read, so R1 applies: audited, never blocked. Entity is Vitals; the id
   * falls back to the route param, which is the visit — the right answer for a list read,
   * since a list has no single row to name.
   */
  @Get()
  @RequirePermission('vitals.read')
  @AuditRead('Vitals')
  list(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) visitId: string,
  ): Promise<VitalsListResponse> {
    return this.vitals.list(this.auth(req).facilityId, visitId);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
