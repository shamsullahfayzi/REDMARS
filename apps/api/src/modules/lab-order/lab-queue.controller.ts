import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  collectSampleRequestSchema,
  labQueueQuerySchema,
  saveLabResultRequestSchema,
} from '@redmars/shared';
import type {
  CollectSampleResponse,
  LabQueueResponse,
  SaveLabResultResponse,
} from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequiresModule } from '../../auth/decorators/requires-module.decorator';
import { AuthContext } from '../../auth/auth-context';
import { LabQueueService } from './lab-queue.service';
import { LabResultService } from './lab-result.service';
import { LabSampleService } from './lab-sample.service';

/**
 * Phase 5 — the lab worklist, read by the bench.
 *
 * A different route, a different permission from ordering. `lab_order.read_queue` is the lab
 * tech's and the desk's; the doctor holds it too (they placed the order and may see where it
 * is), but this is not `lab_order.create` — reading the whole facility's work is not the
 * same right as writing one order on one visit. Module-gated: a facility without the lab
 * never reaches here.
 *
 * Collecting the sample (POST /lab-queue/collect) sits on the same screen but a THIRD
 * permission — `lab.collect_sample`, the bench's and the nurse's, not the doctor's or the
 * desk's. Reading the worklist and drawing from it are different rights.
 */
@RequiresModule('lab')
@Controller('lab-queue')
export class LabQueueController {
  constructor(
    private readonly queue: LabQueueService,
    private readonly samples: LabSampleService,
    private readonly results: LabResultService,
  ) {}

  @Get()
  @RequirePermission('lab_order.read_queue')
  list(@Req() req: Request, @Query() rawQuery: unknown): Promise<LabQueueResponse> {
    const parsed = labQueueQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid lab queue filter',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.queue.queue(this.auth(req).facilityId, parsed.data);
  }

  @Post('collect')
  @RequirePermission('lab.collect_sample')
  collect(@Req() req: Request, @Body() body: unknown): Promise<CollectSampleResponse> {
    const parsed = collectSampleRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid sample collection',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const auth = this.auth(req);
    return this.samples.collect(auth.facilityId, auth.userId, parsed.data);
  }

  @Put('items/:itemId/result')
  @RequirePermission('lab.enter_result')
  saveResult(
    @Req() req: Request,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: unknown,
  ): Promise<SaveLabResultResponse> {
    const parsed = saveLabResultRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid result',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const auth = this.auth(req);
    return this.results.save(auth.facilityId, auth.userId, itemId, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
