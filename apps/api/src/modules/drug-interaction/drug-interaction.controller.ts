import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { interactionCheckQuerySchema, type InteractionCheckResponse } from '@redmars/shared';
import type { AuthContext } from '../../auth/auth-context';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { DrugInteractionService } from './drug-interaction.service';

/**
 * Drug interaction check (task 2.11). A read: given the drug ids on a prescription
 * (or a what-if list), return the seeded dangerous pairs among them. Gated on
 * interaction.check — held by the doctor (prescribes), pharmacist (dispenses) and
 * admin. Scoped to the caller's own facility inside the service.
 */
@Controller('drug-interactions')
export class DrugInteractionController {
  constructor(private readonly interactions: DrugInteractionService) {}

  @RequirePermission('interaction.check')
  @Get('check')
  check(@Req() req: Request, @Query() query: unknown): Promise<InteractionCheckResponse> {
    const auth = this.auth(req);
    const parsed = interactionCheckQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid interaction check',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.interactions.check(auth.facilityId, parsed.data.drugIds);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
