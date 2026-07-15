import type { RoleCode } from './permissions';

/**
 * Who the caller is, resolved fresh from the database on every request by
 * JwtAuthGuard and hung on `request.auth`.
 *
 * This is the answer to "who are you", not "may you" — PermissionsGuard reads
 * it, and from 1.4 the AuditInterceptor will too, because an audit row with no
 * actor is not an audit row.
 */
export interface AuthContext {
  /** AppUser.id. */
  userId: string;
  facilityId: string;
  username: string;

  /** Role codes held by this user. For logging and for 1.6's nav; never for gating. */
  roles: RoleCode[];

  /**
   * Every permission this user holds, mapped to the rule that qualifies it:
   * null for an unconditional grant (✅), a rule code like 'R10' for a ⚠️ one.
   *
   * Presence in this map is the grant. Absence is denial — there is no `false`
   * to look for, which is deliberate: a lookup that must find an explicit deny
   * is a lookup where a missing row means access.
   *
   * Keyed by string rather than PermissionCode because these codes come from
   * the database, which can hold a code this build has never heard of (an older
   * API pointed at a newer DB). An unknown code is simply never asked for.
   */
  permissions: ReadonlyMap<string, string | null>;
}

/**
 * Teaches TypeScript that `request.auth` exists on an Express request.
 *
 * Optional, not required, and that is the honest type: a @Public() route never
 * gets one, so any code reading it must cope with undefined. Typing it as
 * always-present would be a lie the compiler would then help us tell.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
