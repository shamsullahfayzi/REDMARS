import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Shared across API workers and restarts. Uses database time, not proxy headers. */
@Injectable()
export class RateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  async consume(facilityId: string, userId: string, scope: string, limit: number) {
    const key = createHash('sha256')
      .update(JSON.stringify([facilityId, userId, scope]))
      .digest('hex');
    // One bounded counter per authenticated user/scope. Raw SQL is deliberate:
    // transient request accounting must not generate a business audit per request.
    const [row] = await this.prisma.$queryRaw<Array<{ count: number; retryAfter: number }>>`
      INSERT INTO rate_limit_bucket (key, expires_at, count)
      VALUES (${key}, CURRENT_TIMESTAMP + INTERVAL '60 seconds', 1)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limit_bucket.expires_at <= CURRENT_TIMESTAMP THEN 1
                     ELSE LEAST(rate_limit_bucket.count + 1, ${limit + 1}) END,
        expires_at = CASE WHEN rate_limit_bucket.expires_at <= CURRENT_TIMESTAMP
                         THEN CURRENT_TIMESTAMP + INTERVAL '60 seconds'
                         ELSE rate_limit_bucket.expires_at END
      RETURNING count, GREATEST(1, CEIL(EXTRACT(EPOCH FROM expires_at - CURRENT_TIMESTAMP)))::int AS "retryAfter"
    `;
    return { allowed: row.count <= limit, retryAfter: row.retryAfter };
  }
}
