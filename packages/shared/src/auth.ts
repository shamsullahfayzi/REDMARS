import { z } from 'zod'

/**
 * POST /auth/login — the contract between apps/api and apps/web.
 *
 * Same reasoning as health.ts: hand-written, not derived from Prisma. That
 * matters more here than anywhere else so far — AppUser holds passwordHash, and
 * a schema derived from the model is one careless `select` away from putting an
 * argon2 hash in a browser bundle. What the API promises is listed below and
 * nothing else can leak through it.
 */

/**
 * Username is trimmed but NOT lowercased, and there is no format rule.
 * Staff usernames are assigned by an admin (1.7), not self-registered, so
 * validating shape here would only reject accounts the hospital deliberately
 * created. Length caps exist to stop someone posting a 10MB string at an
 * unauthenticated endpoint, not to enforce a policy.
 */
export const loginRequestSchema = z.object({
  username: z.string().trim().min(1, 'Username is required').max(64),
  password: z.string().min(1, 'Password is required').max(256),
})

export type LoginRequest = z.infer<typeof loginRequestSchema>

/**
 * The caller's own identity, echoed back so the web app can render a name and
 * route by facility without decoding the JWT itself.
 *
 * Roles are absent on purpose: they do not exist until 1.2, and the UI must not
 * grow the habit of trusting this object for permission decisions. Every
 * permission check happens on the server (1.3). Hiding a button is courtesy.
 */
export const authUserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  fullName: z.string(),
  facilityId: z.uuid(),
})

export type AuthUser = z.infer<typeof authUserSchema>

/**
 * Two tokens, two different jobs.
 *
 * accessToken is a signed JWT the API verifies on every request without a DB
 * lookup. That speed is bought by giving up revocation, so it is short-lived —
 * `expiresIn` is its whole security model.
 *
 * refreshToken is opaque random bytes, not a JWT: there is nothing in it to
 * read. Its hash is stored in the Session table, which is what makes logout and
 * "logged in elsewhere" possible at all (1.8). The exchange endpoint arrives in
 * 1.8; until then this is issued and stored but not yet spent.
 *
 * Delivered in the body rather than a cookie because the web app is a SPA on a
 * different origin in dev, and the token store decision belongs to 1.6.
 */
export const loginResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  /** Access token lifetime in seconds. The client refreshes before this. */
  expiresIn: z.number().int().positive(),
  user: authUserSchema,
})

export type LoginResponse = z.infer<typeof loginResponseSchema>

/**
 * GET /auth/me — "who am I", answered from the token the caller is holding.
 *
 * The web app calls this on every load: after a refresh it has a token in storage
 * but no idea whose it is, and this rehydrates the session without a fresh login.
 *
 * `roles` appears HERE and nowhere else the browser can reach. It is absent from
 * the login response and from the JWT, both on purpose, so that the only way the
 * UI learns a user's roles is a live, authenticated call the server answers from
 * the database — never a stale claim baked into a token. And it is for ONE thing:
 * deciding which menu items to render. It is not, and must never become, an access
 * decision; the server re-checks every endpoint regardless of what menu was shown.
 * Role codes ('doctor', 'nurse'), not permissions — the nav keys off roles.
 */
export const meResponseSchema = z.object({
  user: authUserSchema,
  roles: z.array(z.string()),
})

export type MeResponse = z.infer<typeof meResponseSchema>

/**
 * POST /auth/refresh — spend a refresh token for a fresh access token (task 1.8).
 *
 * Public: the whole reason to call it is that the access token has expired, so it
 * cannot be the thing that authenticates the call. The refresh token does — the
 * server hashes it, finds the Session, and checks it is live. No rotation: the
 * same refresh token stays valid for its 7-day life, so only a new accessToken
 * comes back. Revocation still works — logout and a new login elsewhere kill the
 * Session, and then this fails.
 */
export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
})

export type RefreshRequest = z.infer<typeof refreshRequestSchema>

export const refreshResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
})

export type RefreshResponse = z.infer<typeof refreshResponseSchema>

/**
 * The reason a session ended, sent in the 401 body when a refresh is refused, so
 * the ended device can say WHY rather than a blank "signed out":
 *  - superseded: you signed in on another device (single-session policy).
 *  - deactivated: an admin disabled the account.
 *  - expired: the refresh token's 7 days ran out.
 *  - invalid: no such live session — a logged-out or unknown token.
 */
export const sessionEndedReasonSchema = z.enum([
  'superseded',
  'deactivated',
  'expired',
  'invalid',
])

export type SessionEndedReason = z.infer<typeof sessionEndedReasonSchema>

/**
 * POST /auth/logout — revoke the caller's own session. Public for the same reason
 * as refresh (the access token may already be expired when someone signs out); the
 * refresh token names the session to kill. Idempotent — revoking an already-dead
 * session is a no-op, never an error.
 */
export const logoutRequestSchema = z.object({
  refreshToken: z.string().min(1),
})

export type LogoutRequest = z.infer<typeof logoutRequestSchema>

/** A bare acknowledgement — logout has nothing to return but "done". */
export const logoutResponseSchema = z.object({
  success: z.literal(true),
})

export type LogoutResponse = z.infer<typeof logoutResponseSchema>
