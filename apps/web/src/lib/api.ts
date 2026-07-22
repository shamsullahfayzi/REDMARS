import type { z } from 'zod'
import { refreshResponseSchema, sessionEndedReasonSchema, type SessionEndedReason } from '@redmars/shared'
import { clearTokens, getAccessToken, getRefreshToken, setAccessToken } from './authTokens'

/**
 * The one place the browser talks to the API.
 *
 * Every response is parsed against its shared schema before it reaches a
 * component. The network is the boundary where types stop being guaranteed —
 * TypeScript checked what the API *said* it returns at compile time, but a stale
 * server, a proxy, or a half-deployed build can put anything on the wire. Parsing
 * here means a contract violation surfaces as a loud error at the edge, rather
 * than as `undefined` rendering into a dose field three components deep.
 *
 * It is also where the access token is silently refreshed (task 1.8): a 401 on an
 * ordinary call triggers one refresh and one retry, so a 15-minute token expiring
 * mid-consult is invisible to the user rather than a bounce to the login screen.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/** The auth endpoints never auto-refresh: login/logout have no live session to renew, and refresh renewing itself is an infinite loop. */
const NO_REFRESH_PATHS = new Set(['/auth/login', '/auth/refresh', '/auth/logout'])

export class ApiError extends Error {
  /** 0 means the request never reached the server. */
  readonly status: number

  /**
   * The parsed error body, when the server sent one. Some failures carry the detail
   * that makes them actionable — a 409 from patient create returns the duplicates it
   * refused on, and the desk cannot decide anything without seeing them.
   */
  readonly body: unknown

