import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  createRoomRequestSchema,
  setRoomActiveRequestSchema,
  type RoomListResponse,
  type RoomSummary,
} from '@redmars/shared';
import type { AuthContext } from '../../auth/auth-context';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RoomService } from './room.service';

/**
 * Admin-only room master data (task 2.1) — the child of Department. Every route
 * names room.manage; there is no @Public and no unguarded route.
 */
@Controller('rooms')
export class RoomController {
  constructor(private readonly rooms: RoomService) {}

  @RequirePermission('room.manage')
  @Get()
  list(@Req() req: Request): Promise<RoomListResponse> {
    return this.rooms.list(this.auth(req).facilityId);
  }

  @RequirePermission('room.manage')
  @Post()
  @HttpCode(201)
  create(@Req() req: Request, @Body() body: unknown): Promise<RoomSummary> {
    const parsed = createRoomRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid room',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.rooms.create(this.auth(req).facilityId, parsed.data);
  }

  @RequirePermission('room.manage')
  @Patch(':id/active')
  setActive(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<RoomSummary> {
    const parsed = setRoomActiveRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid request',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.rooms.setActive(this.auth(req).facilityId, id, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
