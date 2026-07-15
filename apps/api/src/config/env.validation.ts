import { z } from 'zod';

/**
 * The environment contract. Checked once, at boot.
 *
 * If DATABASE_URL is missing or malformed the process must die immediately and
 * loudly. The alternative — booting fine and throwing a confusing 500 at the
 * first patient lookup — is how you end up debugging config during a clinic day.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z
    .string()
    .min(1)
    .refine((v) => v.startsWith('postgresql://') || v.startsWith('postgres://'), {
      message: 'must be a postgresql:// connection string',
    }),

  /**
   * Exact origin allowed to call this API from a browser. Never '*': once auth
   * cookies exist (Phase 1) a wildcard is both illegal and a way to let any page
   * on the LAN read patient data using the logged-in user's session.
   * In production the web app is served from the same origin, so this mostly
   * matters for local dev.
   */
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new Error(`Invalid environment variables:\n${details}`);
  }

  return result.data;
}
