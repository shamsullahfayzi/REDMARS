import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { followUpQuerySchema, recordFollowUpResponseRequestSchema } from '@redmars/shared';
import type { FollowUp, FollowUpListResponse } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuthContext } from '../../auth/auth-context';
import { FollowUpService } from './follow-up.service';

/**
 * Task 4.15 — who was told to come back, and by when.
 *
 * NO @AuditRead, unlike every other clinical list in this phase, and the omission is
 * deliberate rather than forgotten. R1 audits reads of A PATIENT'S RECORD; the interceptor
 * takes its entity id from `params.id`, and this route has no id because it is not about
 * one patient. A row per screenful with nobody named would be a tally, not an audit entry.
 * Nothing clinical is carried either — a name, a phone number and a date, which is what a
 * recall list IS. The moment a row is opened, the visit behind it audits itself.
 *
 * Not under /visits or /patients: a recall list is neither. It is the desk's morning work.
 */
@Controller('follow-ups')
export class FollowUpController {
  constructor(private readonly followUps: FollowUpService) {}

  @Get()
  @RequirePermission('follow_up.read')
  list(@Req() req: Request, @Query() query: unknown): Promise<FollowUpListResponse> {
    const parsed = followUpQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid follow-up filter',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    return this.followUps.list(this.auth(req).facilityId, parsed.data);
  }

  /**
   * The call center's (or admin's) answer for one follow-up — coming, not coming, or a
   * note. `follow_up.respond` is a narrower grant than `follow_up.read`: a doctor and a
   * receptionist can both see this list, but only the role built around ringing patients
   * (plus admin, for a correction) can write to it.
   */
  @Post(':prescriptionId/respond')
  @RequirePermission('follow_up.respond')
  @HttpCode(200)
  respond(
    @Req() req: Request,
    @Param('prescriptionId', ParseUUIDPipe) prescriptionId: string,
    @Body() body: unknown,
  ): Promise<FollowUp> {
    const parsed = recordFollowUpResponseRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid follow-up response',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const auth = this.auth(req);
    return this.followUps.respond(auth.facilityId, auth.userId, prescriptionId, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
