import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse } from '@redmars/shared';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness + DB readiness in one call.
   *
   * The DB round-trip is the point: the API process can be perfectly healthy
   * while Postgres is unreachable, and a check that only proves "Node is up"
   * would report green through an outage.
   */
  /**
   * The return type is the shared contract, so if apps/web changes what it
   * expects, this stops compiling. That is the whole trick — the type is not a
   * comment, it is a build failure.
   */
  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error(
        'Health check failed: database unreachable',
        error instanceof Error ? error.stack : String(error),
      );

      // 503, not 500 — this is "come back later", not "you sent something bad".
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
      });
    }

    return {
      status: 'ok',
      database: 'up',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
