import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The actor behind the current request, carried from the HTTP layer down to the
 * database layer.
 *
 * This exists to solve one specific problem. The audit trail must record WHO
 * changed a row, but the only place that truly knows WHAT changed — which model,
 * which id, the value before and after — is the Prisma client, deep below the
 * controller. Prisma has no idea there is an HTTP request, let alone who is
 * holding the token. `request.auth` (from 1.3) knows the actor but not the write.
 *
 * AsyncLocalStorage bridges the two. The AuditInterceptor opens a store for the
 * duration of a request and drops the actor into it; the Prisma audit middleware,
 * running inside that same async call tree, reads it back out. No parameter has
 * to be threaded through every service method to carry `userId` down to the write.
 *
 * Native Node (node:async_hooks) — no dependency. The context propagates across
 * every await and Promise inside the request, which is exactly the reach a Prisma
 * call needs.
 */
export interface RequestContext {
  /** AppUser.id of the caller. Absent on @Public routes — nobody is logged in. */
  userId?: string;
  /** The caller's facility. Used to stamp audit rows whose model has no facilityId of its own (UserRole, Session). */
  facilityId?: string;
  /** For the log line only, never for gating. */
  username?: string;
  /** Express req.ip. Recorded on the audit row so a break-in has a source address. */
  ipAddress?: string;
}

/**
 * One store per request. `getStore()` returns undefined when called outside any
 * request — a seed script, a future cron, a test using a raw PrismaClient. That
 * undefined is meaningful, not an error: it says "this write has no logged-in
 * actor", and the audit middleware records userId: null rather than inventing one.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();
