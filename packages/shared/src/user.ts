import { z } from 'zod'

/**
 * Staff account management — the contract for the admin screens (task 1.7).
 *
 * Hand-written, never derived from Prisma: AppUser holds passwordHash, and a
 * schema built from the model is one careless field away from shipping an argon2
 * hash to the browser. Only what an admin may see and send is listed here.
 */

/**
 * The eight roles, mirrored from apps/api/src/auth/permissions.ts, which is the
 * source of truth. Duplicated here so the browser can render the assignable-role
 * list and type the create form; the server still validates every code against
 * the roles actually in the database. Keep the two lists in step — the schema
 * pins them, so drift is unlikely but not impossible.
 */
export const ROLE_CODES = [
  'admin',
  'receptionist',
  'nurse',
  'doctor',
  'lab_tech',
  'pharmacist',
  'management',
  'call_center',
] as const

export type RoleCode = (typeof ROLE_CODES)[number]

/**
 * Creating a staff account. The admin sets the initial password directly — there
 * is no force-change-on-first-login yet (it needs a change-password flow that does
 * not exist), so the 8-char floor is the only policy standing between a new
 * account and a guessable one. roleCodes must not be empty: an account with no
 * role can log in and do nothing, which is a support ticket, not a user.
 */
export const createUserRequestSchema = z.object({
  username: z.string().trim().min(1, 'Username is required').max(64),
  fullName: z.string().trim().min(1, 'Full name is required').max(200),
  email: z.email().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(256),
  roleCodes: z.array(z.enum(ROLE_CODES)).min(1, 'Assign at least one role'),
})

export type CreateUserRequest = z.infer<typeof createUserRequestSchema>

/**
 * One staff account as the admin list shows it. No password field of any kind —
 * not the hash, not a placeholder. Dates are ISO strings: they cross the wire as
 * JSON, and the server converts them so the browser never guesses a format.
 */
export const userSummarySchema = z.object({
  id: z.uuid(),
  username: z.string(),
  fullName: z.string(),
  email: z.string().nullable(),
  isActive: z.boolean(),
  roles: z.array(z.string()),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
})

export type UserSummary = z.infer<typeof userSummarySchema>

export const userListResponseSchema = z.object({
  users: z.array(userSummarySchema),
})

export type UserListResponse = z.infer<typeof userListResponseSchema>

/** Deactivate or reactivate an account. Never a delete — clinical-adjacent records are historical. */
export const setUserActiveRequestSchema = z.object({
  isActive: z.boolean(),
})

export type SetUserActiveRequest = z.infer<typeof setUserActiveRequestSchema>
