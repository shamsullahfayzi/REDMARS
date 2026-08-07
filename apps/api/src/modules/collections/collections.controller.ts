import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { collectionsListQuerySchema, type CollectionsListResponse } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuthContext } from '../../auth/auth-context';
import { CollectionsService } from './collections.service';

/**
 * Task 6b.7 — "Reception finds an unpaid bill without opening the patient."
 *
 * `invoice.read`, the same gate the register (6.1) sits behind — this is that same read,
 * pre-filtered. No @AuditRead: like `InvoiceController.list`, this is a worklist over many
 * patients at once, not a look into one patient's record.
 */
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get()
  @RequirePermission('invoice.read')
  list(@Req() req: Request, @Query() rawQuery: unknown): Promise<CollectionsListResponse> {
    const parsed = collectionsListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid collections filter',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const auth = this.auth(req);
    return this.collections.list(auth.facilityId, auth.permissions, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
