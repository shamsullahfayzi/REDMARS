import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { PERMISSION_KEY } from '../../auth/decorators/require-permission.decorator';
import type { PermissionCode } from '../../auth/permissions';

/**
 * Authorisation. Answers "may you", having been told "who you are" by
 * JwtAuthGuard.
 *
 * WHAT THIS GUARD DOES NOT DO — read this before trusting it:
 *
 * It checks that the caller holds the permission. It does NOT enforce the ~26
 * conditional (⚠️) rules in roles-and-permissions.md, and it cannot. A
 * receptionist's `discount.apply ⚠️ R10` means "up to 10%", and the ceiling
 * needs the invoice total — a number this guard has never seen and has no way
 * to reach. Same for R5's same-day window, R7's nurse-visible subset, R8's
 * task scoping, R11's export justification.
 *
 * So a ⚠️ grant PASSES here. That is deliberate, and the alternative is worse
 * rather than merely stricter: R7 does not say "a nurse may not read clinical
 * data", it says "a nurse reads vitals, allergies and drugs". Denying on the
 * condition would mean the nurse reads nothing at all, which is not the rule
 * the hospital wrote.
 *
 * The condition travels on request.auth.permissions for the handler to enforce.
 * Each rule lands with the feature that can evaluate it — R10 with billing in
 * Phase 6, R7 with clinical read in Phase 3. Until then those rules exist on
 * paper and in the database, and nowhere else. A ⚠️ grant reaching a handler
 * that ignores its condition is an unconditional grant, whatever the matrix says.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const route = `${context.getClass().name}.${context.getHandler().name}`;

    const auth = request.auth;
    if (!auth) {
      // JwtAuthGuard did not run, so this route is unauthenticated and we have
      // no idea who is calling. Fail closed and shout: this is a wiring fault
      // (guard order in AuthModule), not a caller doing anything wrong.
      this.logger.error(
        `${route} reached PermissionsGuard with no auth context. JwtAuthGuard did not run — check APP_GUARD order.`,
      );
      throw new ForbiddenException('Forbidden');
    }

    const required = this.reflector.getAllAndOverride<PermissionCode | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) {
      // Absence is denial — the same rule the matrix runs on, applied to the
      // route itself. A handler that declares no permission and is not @Public
      // has been forgotten about, and the safe reading of "I don't know who may
      // call this" is nobody.
      //
      // ERROR server-side because it is a bug and someone must fix it; a plain
      // 403 to the caller because "this endpoint is misconfigured" is a sentence
      // an attacker should never be handed.
      this.logger.error(
        `${route} declares no @RequirePermission and is not @Public. Denying. This is a bug in the route, not in the request.`,
      );
      throw new ForbiddenException('Forbidden');
    }

    if (!auth.permissions.has(required)) {
      // WARN, not ERROR: a doctor clicking through to a billing screen they do
      // not have is Tuesday, not an incident. It is logged because a run of
      // these against different endpoints is what probing looks like.
      this.logger.warn(
        `${auth.username} [${auth.roles.join(', ') || 'no roles'}] denied '${required}' on ${route}`,
      );
      throw new ForbiddenException(`Missing permission: ${required}`);
    }

    return true;
  }
}
