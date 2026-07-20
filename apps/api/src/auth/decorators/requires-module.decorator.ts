import { SetMetadata } from '@nestjs/common';
import type { ModuleKey } from '@redmars/shared';

export const MODULE_KEY = 'redmars:module';

/**
 * Declares the optional module a route belongs to. ModuleGuard 403s the route when
 * that module is off for the caller's facility (task 2.13).
 *
 * Absence means "not module-gated" — the route is OPD core and always reachable. So
 * this is the opposite default to @RequirePermission, where absence is denial: most
 * routes name no module because most of the system IS OPD, and only the endpoints of
 * a toggleable module carry this. OPD is not a ModuleKey, so it cannot be named here.
 *
 * Put it on the controller class: a module owns whole controllers, not stray methods.
 */
export const RequiresModule = (module: ModuleKey) => SetMetadata(MODULE_KEY, module);
