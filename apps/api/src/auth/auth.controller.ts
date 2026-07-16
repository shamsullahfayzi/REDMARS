import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  loginRequestSchema,
  logoutRequestSchema,
  refreshRequestSchema,
  type LoginResponse,
  type LogoutResponse,
  type MeResponse,
  type RefreshResponse,
} from '@redmars/shared';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { RequirePermission } from './decorators/require-permission.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * POST /auth/login
   *
   * 200, not Nest's default 201: logging in does not create a resource the
   * caller can go fetch. It does create a Session row, but that is ours, not
   * theirs — there is no URL for it.
   */
  // Public by necessity, not by choice: you cannot present a token to the
  // endpoint whose job is to give you one. Note the matrix has an `auth.login`
  // permission granted to all 7 roles — it is not checked here and cannot be,
  // for the same reason. It documents that login is a thing every role does;
  // the actual gate is the password.
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request): Promise<LoginResponse> {
    // Parsed here rather than trusting the shape. @Body() is typed `unknown` on
    // purpose: this is an unauthenticated endpoint reachable by anything on the
    // LAN, and TypeScript types are gone at runtime. Whatever arrives is a guess
    // until zod says otherwise.
    //
    // Inline instead of a ZodValidationPipe because there is exactly one
    // endpoint doing this today. When there are three, extract the pipe.
    const parsed = loginRequestSchema.safeParse(body);
    if (!parsed.success) {
      // Field errors are safe to return: they describe the request the caller
      // just sent, and reveal nothing about which accounts exist.
      throw new BadRequestException({
        message: 'Invalid login request',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    return this.auth.login(parsed.data, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  /**
   * GET /auth/me
   *
   * Not @Public: it answers "who am I", which is meaningless without a token. It
   * carries auth.me — a permission every role holds — so it satisfies the rule
   * that every route names a permission, without being an escape hatch. What it
   * returns (roles) is for rendering a menu, never for access; the server still
   * gates every other endpoint on its own permission.
   */
  @RequirePermission('auth.me')
  @Get('me')
  me(@Req() req: Request): Promise<MeResponse> {
    const auth = req.auth;
    if (!auth) {
      // Unreachable: JwtAuthGuard populates req.auth before this runs, or rejects.
      // Guarded anyway rather than asserting non-null — a wrong assumption here is
      // an identity bug, the worst kind to paper over.
      throw new UnauthorizedException('Invalid or expired token');
    }
    return this.auth.me(auth);
  }

  /**
   * POST /auth/refresh
   *
   * Public: the access token is expired when this is called, so it cannot be what
   * authenticates the call — the refresh token in the body is, validated against
   * the Session table. 200, not 201: no resource is created, a token is exchanged.
   */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: unknown): Promise<RefreshResponse> {
    const parsed = refreshRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid refresh request',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.auth.refresh(parsed.data.refreshToken);
  }

  /**
   * POST /auth/logout
   *
   * Public for the same reason as refresh: a user signing out may already hold an
   * expired access token, and should still be able to kill the session. The
   * refresh token names which session to revoke. Always 200 — logout is idempotent.
   */
  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Body() body: unknown, @Req() req: Request): Promise<LogoutResponse> {
    const parsed = logoutRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid logout request',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    await this.auth.logout(parsed.data.refreshToken, req.ip);
    return { success: true };
  }
}
