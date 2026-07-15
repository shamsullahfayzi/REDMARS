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

    // Full detail, server-side only.
    this.logger.error(
      `${request.method} ${request.url} -> ${status}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

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
