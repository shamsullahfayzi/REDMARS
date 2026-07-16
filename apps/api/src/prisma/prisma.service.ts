import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AuditAction, Prisma, PrismaClient } from '@prisma/client';
import { requestContext } from '../audit/request-context';

/**
 * Writes we turn into audit rows. Reads (findUnique, findMany) are Rule R1's
 * territory and land in task 1.5, not here. Batch ops (createMany, updateMany,
 * deleteMany, upsert) are deliberately absent: they touch many rows at once and a
 * single before/after can't describe that honestly. We don't run them on clinical
 * data yet — when we do, that is its own task, not a quiet extension of this Set.
 */
const AUDITED_OPERATIONS = new Set<string>(['create', 'update', 'delete']);

/**
 * Fields that must never reach the audit table. A row's before/after is a verbatim
 * copy, and audit_log rides the nightly pg_dump off-site (0.9) — so an un-redacted
 * AppUser write would copy every password hash into a second file that leaves the
 * building. Redaction keeps the fact of the change (the field was touched) without
 * the secret.
 */
const SECRET_FIELDS = new Set<string>(['passwordHash', 'refreshTokenHash']);

const ACTION_MAP: Record<string, AuditAction> = {
  create: AuditAction.create,
  update: AuditAction.update,
  delete: AuditAction.delete,
};

/** 'AppUser' -> 'appUser'. The model name the extension is handed vs the client delegate. */
function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/**
 * Strip secrets, then JSON round-trip. The round-trip turns Date values into ISO
 * strings and drops `undefined`, producing something Prisma's Json column accepts
 * — a raw Date is not a JsonValue and would throw. Returns null for a null row so
 * the caller can map it to a SQL NULL.
 */
function redactAndSerialize(row: unknown): Prisma.InputJsonValue | null {
  if (row === null || row === undefined || typeof row !== 'object') return null;
  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    clone[key] = SECRET_FIELDS.has(key) ? '[redacted]' : value;
  }
  return JSON.parse(JSON.stringify(clone)) as Prisma.InputJsonValue;
}

/** Minimal shape of a client delegate we call by name for the before-image read. */
type FindUniqueDelegate = { findUnique(args: { where: unknown }): Promise<unknown> };

/**
 * The Prisma client, owned by Nest's lifecycle.
 *
 * Two clients live here on ONE database connection:
 *   - `this` (the base) — the un-audited PrismaClient. Used only inside this class,
 *     for the audit middleware's own before-image reads and audit-row writes, which
 *     must NOT themselves be audited (that would recurse forever).
 *   - `this.db` (the extended) — the audited client. THIS is the handle every
 *     service, guard and controller uses. Every create/update/delete through it
 *     leaves an AuditLog row; reads pass through untouched.
 *
 * Why $extends and not $use: $use — the old middleware API — was removed in Prisma
 * 6.19. $extends is the only door left, and it returns a NEW client object rather
 * than mutating this one, which is why the audited handle is a separate property
 * (`.db`) rather than the service itself. Callers say `prisma.db.patient`, and the
 * bare `prisma.patient` is the un-audited base they must not reach for.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /**
   * The audited client. Same engine and connection as the base — $extends does not
   * open a second pool — so connecting the base below connects this too.
   */
  readonly db = this.buildAuditedClient();

  async onModuleInit(): Promise<void> {
    // Connecting the base connects `this.db` with it: they share one engine.
    await this.$connect();
    this.logger.log('Connected to database');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from database');
  }

  /**
   * Task 1.4 — the audit writer.
   *
   * Every create/update/delete through the returned client passes through here.
   * The actor (who, from where) is not visible at this layer; the AuditInterceptor
   * put it in an AsyncLocalStorage scope up at the request, and writeAuditRow reads
   * it back out. Writes through a raw `new PrismaClient()` — the seed script, test
   * fixtures — never touch this client and are correctly left un-audited.
   */
  private buildAuditedClient() {
    return this.$extends({
      query: {
        $allModels: {
          $allOperations: async ({ model, operation, args, query }) => {
            if (!AUDITED_OPERATIONS.has(operation)) {
              return query(args);
            }

            // The before-image. An update overwrites the old row, so we read it
            // first — through the BASE client (`this`), so this read is not itself
            // audited and cannot recurse. A delete instead returns the row it
            // removed, so we take `before` from the result and skip the extra read.
            let before: unknown = null;
            if (operation === 'update') {
              const where = (args as { where?: unknown }).where;
              if (where) {
                const delegate = (this as unknown as Record<string, FindUniqueDelegate>)[
                  delegateName(model)
                ];
                before = await delegate.findUnique({ where });
              }
            }

            const result: unknown = await query(args);

            let after: unknown = result;
            if (operation === 'delete') {
              before = result; // Prisma returns the deleted row.
              after = null;
            }

            // Best-effort, loud on failure. A clinical write must NOT be undone
            // because its audit row failed to insert — that trades patient care for
            // bookkeeping. But a write with no audit row is a hole, so a failure is
            // logged at error level for reconciliation, the same standard as a
            // backup that fails silently into a logfile nobody reads.
            try {
              await this.writeAuditRow(model, operation, before, after);
            } catch (err) {
              this.logger.error(
                `Audit write FAILED for ${operation} ${model} — the data change succeeded but left no audit row`,
                err instanceof Error ? err.stack : String(err),
              );
            }

            return result;
          },
        },
      },
    });
  }

  private async writeAuditRow(
    model: string,
    operation: string,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    const ctx = requestContext.getStore();
    const beforeRow = before as Record<string, unknown> | null;
    const afterRow = after as Record<string, unknown> | null;

    // facilityId is required and is the tenant the record belongs to. Prefer the
    // row's own facilityId; fall back to the actor's when the row has none (a join
    // table like UserRole). If neither exists — a write outside any request, on a
    // model with no facilityId — we cannot attribute it and skip rather than guess.
    // In practice this only hits login's Session.create, which 1.8 audits properly.
    const facilityId =
      (afterRow?.facilityId as string | undefined) ??
      (beforeRow?.facilityId as string | undefined) ??
      ctx?.facilityId;

    if (!facilityId) {
      this.logger.warn(
        `Skipped audit for ${operation} ${model}: no facilityId on the row and no request context to borrow one from`,
      );
      return;
    }

    const entityId =
      (afterRow?.id as string | undefined) ?? (beforeRow?.id as string | undefined) ?? null;

    // Written through the BASE client (`this`), not `this.db`: the audit row is a
    // write too, and routing it through the audited client would audit the audit.
    await this.auditLog.create({
      data: {
        facilityId,
        // null, not a fabricated actor: a write with no logged-in user (or from
        // outside a request) is recorded as actor-less, which is the truth.
        userId: ctx?.userId ?? null,
        action: ACTION_MAP[operation],
        entity: model,
        entityId,
        before: redactAndSerialize(before) ?? Prisma.DbNull,
        after: redactAndSerialize(after) ?? Prisma.DbNull,
        ipAddress: ctx?.ipAddress ?? null,
      },
    });
  }
}
