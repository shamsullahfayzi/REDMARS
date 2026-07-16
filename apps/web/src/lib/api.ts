import type { z } from 'zod'
import { getAccessToken } from './authTokens'

/**
 * The one place the browser talks to the API.
 *
 * Every response is parsed against its shared schema before it reaches a
 * component. The network is the boundary where types stop being guaranteed —
 * TypeScript checked what the API *said* it returns at compile time, but a stale
 * server, a proxy, or a half-deployed build can put anything on the wire. Parsing
 * here means a contract violation surfaces as a loud error at the edge, rather
 * than as `undefined` rendering into a dose field three components deep.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/**
 * Attaches the access token to every request that has one. A request made before
 * login (the login POST itself) simply has no token and goes out bare — the
 * endpoint it targets is @Public. Once a token exists, it rides on every call, and
 * the server decides per endpoint whether it is enough.
 */
function buildHeaders(hasJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {}
  if (hasJsonBody) headers['Content-Type'] = 'application/json'
  const token = getAccessToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

export class ApiError extends Error {
  /** 0 means the request never reached the server. */
  readonly status: number

  // Field declared and assigned separately rather than as a constructor
  // parameter property: this app builds with erasableSyntaxOnly, which forbids
  // syntax that emits runtime code.
  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiGet<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, { headers: buildHeaders(false) })
  } catch (cause) {
    // fetch only rejects on network failure — server unreachable, DNS, CORS.
    throw new ApiError(`Cannot reach the API at ${API_BASE_URL}`, 0, { cause })
  }

  return parseResponse(path, response, schema)
}

/**
 * POST with a JSON body, same parse-at-the-boundary contract as apiGet. Used by
 * login (public, no token yet) and every future write. The body is typed unknown
 * on purpose: this function does not know or care what it is sending, only that
 * the response must match the schema before a component sees it.
 */
export async function apiPost<TSchema extends z.ZodType>(
  path: string,
  body: unknown,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: buildHeaders(true),
      body: JSON.stringify(body),
    })
  } catch (cause) {
    throw new ApiError(`Cannot reach the API at ${API_BASE_URL}`, 0, { cause })
  }

  return parseResponse(path, response, schema)
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
    throw new ApiError(`${path} failed`, response.status)
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
