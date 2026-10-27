import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RateLimitService } from '../../common/rate-limit.service';

@Injectable()
export class CrmRateLimitGuard implements CanActivate {
  constructor(private readonly limits: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.auth) throw new UnauthorizedException();
    const reading = req.method === 'GET';
    const result = await this.limits.consume(
      req.auth.facilityId,
      req.auth.userId,
      reading ? 'crm.read' : 'crm.write',
      reading ? 60 : 10,
    );
    if (!result.allowed) {
      context.switchToHttp().getResponse<Response>().setHeader('Retry-After', result.retryAfter);
      throw new HttpException(
        { code: 'crm_rate_limit', message: 'Too many requests. Wait a minute and try again.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
