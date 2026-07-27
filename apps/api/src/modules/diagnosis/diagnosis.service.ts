import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  Diagnosis,
  DiagnosisListResponse,
  RecordDiagnosisRequest,
  UpdateDiagnosisRequest,
  VisitStatus,
} from '@redmars/shared';
import { isVisitOpen } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { VisitService } from '../visit/visit.service';

const diagnosisSelect = {
  id: true,
  visitId: true,
  text: true,
  icdCode: true,
  certainty: true,
  isPrimary: true,
  notes: true,
  practitionerId: true,
  createdAt: true,
  icd: { select: { title: true } },
  practitioner: { select: { firstName: true, lastName: true } },
} as const;

type DiagnosisRow = {
  id: string;
  visitId: string;
  text: string;
  icdCode: string | null;
  certainty: Diagnosis['certainty'];
  isPrimary: boolean;
  notes: string | null;
  practitionerId: string | null;
  createdAt: Date;
  icd: { title: string } | null;
  practitioner: { firstName: string; lastName: string } | null;
};

@Injectable()
export class DiagnosisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visits: VisitService,
  ) {}

  async list(facilityId: string, visitId: string): Promise<DiagnosisListResponse> {
    await this.requireVisit(facilityId, visitId);

    const rows = await this.prisma.db.diagnosis.findMany({
      where: { visitId },
      select: diagnosisSelect,
      // Primary first, then oldest first — the order a discharge summary reads in.
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    return { diagnoses: rows.map((row) => this.toDiagnosis(row)) };
  }

  async record(
    facilityId: string,
    userId: string,
    visitId: string,
    input: RecordDiagnosisRequest,
  ): Promise<Diagnosis> {
    await this.requireOpenVisit(facilityId, visitId);
    await this.requireKnownCode(input.icdCode);

    const created = await this.prisma.db.diagnosis.create({
      data: {
        visitId,
        practitionerId: await this.practitionerIdOf(facilityId, userId),
        text: input.text,
        icdCode: input.icdCode,
        certainty: input.certainty,
        isPrimary: input.isPrimary,
        notes: input.notes,
      },
      select: diagnosisSelect,
    });

    if (created.isPrimary) await this.clearOtherPrimaries(visitId, created.id);

    // Task 6b.4 — after the write commits, not before: a diagnosis that failed validation
    // must not have called the patient in.
    await this.visits.autoStart(facilityId, userId, visitId);

    return this.toDiagnosis(created);
  }

  /**
   * A full replace of the mutable fields.
   *
   * Editing exists because certainty MOVES: a provisional diagnosis becomes confirmed
   * within the same consultation once a question is answered, and forcing that through
   * delete-and-re-add would lose the row's place in the visit and its original author.
   */
  async update(
    facilityId: string,
    visitId: string,
    id: string,
    input: UpdateDiagnosisRequest,
  ): Promise<Diagnosis> {
    await this.requireOpenVisit(facilityId, visitId);
    await this.requireDiagnosis(visitId, id);
    await this.requireKnownCode(input.icdCode);

    const updated = await this.prisma.db.diagnosis.update({
      where: { id },
      data: {
        text: input.text,
        icdCode: input.icdCode,
        certainty: input.certainty,
        isPrimary: input.isPrimary,
        notes: input.notes,
      },
      select: diagnosisSelect,
    });

    if (updated.isPrimary) await this.clearOtherPrimaries(visitId, id);
    return this.toDiagnosis(updated);
  }

  /**
   * Remove one, and ONLY while the visit is still open.
   *
   * This is the one place in the clinical record where a row is actually deleted, so the
   * reasoning has to be stated rather than assumed. R4 says nothing is ever hard-deleted,
   * and it is about the RECORD — the thing that has been issued. A visit still in progress
   * is a form being filled in, and crossing out a line you just wrote on a form you have
   * not handed over is not falsifying anything. The moment the visit completes, this
   * refuses, and what is there is what happened.
   *
   * A wrong diagnosis is also not the same as a wrong vital sign: two blood pressures are
   * both true, two contradictory diagnoses are not, and leaving F32.1 on the chart beside
   * the F33.1 that replaced it is actively dangerous.
   *
   * `refuted` is the tool for ruling something OUT — that stays on the record on purpose.
   * The delete is for a mis-click, and the audit extension keeps the before-image of it.
   */
  async remove(facilityId: string, visitId: string, id: string): Promise<DiagnosisListResponse> {
    await this.requireOpenVisit(facilityId, visitId);
    await this.requireDiagnosis(visitId, id);
    await this.prisma.db.diagnosis.delete({ where: { id } });
    return this.list(facilityId, visitId);
  }

  /**
   * One primary per visit, enforced here rather than trusted to the client.
   *
   * Single updates in a loop, never updateMany: the audit extension deliberately does not
   * cover batch operations, and a primary flag moving off a diagnosis with nobody recorded
   * as having moved it is exactly the silent change the audit table exists to catch. A
   * visit has a handful of diagnoses, so the loop costs nothing.
   */
  private async clearOtherPrimaries(visitId: string, keepId: string): Promise<void> {
    const others = await this.prisma.db.diagnosis.findMany({
      where: { visitId, isPrimary: true, id: { not: keepId } },
      select: { id: true },
    });
    for (const other of others) {
      await this.prisma.db.diagnosis.update({
        where: { id: other.id },
        data: { isPrimary: false },
      });
    }
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
        message: 'This visit is closed. A diagnosis can only be written during the visit.',
        code: 'visit_closed',
      });
    }
  }

  private async requireDiagnosis(visitId: string, id: string): Promise<void> {
    const existing = await this.prisma.db.diagnosis.findFirst({
      where: { id, visitId },
      select: { id: true },
    });
    // Scoped to the visit in the URL, so an id from another patient's chart is a 404 here
    // rather than an edit that lands somewhere nobody was looking.
    if (!existing) throw new NotFoundException('Diagnosis not found');
  }

  private async requireKnownCode(code: string | null): Promise<void> {
    if (!code) return;
    const known = await this.prisma.db.icdCode.findUnique({
      where: { code },
      select: { code: true },
    });
    // A clean 400 beats a foreign-key error surfacing as a 500. The catalog is seeded
    // reference data, so a code that is not in it is a typo, not a gap to write around —
    // the way to record something the catalog lacks is free text with no code at all.
    if (!known) {
      throw new BadRequestException({ message: `Unknown ICD code: ${code}`, code: 'unknown_icd' });
    }
  }

  private async practitionerIdOf(facilityId: string, userId: string): Promise<string | null> {
    const practitioner = await this.prisma.db.practitioner.findFirst({
      where: { facilityId, userId },
      select: { id: true },
    });
    return practitioner?.id ?? null;
  }

  private toDiagnosis(row: DiagnosisRow): Diagnosis {
    return {
      id: row.id,
      visitId: row.visitId,
      text: row.text,
      icdCode: row.icdCode,
      icdTitle: row.icd?.title ?? null,
      certainty: row.certainty,
      isPrimary: row.isPrimary,
      notes: row.notes,
      practitionerId: row.practitionerId,
      practitionerName: row.practitioner
        ? [row.practitioner.firstName, row.practitioner.lastName].filter(Boolean).join(' ')
        : null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
