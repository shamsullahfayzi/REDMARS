import { SetMetadata } from '@nestjs/common';
import type { PermissionCode } from '../permissions';

export const PERMISSION_KEY = 'redmars:permission';

/**
 * Declares the permission a route requires. PermissionsGuard enforces it.
 *
 * The PermissionCode parameter type is the point of the whole matrix file:
 * `@RequirePermission('patient.creat')` is a compile error, not a 403 that
 * nobody notices until a receptionist cannot register a patient on a Tuesday
 * morning with a queue out the door.
 *
 * One permission per route, not a list. A route needing two permissions is a
 * route doing two things, and "which of these did the caller actually need?"
 * is a question the audit log should never have to guess at. If a real case
 * turns up, it can be argued then — on the third one, not the first.
 */
export const RequirePermission = (permission: PermissionCode) =>
  SetMetadata(PERMISSION_KEY, permission);
