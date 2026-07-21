import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
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
  appointmentListQuerySchema,
  closeAppointmentRequestSchema,
  createAppointmentRequestSchema,
} from '@redmars/shared';
import type { AppointmentListResponse, AppointmentSummary } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuthContext } from '../../auth/auth-context';
import { AppointmentService } from './appointment.service';

/**
 * Task 3.10 — the appointment book.
 *
 * No @RequiresModule: booking a follow-up is OPD, and the system IS OPD.
 *
 * Closing a booking is split across two permissions because the two facts are different
 * and are worth measuring apart — `cancelled` is "they told us", `no_show` is "they never
 * came". The route reads which one is being asked for and demands the matching grant.
 */
@Controller('appointments')
export class AppointmentController {
  constructor(private readonly appointments: AppointmentService) {}

  /**
   * Held by the doctor as well as the desk (task 3.10). A follow-up is decided in the
   * consulting room, and the only moment it is certain to be recorded is while the
   * patient is still sitting there.
   */
  @Post()
  @RequirePermission('appointment.create')
  @HttpCode(201)
  create(@Req() req: Request, @Body() body: unknown): Promise<AppointmentSummary> {
    const parsed = createAppointmentRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid appointment',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    return this.appointments.create(auth.facilityId, auth.userId, parsed.data);
  }

  @Get()
  @RequirePermission('appointment.read')
  list(@Req() req: Request, @Query() query: unknown): Promise<AppointmentListResponse> {
    const parsed = appointmentListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid appointment filter',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    return this.appointments.list(this.auth(req).facilityId, parsed.data);
  }

  /**
   * Gated on `appointment.read` and then narrowed in the handler, because the guard takes
   * one permission per route and this route's requirement depends on the BODY. Same split
   * the reception desk uses: the guard holds the coarse gate, the handler enforces the
   * rest — see PermissionsGuard's own contract.
   */
  @Patch(':id/close')
  @RequirePermission('appointment.read')
  close(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<AppointmentSummary> {
    const parsed = closeAppointmentRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid appointment change',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    const needed =
      parsed.data.status === 'no_show' ? 'appointment.mark_no_show' : 'appointment.cancel';
    if (!auth.permissions.has(needed)) {
      throw new ForbiddenException(`Missing permission: ${needed}`);
    }

    return this.appointments.close(auth.facilityId, id, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
