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
