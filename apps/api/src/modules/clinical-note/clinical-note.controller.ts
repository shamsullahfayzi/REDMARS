import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { saveClinicalNoteRequestSchema } from '@redmars/shared';
import type { ClinicalNote, ClinicalNoteListResponse } from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuditRead } from '../../audit/decorators/audit-read.decorator';
import { AuthContext } from '../../auth/auth-context';
import { ClinicalNoteService } from './clinical-note.service';

/**
 * Task 4.13 — the psychiatric note.
 *
 * `clinical_note.read` IS THE NARROWEST PERMISSION IN THE MATRIX and this is the route
 * that proves it. Admin holds R2 — read the clinical record, never write it — and R2 stops
 * here: an administrator can see a diagnosis, a prescription and a set of vitals, and
 * cannot see a mental state examination. That is not an oversight to tidy up later. Farhat
 * is a psychiatric hospital in a small community and this table holds the sentences that
 * do the damage if they leave the room. Doctor only, both directions.
 *
 * PUT rather than POST, because there is one note of each type per visit and the doctor is
 * writing it, not filing copies of it. The type is in the BODY rather than the path so the
 * request parses as one discriminated union — a `:noteType` path segment would be a string
 * the schema then has to be looked up by, which is the pairing the union exists to make
 * the compiler check.
 *
 * The route param is `:id` for the same reason as vitals and diagnoses: the audit
 * interceptor takes the entity id from `params.id`, and an R1 row that cannot say whose
 * record was read is a tally rather than an audit entry.
 */
@Controller('visits/:id/notes')
export class ClinicalNoteController {
  constructor(private readonly notes: ClinicalNoteService) {}

  @Get()
  @RequirePermission('clinical_note.read')
  @AuditRead('ClinicalNote')
  list(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) visitId: string,
  ): Promise<ClinicalNoteListResponse> {
    return this.notes.list(this.auth(req).facilityId, visitId);
  }

  @Put()
  @RequirePermission('clinical_note.write')
  save(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) visitId: string,
    @Body() body: unknown,
  ): Promise<ClinicalNote> {
    const parsed = saveClinicalNoteRequestSchema.safeParse(body);
    if (!parsed.success) {
      // `issues` rather than `flatten().fieldErrors`, unlike every other controller here.
      // The risk assessment's rules land on nested paths — ['content','selfHarm','detail']
      // — and flatten only keys the top level, so the message that says WHICH domain needs
      // justifying would arrive attached to nothing.
      throw new BadRequestException({
        message: 'Invalid clinical note',
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    const auth = this.auth(req);
    return this.notes.save(auth.facilityId, auth.userId, visitId, parsed.data);
  }

  private auth(req: Request): AuthContext {
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return auth;
  }
}
