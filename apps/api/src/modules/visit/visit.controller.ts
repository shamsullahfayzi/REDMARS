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
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  cancelVisitRequestSchema,
  changeVisitStatusRequestSchema,
  createVisitRequestSchema,
  queueQuerySchema,
  updateComplaintRequestSchema,
} from '@redmars/shared';
import type {
  CancelVisitResponse,
  ConsultContext,
  QueueResponse,
  VisitHistoryResponse,
  VisitOptionsResponse,
  VisitSummary,
} from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
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

  /**
   * Task 3.7 — the queue. Also declared before @Get(':id'), same reason as options.
   *
   * `visit.read_queue` is held by admin, receptionist, nurse, doctor and management, and
   * that breadth is right: knowing who is waiting is not clinical detail. The entries
   * carry a name, an age and a complaint — opening the chart behind one is a separate
   * request and a separate audited read.
   */
  @Get('queue')
  @RequirePermission('visit.read_queue')
  queue(@Req() req: Request, @Query() query: unknown): Promise<QueueResponse> {
    const parsed = queueQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid queue filter',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    return this.visits.queue(auth.facilityId, auth.userId, parsed.data);
  }

  @Get(':id')
  @RequirePermission('visit.read_queue')
  findOne(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string): Promise<VisitSummary> {
    return this.visits.findById(this.auth(req).facilityId, id);
  }

  /**
   * Task 3.9 — move a visit through care.
   *
   * `visit.change_status` is held by receptionist, nurse and doctor: all three legitimately
   * move a patient along, and which of them did it is answered by the history row, not by
   * narrowing the grant. Ending a visit early is NOT here — cancelling needs
   * `visit.cancel` and voiding needs `visit.void`, and the request contract refuses those
   * statuses so this route cannot become a back door to either.
   */
  @Patch(':id/status')
  @RequirePermission('visit.change_status')
  changeStatus(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<VisitSummary> {
    const parsed = changeVisitStatusRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid status change',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    return this.visits.changeStatus(auth.facilityId, auth.userId, id, parsed.data);
  }

  /**
   * Task 4.4 — the doctor writes what the patient actually came in with.
   *
   * Its own permission, `visit.record_complaint`, and not `visit.change_status`: moving a
   * patient along and documenting them are not the same authority, and the receptionist
   * holds the first. The desk still writes the opening complaint through `visit.create`;
   * this replaces it with the clinical version.
   */
  @Patch(':id/complaint')
  @RequirePermission('visit.record_complaint')
  updateComplaint(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<VisitSummary> {
    const parsed = updateComplaintRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid complaint',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    return this.visits.updateComplaint(auth.facilityId, auth.userId, id, parsed.data);
  }

  /**
   * Task 3.11 — cancel a visit and refund what was paid for it.
   *
   * Gated on `visit.cancel`, which the matrix grants to admin outright and to the
   * receptionist under rule R5. The guard cannot evaluate R5 — the same-day window and
   * "before the next step" both need the visit itself, which the guard has never seen —
   * so the condition travels on request.auth.permissions and the service applies it.
   *
   * `payment.refund` is demanded too, but only when there is money to give back: a visit
   * that was never paid for needs no refund authority to cancel.
   */
  @Post(':id/cancel')
  @RequirePermission('visit.cancel')
  @HttpCode(200)
  cancel(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<CancelVisitResponse> {
    const parsed = cancelVisitRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid cancellation',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    return this.visits.cancel(auth.facilityId, auth.userId, auth.permissions, id, parsed.data);
  }

  /**
   * Task 4.1 — the consult screen's context.
   *
   * `patient.read_clinical` rather than `visit.read_queue`, and the difference matters:
   * the queue is "who is waiting", which management legitimately sees, while this is the
   * chart being opened on a named person. Gating the SHELL on the permission its contents
   * will need means tasks 4.3 to 4.13 fill it without re-arguing who may be in the room.
   *
   * @AuditRead is the point of R1 — "opening the chart is a separate, audited read", as
   * the queue contract puts it. The row records the Visit, taken from the route param.
   * It never blocks: R1 is deterrence, not obstruction.
   */
  @Get(':id/consult')
  @RequirePermission('patient.read_clinical')
  @AuditRead('Visit')
  consult(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string): Promise<ConsultContext> {
    const auth = this.auth(req);
    return this.visits.consult(auth.facilityId, auth.permissions, id);
  }

  /** The medico-legal trail, plus the wait and consultation durations it makes answerable. */
  @Get(':id/history')
  @RequirePermission('visit.read_queue')
  history(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VisitHistoryResponse> {
    return this.visits.history(this.auth(req).facilityId, id);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
