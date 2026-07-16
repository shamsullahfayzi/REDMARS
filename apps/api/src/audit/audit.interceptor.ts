import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, Subscription } from 'rxjs';
import { requestContext, type RequestContext } from './request-context';

/**
 * Task 1.4 — the named deliverable.
 *
 * WHAT THIS DOES NOT DO — read this before trusting the name: it does not write
 * a single AuditLog row. It cannot; an interceptor sits at the HTTP boundary and
 * never learns which database rows a handler touched, nor their value before the
 * write. The rows are written by the Prisma audit middleware in prisma.service.ts,
 * which is the only layer that sees the write itself.
 *
 * What this DOES is the half the Prisma layer can't reach: it names the actor. It
 * runs after the guards (Nest order: guards → interceptors), so request.auth is
 * already populated by JwtAuthGuard, and it opens an AsyncLocalStorage scope
 * carrying that identity for the whole downstream request. The write, whenever
 * and wherever it happens, reads the actor back out of that scope.
 *
 * Split this way on purpose: WHO lives at the request, WHAT lives at the write,
 * and neither layer can see the other's half.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
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

    // The subtle part. requestContext.run(store, fn) makes the store visible only
    // for the synchronous span of fn. next.handle() returns an Observable and does
    // NOTHING until it is subscribed — and that subscription drives the actual
    // handler, its awaits, and its Prisma calls. So the .run() must wrap the
    // .subscribe(), not just the .handle(). Wrapping only handle() would set the
    // context, return an unsubscribed Observable, and tear the context down before
    // the handler ever ran — getStore() would be undefined at the write.
    //
    // AsyncLocalStorage propagates across every await beneath this subscribe, which
    // is how a Prisma call three service-layers deep still sees the same actor.
    return new Observable((subscriber) => {
      let subscription: Subscription | undefined;
      requestContext.run(store, () => {
        subscription = next.handle().subscribe(subscriber);
      });
      return () => subscription?.unsubscribe();
    });
  }
}
