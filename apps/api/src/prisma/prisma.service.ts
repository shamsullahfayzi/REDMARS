import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AuditAction, Prisma, PrismaClient } from '@prisma/client';
import { requestContext } from '../audit/request-context';
import { auditedClient } from './transactional-audit';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  readonly db = auditedClient(this);

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
  async recordRead(entity: string, entityId: string | null): Promise<void> {
    const ctx = requestContext.getStore();

    // A clinical read is always made by a logged-in clinician, so the actor's
    // facility is the tenant. No context means this was called outside a request —
    // there is nothing to attribute, and nothing a user did to record.
    if (!ctx?.facilityId) {
      this.logger.warn(`Skipped read audit for ${entity}: no request context to attribute it to`);
      return;
    }

    try {
      await this.auditLog.create({
        data: {
          facilityId: ctx.facilityId,
          userId: ctx.userId ?? null,
          action: AuditAction.read,
          entity,
          entityId,
          before: Prisma.DbNull,
          after: Prisma.DbNull,
          ipAddress: ctx.ipAddress ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Read audit FAILED for ${entity} ${entityId ?? '(no id)'} — the read succeeded but left no audit row`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Task 1.8 — the dedicated auth-event actions (login, logout) that task 1.4
   * deferred to here. These are NOT database writes the query extension can see —
   * a login is a fact about a person, not a row-mutation with a before/after — so
   * the caller states the actor explicitly rather than the extension inferring it.
   *
   * Written through the BASE client so the event is not itself audited. Best-effort
   * and loud on failure, like read auditing: a missing auth
   * row is a hole worth an error line, but must never fail the login or logout it
   * describes. entity is 'AppUser' keyed to the person the event is about.
   */
  async recordAuthEvent(
    action: AuditAction,
    actor: { userId: string | null; facilityId: string; ipAddress?: string },
  ): Promise<void> {
    try {
      await this.auditLog.create({
        data: {
          facilityId: actor.facilityId,
          userId: actor.userId,
          action,
          entity: 'AppUser',
          entityId: actor.userId,
          before: Prisma.DbNull,
          after: Prisma.DbNull,
          ipAddress: actor.ipAddress ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Auth-event audit FAILED for ${action} — the action succeeded but left no audit row`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}

export type AuditedTx = Prisma.TransactionClient;
