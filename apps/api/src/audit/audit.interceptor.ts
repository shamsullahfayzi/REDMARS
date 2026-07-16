import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, Subscription, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { AUDIT_READ_KEY } from './decorators/audit-read.decorator';
import { requestContext, type RequestContext } from './request-context';

/**
 * Tasks 1.4 + 1.5 — the two request-side halves of the audit trail.
 *
 * WHAT THIS DOES NOT DO (writes): it does not write a single AuditLog row for a
 * mutation. An interceptor sits at the HTTP boundary and never learns which rows a
 * handler changed, nor their value before the write. Those rows come from the
 * Prisma audit middleware in prisma.service.ts. What this DOES for writes is name
 * the actor: it runs after the guards (Nest order: guards → interceptors), so
 * request.auth is set, and opens an AsyncLocalStorage scope carrying that identity
 * for the whole downstream request. The write reads the actor back out of it.
 *
 * WHAT THIS DOES DO (reads, R1): a read is the opposite shape. It never mutates,
 * so it has no before/after, and the HTTP layer already holds everything a read
 * row needs — actor, entity, id. So for a route marked @AuditRead, THIS layer
 * writes the `action: read` row itself, after the handler succeeds. Opt-in on
 * purpose: only named clinical reads are logged, never the machinery reads every
 * request makes.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const auth = request.auth;

    // No auth means a @Public route — login, health. Nobody is identified, so
    // there is no actor to stamp. We still let the handler run; if it happens to
    // write (login updates lastLoginAt), the audit middleware records it with a
    // null actor, which is the truth. Opening an empty scope would buy nothing.
    if (!auth) {
      return next.handle();
    }

    const store: RequestContext = {
      userId: auth.userId,
      facilityId: auth.facilityId,
      username: auth.username,
      ipAddress: request.ip,
    };

    // A clinical-read route names the entity it reads; an ordinary route returns
    // undefined here and gets no read row. Read from handler first, then class.
    const auditReadEntity = this.reflector.getAllAndOverride<string | undefined>(AUDIT_READ_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // The subtle part. requestContext.run(store, fn) makes the store visible only
    // for the synchronous span of fn. next.handle() returns an Observable and does
    // NOTHING until it is subscribed — and that subscription drives the actual
    // handler, its awaits, and its Prisma calls. So the .run() must wrap the
    // .subscribe(), not just the .handle(). Wrapping only handle() would set the
    // context, return an unsubscribed Observable, and tear the context down before
    // the handler ever ran — getStore() would be undefined at the write.
    //
    // AsyncLocalStorage propagates across every await beneath this subscribe, which
    // is how a Prisma call three service-layers deep still sees the same actor, and
    // how recordRead below finds the store from inside the tap.
    return new Observable((subscriber) => {
      let subscription: Subscription | undefined;
      requestContext.run(store, () => {
        // The read row is written only on SUCCESS (tap's next), never on error: R1
        // audits reads of records, and a handler that threw returned no record. The
        // write is fire-and-forget — recordRead swallows its own failures — because
        // R1 forbids a read being blocked, and awaiting the log would do exactly
        // that. entityId comes from the returned record's id, falling back to the
        // route param, then null (a list read has no single id).
        const stream = auditReadEntity
          ? next.handle().pipe(
              tap((response) => {
                void this.prisma.recordRead(auditReadEntity, extractEntityId(response, request));
              }),
            )
          : next.handle();
        subscription = stream.subscribe(subscriber);
      });
      return () => subscription?.unsubscribe();
    });
  }
}

/** The id of the record that was read: the response's own id, else the :id route param, else null. */
function extractEntityId(response: unknown, request: Request): string | null {
  if (response && typeof response === 'object' && 'id' in response) {
    const id: unknown = response.id;
    if (typeof id === 'string') return id;
  }
  const paramId = request.params?.id;
  return typeof paramId === 'string' ? paramId : null;
}
