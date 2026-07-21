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
import { createVisitRequestSchema } from '@redmars/shared';
import type { VisitOptionsResponse, VisitSummary } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuthContext } from '../../auth/auth-context';
import { VisitService } from './visit.service';

/**
 * Task 3.5 — visit create.
 *
 * No @RequiresModule: a visit is OPD core, and the system IS OPD. Starting one is
 * receptionist-only (`visit.create` sits on that role alone) — the same discipline as
 * registration, and for the same reason: one door in means one queue and one bill.
 */
@Controller('visits')
export class VisitController {
  constructor(private readonly visits: VisitService) {}

  @Post()
  @RequirePermission('visit.create')
  @HttpCode(201)
  create(@Req() req: Request, @Body() body: unknown): Promise<VisitSummary> {
    const parsed = createVisitRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid visit',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    return this.visits.create(auth.facilityId, auth.userId, parsed.data);
  }

  /**
   * Gated on `visit.read_queue`, not `visit.create`: the doctor's queue (task 3.7) needs
   * the same department list to filter by, and reading which departments exist is not
   * the privilege — creating one is, and that stays on `department.manage`.
   *
   * Declared before @Get(':id'). Nest matches in declaration order, so a ':id' above
   * would swallow /visits/options and try to parse "options" as a uuid.
   */
  @Get('options')
  @RequirePermission('visit.read_queue')
  options(@Req() req: Request): Promise<VisitOptionsResponse> {
    return this.visits.options(this.auth(req).facilityId);
  }

  @Get(':id')
  @RequirePermission('visit.read_queue')
  findOne(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string): Promise<VisitSummary> {
    return this.visits.findById(this.auth(req).facilityId, id);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
