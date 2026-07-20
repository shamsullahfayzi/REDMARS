import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  createUserRequestSchema,
  setUserActiveRequestSchema,
  type UserListResponse,
  type UserSummary,
} from '@redmars/shared';
import type { AuthContext } from '../../auth/auth-context';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { UsersService } from './users.service';

/**
 * Admin-only staff management (task 1.7) — the real, audited path a doctor account
 * is created through, replacing the dev-seed script.
 *
 * Every route names one permission, all held only by admin. There is no @Public
 * here and no unguarded route: a new endpoint added to this controller is denied
 * to everyone until it declares what it needs.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @RequirePermission('user.read')
  @Get()
  list(@Req() req: Request): Promise<UserListResponse> {
    return this.users.list(this.auth(req).facilityId);
  }

  @RequirePermission('user.create')
  @Post()
  @HttpCode(201)
  create(@Req() req: Request, @Body() body: unknown): Promise<UserSummary> {
    // Parsed, not trusted: @Body() is unknown because a type is gone at runtime and
    // this endpoint mints credentials. zod is the gate.
    const parsed = createUserRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid user',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.users.create(this.auth(req).facilityId, parsed.data);
  }

  @RequirePermission('user.deactivate')
  @Patch(':id/active')
  setActive(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<UserSummary> {
    const parsed = setUserActiveRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid request',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const auth = this.auth(req);
    return this.users.setActive(auth.facilityId, auth.userId, id, parsed.data);
  }

  /**
   * The authenticated actor. JwtAuthGuard populates req.auth before any handler
   * here runs, so a missing one is unreachable — guarded anyway rather than
   * asserted, because a wrong assumption about identity is the worst kind to
   * paper over.
   */
  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
