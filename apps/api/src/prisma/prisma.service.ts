import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * The Prisma client, owned by Nest's lifecycle.
 *
 * Extending PrismaClient means every model is reachable as `prisma.patient`,
 * `prisma.visit`, etc. Connect on boot so a bad DATABASE_URL fails at startup;
 * disconnect on shutdown so restarts don't leak connections.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to database');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from database');
  }
}
