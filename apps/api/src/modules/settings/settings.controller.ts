import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { updateDiscountCeilingRequestSchema, type DiscountCeilingResponse } from '@redmars/shared';
import type { AuthContext } from '../../auth/auth-context';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { SettingService } from '../../services/setting.service';

/**
 * Task 6b.1 — the R10 ceiling as something an admin can see and change, instead of a
 * constant in the source. Reading it is gated on `discount.apply`: anyone who can give a
 * discount needs to know the number they're held to. Changing it is `setting.manage`,
 * admin-only — the same permission the rest of facility configuration uses.
 */
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingService) {}

  @RequirePermission('discount.apply')
  @Get('discount-ceiling')
  async getDiscountCeiling(@Req() req: Request): Promise<DiscountCeilingResponse> {
    const auth = this.auth(req);
    const maxPercent = await this.settings.getDiscountMaxPercent(auth.facilityId);
    return { maxPercent };
  }

  @RequirePermission('setting.manage')
  @Patch('discount-ceiling')
  async setDiscountCeiling(
    @Req() req: Request,
    @Body() body: unknown,
  ): Promise<DiscountCeilingResponse> {
    const auth = this.auth(req);
    const parsed = updateDiscountCeilingRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid discount ceiling',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const maxPercent = await this.settings.setDiscountMaxPercent(
      auth.facilityId,
      parsed.data.maxPercent,
    );
    return { maxPercent };
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
