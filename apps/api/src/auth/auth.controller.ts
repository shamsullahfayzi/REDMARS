import { BadRequestException, Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { loginRequestSchema, type LoginResponse } from '@redmars/shared';
import { AuthService } from './auth.service';

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
}
