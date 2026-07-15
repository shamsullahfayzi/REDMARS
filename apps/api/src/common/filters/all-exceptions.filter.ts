import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Last line of defence for every error that reaches the transport layer.
 *
 * Confidentiality rule: the caller receives a shape we chose and nothing else.
 * An unhandled Prisma/driver error can carry SQL fragments, column values, or
 * patient data in its message, and a stack trace hands an attacker a map of the
 * internals. So anything that is not an HttpException we deliberately threw is
 * reported as a plain 500; the detail goes to the server log only.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
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

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(line, detail);
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
