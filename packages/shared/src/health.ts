import { z } from 'zod'

/**
 * GET /health, 200 response.
 *
 * This schema is the contract between apps/api and apps/web. It is written by
 * hand rather than derived from Prisma on purpose: what the API promises and
 * what the database happens to store are two different things, and they should
 * be free to drift apart. Deriving wire types from DB models also leaks column
 * names and table shape into the browser bundle, which is not something we want
 * to do with a psychiatric hospital's schema.
 *
 * Failure is expressed with the HTTP status (503), not a variant of this shape.
 */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  database: z.literal('up'),
  uptimeSeconds: z.number().int().nonnegative(),
  timestamp: z.iso.datetime(),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>
