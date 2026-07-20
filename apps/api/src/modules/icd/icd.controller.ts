import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { icdSearchQuerySchema, type IcdSearchResponse } from '@redmars/shared';
import type { AuthContext } from '../../auth/auth-context';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { IcdService } from './icd.service';

/**
 * ICD-10 diagnosis lookup (task 2.9). Read-only: the catalog is seeded reference
 * data, not something an app user edits. Gated on diagnosis.read — held by the
 * doctor (who searches while recording a diagnosis) and the admin (R2). The codes
 * themselves are public WHO data, but the route still passes through the guard like
 * every other, and diagnosis.read is the permission that fits who needs it.
 */
@Controller('icd')
export class IcdController {
  constructor(private readonly icd: IcdService) {}

  @RequirePermission('diagnosis.read')
  @Get()
  search(@Req() req: Request, @Query() query: unknown): Promise<IcdSearchResponse> {
    this.auth(req); // authenticated + permitted; the catalog is not facility-scoped
    const parsed = icdSearchQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid search',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.icd.search(parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
