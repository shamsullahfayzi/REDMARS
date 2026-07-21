import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { checkInRequestSchema } from '@redmars/shared';
import type { CheckInResponse } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuthContext } from '../../auth/auth-context';
import type { PermissionCode } from '../../auth/permissions';
import { ReceptionService } from './reception.service';

/**
 * Task 3.6 — the reception desk. One screen, one save.
 *
 * No @RequiresModule. The `billing` module gates the apparatus that comes later — panels,
 * insurance claims, statements — not the act of charging for an OPD consultation. Farhat
 * has `billing` off in the seed, and a module tag here would 403 every registration at
 * the first customer, which is the opposite of what the toggle is for.
 */
@Controller('reception')
export class ReceptionController {
  constructor(private readonly reception: ReceptionService) {}

  /**
   * One route that registers, admits, bills and takes payment. It therefore needs four
   * grants, and @RequirePermission takes one by design — "a route needing two permissions
   * is a route doing two things" is exactly right, and this route really is doing four.
   *
   * So the guard holds the coarse gate and the handler enforces the rest, which is the
   * split PermissionsGuard's own contract describes: the condition travels on
   * request.auth.permissions for the handler to act on. Checking them here rather than
   * leaning on the fact that only a receptionist happens to hold all four today means
   * widening any single grant later cannot quietly widen this route with it.
   */
  @Post('check-in')
  @RequirePermission('visit.create')
  @HttpCode(201)
  checkIn(@Req() req: Request, @Body() body: unknown): Promise<CheckInResponse> {
    const parsed = checkInRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid check-in',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const auth = this.auth(req);
    this.require(auth, 'invoice.create');
    this.require(auth, 'payment.receive');
    // Only when this check-in is actually registering someone. A returning patient does
    // not need the desk to hold the power to create one.
    if (parsed.data.patient) this.require(auth, 'patient.create');

    return this.reception.checkIn(auth.facilityId, auth.userId, auth.permissions, parsed.data);
  }

  private require(auth: AuthContext, permission: PermissionCode): void {
    if (!auth.permissions.has(permission)) {
      throw new ForbiddenException(`Missing permission: ${permission}`);
    }
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
