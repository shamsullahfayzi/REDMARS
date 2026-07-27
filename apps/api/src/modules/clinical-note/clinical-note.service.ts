import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ClinicalNote,
  ClinicalNoteListResponse,
  NoteType,
  SaveClinicalNoteRequest,
  VisitStatus,
} from '@redmars/shared';
import {
  isVisitOpen,
  mseContentSchema,
  progressContentSchema,
  psychAssessmentContentSchema,
  riskAssessmentContentSchema,
} from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { VisitService } from '../visit/visit.service';

const noteSelect = {
  id: true,
  visitId: true,
  noteType: true,
  content: true,
  practitionerId: true,
  createdAt: true,
  updatedAt: true,
  practitioner: { select: { firstName: true, lastName: true } },
} as const;

type NoteRow = {
  id: string;
  visitId: string;
  noteType: string;
  content: unknown;
  practitionerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  practitioner: { firstName: string; lastName: string } | null;
};

@Injectable()
export class ClinicalNoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visits: VisitService,
  ) {}

  /**
   * Every note on the visit, in one request. There are at most four, so paging this would
   * be ceremony — and the notes tab needs all of them at once anyway to know which of its
   * sections have been started.
   */
  async list(facilityId: string, visitId: string): Promise<ClinicalNoteListResponse> {
    await this.requireVisit(facilityId, visitId);

    const rows = await this.prisma.db.clinicalNote.findMany({
      where: { visitId },
      select: noteSelect,
      orderBy: { createdAt: 'asc' },
    });

    return { notes: rows.map((row) => this.toNote(row)) };
  }

  /**
   * Write the note of this type on this visit, replacing what is there.
   *
   * READ-THEN-CREATE-OR-UPDATE, NEVER `upsert`. Prisma's upsert is one statement and would
   * be the obvious call here; the audit extension covers create, update and delete and
   * deliberately does not cover it. A psychiatric note is the most sensitive artefact in
   * this system and the one whose before-image is most worth keeping, so it takes the extra
   * round trip. The unique index on (visit_id, note_type) is what makes the race between
   * the read and the write a constraint error rather than a second note.
   *
   * THE AUTHOR IS NOT REASSIGNED ON EDIT. Whoever started the note stays named on it: a
   * second doctor tidying a colleague's formulation does not thereby become the person who
   * assessed the patient. Who changed what is the audit table's question, and it answers it.
   */
  async save(
    facilityId: string,
    userId: string,
    visitId: string,
    input: SaveClinicalNoteRequest,
  ): Promise<ClinicalNote> {
    await this.requireOpenVisit(facilityId, visitId);

    const existing = await this.prisma.db.clinicalNote.findFirst({
      where: { visitId, noteType: input.noteType },
      select: { id: true },
    });

    if (existing) {
      const updated = await this.prisma.db.clinicalNote.update({
        where: { id: existing.id },
        data: { content: input.content },
        select: noteSelect,
      });
      // Task 6b.4 — a first note can arrive as an edit to nothing, same as a create.
      await this.visits.autoStart(facilityId, userId, visitId);
      return this.toNote(updated);
    }

    const created = await this.prisma.db.clinicalNote.create({
      data: {
        visitId,
        noteType: input.noteType,
        content: input.content,
        // Best-effort, and never a reason to refuse — see the contract. An assessment the
        // doctor has already typed is not re-derivable from a patient who has gone home.
        practitionerId: await this.practitionerIdOf(facilityId, userId),
      },
      select: noteSelect,
    });
    // Task 6b.4 — after the write commits, not before.
    await this.visits.autoStart(facilityId, userId, visitId);
    return this.toNote(created);
  }

  private async requireVisit(facilityId: string, visitId: string): Promise<VisitStatus> {
    const visit = await this.prisma.db.visit.findFirst({
      where: { id: visitId, facilityId },
      select: { id: true, status: true },
    });
    // 404, not 403 — whether a visit exists in another facility is not this one's to learn.
    if (!visit) throw new NotFoundException('Visit not found');
    return visit.status;
  }

  private async requireOpenVisit(facilityId: string, visitId: string): Promise<void> {
    const status = await this.requireVisit(facilityId, visitId);
    if (!isVisitOpen(status)) {
      throw new BadRequestException({
        message: 'This visit is closed. A clinical note can only be written during the visit.',
        code: 'visit_closed',
      });
    }
  }

  private async practitionerIdOf(facilityId: string, userId: string): Promise<string | null> {
    const practitioner = await this.prisma.db.practitioner.findFirst({
      where: { facilityId, userId },
      select: { id: true },
    });
    return practitioner?.id ?? null;
  }

  /**
   * The Json column, parsed back into the shape its type promises.
   *
   * Branched rather than cast, so the compiler proves each `noteType` is paired with its
   * own content shape — the same thing task 4.12 does for templates. The UNREFINED schemas
   * are used here on purpose: the write rules (a note may not be blank, a high risk needs
   * a plan) guard the way in, and re-running them on the way out would let a future
   * tightening make an existing note unreadable to the doctor who needs it.
   */
  private toNote(row: NoteRow): ClinicalNote {
    const noteType = row.noteType as NoteType;
    const base = {
      id: row.id,
      visitId: row.visitId,
      practitionerId: row.practitionerId,
      practitionerName: row.practitioner
        ? [row.practitioner.firstName, row.practitioner.lastName].filter(Boolean).join(' ')
        : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };

    if (noteType === 'psych_assessment') {
      return { ...base, noteType, content: psychAssessmentContentSchema.parse(row.content) };
    }
    if (noteType === 'mse') {
      return { ...base, noteType, content: mseContentSchema.parse(row.content) };
    }
    if (noteType === 'risk_assessment') {
      return { ...base, noteType, content: riskAssessmentContentSchema.parse(row.content) };
    }
    if (noteType === 'progress') {
      return { ...base, noteType, content: progressContentSchema.parse(row.content) };
    }

    // The column is a String and lists a fifth type (`soap`) that this phase does not
    // build. A row of an unbuilt type means something wrote a shape this code cannot
    // render, and rendering it as an empty note would be worse than saying so.
    throw new BadRequestException(
      `Clinical notes of type '${row.noteType}' are not supported yet.`,
    );
  }
}
