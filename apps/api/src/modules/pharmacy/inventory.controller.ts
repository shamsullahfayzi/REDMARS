import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { intakeSchema, stockSettingsSchema } from '@redmars/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { InventoryService } from './inventory.service';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new BadRequestException(
      parsed.error.issues.map((issue) => issue.path.join('.') + ' ' + issue.message).join('; '),
    );
  return parsed.data;
}

@Controller('pharmacy/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @RequirePermission('inventory.view')
  dashboard(@Req() req: Request) {
    return this.inventory.dashboard(req.auth!.facilityId);
  }

  @Get('availability')
  @RequirePermission('inventory.availability')
  availability(@Req() req: Request, @Query('ids') ids: unknown) {
    const list = parse(
      z.array(z.uuid()).min(1).max(100),
      typeof ids === 'string' ? ids.split(',') : [],
    );
    return this.inventory.availability(req.auth!.facilityId, list);
  }

  @Get('drugs/:id/movements')
  @RequirePermission('inventory.view')
  movements(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('cursor') cursor: unknown,
  ) {
    return this.inventory.history(req.auth!.facilityId, id, parse(z.uuid().optional(), cursor));
  }

  @Post('receipts')
  @RequirePermission('inventory.manage')
  receive(@Req() req: Request, @Body() body: unknown) {
    return this.inventory.receive(
      req.auth!.facilityId,
      req.auth!.userId,
      parse(intakeSchema, body),
    );
  }

  @Post('drugs/:id/settings')
  @RequirePermission('inventory.manage')
  settings(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.inventory.settings(req.auth!.facilityId, id, parse(stockSettingsSchema, body));
  }

  @Post('batches/:id/adjustments')
  @RequirePermission('inventory.manage')
  adjust(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(z.object({
      reference: z.uuid(),
      delta: z.number().int().min(-1000000000).max(1000000000).refine(n => n !== 0),
      reason: z.string().trim().min(1).max(250),
    }), body);
    return this.inventory.adjust(req.auth!.facilityId, req.auth!.userId, id, input);
  }

  @Post('batches/:id/quarantine')
  @RequirePermission('inventory.manage')
  quarantine(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { reason } = parse(z.object({ reason: z.string().trim().min(1).max(250) }), body);
    return this.inventory.quarantine(req.auth!.facilityId, req.auth!.userId, id, reason);
  }
}