  // Fields declared and assigned separately rather than as constructor
  // parameter properties: this app builds with erasableSyntaxOnly, which forbids
  // syntax that emits runtime code.
  constructor(message: string, status: number, body?: unknown, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/**
 * The refusal the SERVER wrote, when it wrote one for a person to read.
 *
 * `ApiError.message` is a developer string — "/visits/x/prescription failed" — and must
 * never reach a user. The sentence worth showing is in the body, and this is how it gets
 * out of there.
 *
 * ONLY WHEN THE BODY CARRIES A `code`, which is the line between the two kinds of error
 * this API produces. A refusal we deliberately threw looks like
 * `{ message: 'Your account is not linked to a practitioner…', code: 'no_practitioner' }` —
 * authored for a user, in their language of the problem, and far more useful than any
 * generic string a screen can offer. Everything else — Nest's own "Forbidden resource",
 * "Cannot POST /x", the filter's flat "Internal server error" — has no `code`, is written
 * for a log, and returns null here so the caller falls back to its own wording.
 *
 * The cost of not having this was measured: a prescription save refused with a precise,
 * fixable reason showed on screen as "Could not save the prescription", and the reason sat
 * unread in a response body.
 */
export function serverMessage(error: unknown): string | null {
  if (!(error instanceof ApiError) || typeof error.body !== 'object' || error.body === null) {
    return null
  }
  const body = error.body as { message?: unknown; code?: unknown }
  if (typeof body.code !== 'string' || !body.code) return null
  return typeof body.message === 'string' && body.message.trim() ? body.message : null
}

/**
 * Called when a refresh is refused — the session is truly over (signed in
 * elsewhere, deactivated, expired). AuthProvider registers this to drop to the
 * login screen with the reason. Kept as a bare callback rather than an import so
 * the api layer does not depend on React.
 */
let onSessionEnded: ((reason: SessionEndedReason) => void) | null = null

export function setOnSessionEnded(callback: (reason: SessionEndedReason) => void): void {
  onSessionEnded = callback
}

/**
 * Attaches the access token to every request that has one. A request made before
 * login (the login POST itself) simply has no token and goes out bare — the
 * endpoint it targets is @Public. Once a token exists, it rides on every call.
 */
function buildHeaders(hasJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {}
  if (hasJsonBody) headers['Content-Type'] = 'application/json'
  const token = getAccessToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

async function rawFetch(method: string, path: string, body?: unknown): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: buildHeaders(body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (cause) {
    // fetch only rejects on network failure — server unreachable, DNS, CORS.
    throw new ApiError(`Cannot reach the API at ${API_BASE_URL}`, 0, undefined, { cause })
  }
}

// Single-flight: if ten queries 401 at the same instant when a token expires, they
// must share ONE refresh, not fire ten. The first starts it; the rest await it.
let refreshInFlight: Promise<boolean> | null = null

function ensureFreshToken(): Promise<boolean> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    endSession('invalid')
    return false
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
  } catch {
    // A network blip during refresh is not proof the session is dead — do not log
    // the user out over it. The original call will surface its own error.
    return false
  }

  if (response.ok) {
    const json: unknown = await response.json()
    const parsed = refreshResponseSchema.safeParse(json)
    if (parsed.success) {
      setAccessToken(parsed.data.accessToken)
      return true
    }
    return false
  }

  // Refresh refused: the session is over. Read WHY from the body so the login
  // screen can say "signed in elsewhere" rather than a blank "signed out".
  let reason: SessionEndedReason = 'invalid'
  try {
    const body: unknown = await response.json()
    const candidate = (body as { reason?: unknown }).reason
    const parsed = sessionEndedReasonSchema.safeParse(candidate)
    if (parsed.success) reason = parsed.data
  } catch {
    // No or non-JSON body — keep the generic 'invalid'.
  }
  endSession(reason)
  return false
}

function endSession(reason: SessionEndedReason): void {
  clearTokens()
  onSessionEnded?.(reason)
}

async function request<TSchema extends z.ZodType>(
  method: string,
  path: string,
  schema: TSchema,
  body?: unknown,
): Promise<z.infer<TSchema>> {
  let response = await rawFetch(method, path, body)

  // Expired access token: refresh once and replay the request. Only for ordinary
  // calls that carry a token — never the auth endpoints, and never without a
  // refresh token to spend.
  if (response.status === 401 && !NO_REFRESH_PATHS.has(path) && getRefreshToken()) {
    const refreshed = await ensureFreshToken()
    if (refreshed) {
      response = await rawFetch(method, path, body)
    }
    // If not refreshed, endSession has already fired; the original 401 falls
    // through and surfaces as an error to the caller.
  }

  return parseResponse(path, response, schema)
}

export function apiGet<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  return request('GET', path, schema)
}

export function apiPost<TSchema extends z.ZodType>(
  path: string,
  body: unknown,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  return request('POST', path, schema, body)
}

export function apiPatch<TSchema extends z.ZodType>(
  path: string,
  body: unknown,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  return request('PATCH', path, schema, body)
}

export function apiPut<TSchema extends z.ZodType>(
  path: string,
  body: unknown,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  return request('PUT', path, schema, body)
}

// DELETE routes return the fresh collection (not 204), so the response parses
// against a schema exactly like the others.
export function apiDelete<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  return request('DELETE', path, schema)
}

/**
 * The shared tail of every request: reject non-2xx by status (the caller decides
 * what a 401 or 400 means), then parse the body against the agreed schema so a
 * 200 with the wrong shape is a loud error here, not silent corruption downstream.
 */
async function parseResponse<TSchema extends z.ZodType>(
  path: string,
  response: Response,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  if (!response.ok) {
    // Read the body if there is one; a failure that explains itself is worth more
    // than a bare status. A missing or non-JSON body is not itself an error.
    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
    throw new ApiError(`${path} failed`, response.status, body)
  }

  const json: unknown = await response.json()

  const result = schema.safeParse(json)
  if (!result.success) {
    // The API returned 200 but not the shape we agreed on. That is a bug on one
    // side or a version mismatch between the two — either way, do not pretend.
    throw new ApiError(`${path} returned an unexpected shape`, response.status)
  }

  return result.data
}
