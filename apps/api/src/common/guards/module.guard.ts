import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { ModuleKey } from '@redmars/shared';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { MODULE_KEY } from '../../auth/decorators/requires-module.decorator';
import { FacilityModuleService } from '../../modules/facility-module/facility-module.service';

/**
 * Licensing enforcement. Answers "is this module even on for your hospital", after
 * JwtAuthGuard has said who you are and PermissionsGuard has said you may.
 *
 * Runs LAST of the global guards, and only matters for the few routes that carry
 * @RequiresModule. A route with no module tag is OPD core and passes straight
 * through — absence is "not gated", not denial (the opposite of PermissionsGuard,
 * on purpose: most of the system is OPD and would otherwise need a tag each).
 *
 * The nav hides a disabled module too, but that is courtesy — a hand-crafted request
 * straight to the endpoint still lands here and 403s. This guard is the control.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  private readonly logger = new Logger(ModuleGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly modules: FacilityModuleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<ModuleKey | undefined>(MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // No module named — the route is OPD core, always reachable.
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const route = `${context.getClass().name}.${context.getHandler().name}`;

    const auth = request.auth;
    if (!auth) {
      // A gated route reached us with no identity: either it is @Public (a
      // contradiction) or JwtAuthGuard did not run before us. Either way we cannot
      // resolve the facility, so fail closed and shout — it is a wiring fault.
      this.logger.error(
        `${route} is @RequiresModule('${required}') but ran with no auth context. ` +
          `Check APP_GUARD order — ModuleGuard must run after JwtAuthGuard.`,
      );
      throw new ForbiddenException('Forbidden');
    }

    const enabled = await this.modules.isEnabled(auth.facilityId, required);
    if (!enabled) {
      // WARN, not ERROR: hitting a disabled module is a licensing state, not a bug.
      this.logger.warn(
        `${auth.username} blocked on ${route}: module '${required}' is disabled for facility ${auth.facilityId}.`,
      );
      throw new ForbiddenException(`Module not enabled: ${required}`);
    }

    return true;
  }
}
