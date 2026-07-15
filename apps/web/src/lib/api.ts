import type { z } from 'zod'

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
    response = await fetch(`${API_BASE_URL}${path}`)
  } catch (cause) {
    // fetch only rejects on network failure — server unreachable, DNS, CORS.
    throw new ApiError(`Cannot reach the API at ${API_BASE_URL}`, 0, { cause })
  }

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
