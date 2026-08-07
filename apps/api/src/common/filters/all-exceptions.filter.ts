import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Last line of defence for every error that reaches the transport layer.
 *
 * Confidentiality rule: the caller receives a shape we chose and nothing else.
 * An unhandled Prisma/driver error can carry SQL fragments, column values, or
 * patient data in its message, and a stack trace hands an attacker a map of the
 * internals. So anything that is not an HttpException we deliberately threw is
 * reported as a plain 500; the detail goes to the server log only.
 *
 * Task 7.8 — every 5xx ALSO lands in `error_log` (see the docblock on that model),
 * so "the server log" means a screen in the app, not a terminal someone has to SSH
 * into at 2am. `@Injectable()` and registered via APP_FILTER (app.module.ts) rather
 * than `new AllExceptionsFilter()` in main.ts, specifically so Nest's DI hands it a
 * real PrismaService instead of it having none at all.
 */
@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly prisma: PrismaService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    // number, not HttpStatus: getStatus() returns a plain number and an
    // HttpException can legally carry a code that is not in the enum. Typing
    // this as HttpStatus would be a claim the runtime does not honour.
    const status: number = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    // Severity follows fault, and the log is written for whoever is on call at
    // 2am. A 404 for a browser's probe file and a Prisma connection collapse are
    // not the same event, and logging both as ERROR with a stack trace means the
    // real one is buried in noise nobody reads — the same way a backup that
    // fails into an unread logfile is a backup that does not exist.
    //
    // 5xx is our fault: full stack, someone must look at it.
    // 4xx is the caller's: one line, no stack. Nothing is broken here. Chrome
    // DevTools probing /.well-known/appspecific/com.chrome.devtools.json is a
    // 404 answered correctly, not an incident.
    //
    // No path is special-cased. A rule that needs a list of URLs to stay quiet
    // is a rule that will be wrong about the next URL.
    const detail = exception instanceof Error ? exception.stack : String(exception);
    const line = `${request.method} ${request.url} -> ${status}`;

    // A bare 500 rather than HttpStatus.INTERNAL_SERVER_ERROR: this is a range
    // test for "5xx", not a comparison against one enum member, and writing it
    // as the latter says something the check does not mean.
    if (status >= 500) {
      this.logger.error(line, detail);
      // Fire-and-forget on purpose: a caller waiting on a 500 must not wait longer
      // because the error-logging write is itself slow or the DB is the thing that
      // just fell over. Failure here is swallowed to a console line — this table
      // is a convenience for whoever is on call, never a second point of failure.
      void this.prisma.errorLog
        .create({
          data: {
            facilityId: request.auth?.facilityId ?? null,
            userId: request.auth?.userId ?? null,
            method: request.method,
            path: request.url,
            statusCode: status,
            message: exception instanceof Error ? exception.message : String(exception),
            stack: detail ?? null,
            ipAddress: request.ip ?? null,
          },
        })
        .catch((writeError: unknown) => {
          this.logger.error('Failed to write error_log row', writeError);
        });
    } else {
      this.logger.warn(line);
    }

    // HttpExceptions carry messages we authored, so they are safe to return.
    // Everything else is unknown territory and gets a generic message.
    const payload = isHttpException ? exception.getResponse() : 'Internal server error';

    response.status(status).json({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(typeof payload === 'string' ? { message: payload } : payload),
    });
  }
}
