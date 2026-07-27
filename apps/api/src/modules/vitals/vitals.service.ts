import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RecordVitalsRequest, VitalsListResponse, VitalsReading } from '@redmars/shared';
import { isVisitOpen } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { VisitService } from '../visit/visit.service';

/** Everything `VitalsReading` promises, plus the name behind `recordedBy`. */
const vitalsSelect = {
  id: true,
  visitId: true,
  systolicBp: true,
  diastolicBp: true,
  pulse: true,
  temperatureC: true,
  respiratory: true,
  spo2: true,
  weightKg: true,
  heightCm: true,
  recordedAt: true,
  recordedBy: true,
} as const;

type VitalsRow = {
  id: string;
  visitId: string;
  systolicBp: number | null;
  diastolicBp: number | null;
  pulse: number | null;
  temperatureC: Prisma.Decimal | null;
  respiratory: number | null;
  spo2: number | null;
  weightKg: Prisma.Decimal | null;
  heightCm: Prisma.Decimal | null;
  recordedAt: Date;
  recordedBy: string | null;
};

@Injectable()
export class VitalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visits: VisitService,
  ) {}

  /**
   * Append a reading. There is no update and no delete, by design: a re-taken blood
   * pressure is a second reading, not a correction of the first, and keeping both is what
   * makes a trend inside one visit readable. R4 — nothing is ever hard-deleted.
   */
  async record(
    facilityId: string,
    userId: string,
    visitId: string,
    input: RecordVitalsRequest,
  ): Promise<VitalsReading> {
    const visit = await this.prisma.db.visit.findFirst({
      where: { id: visitId, facilityId },
      select: { id: true, status: true },
    });
    // 404 rather than 403: whether a visit exists in another facility is not something
    // this one gets to learn.
    if (!visit) throw new NotFoundException('Visit not found');

    // A vital sign is measured during the encounter. Writing one against a finished visit
    // is backdating an observation to a time nobody was in the room — and `completed`
    // leads nowhere in the transition map, so the visit cannot be reopened to allow it.
    if (!isVisitOpen(visit.status)) {
      throw new BadRequestException({
        message: 'This visit is closed. Vitals can only be recorded during the visit.',
        code: 'visit_closed',
      });
    }

    const created = await this.prisma.db.vitals.create({
      data: {
        visitId,
        recordedBy: userId,
        systolicBp: input.systolicBp,
        diastolicBp: input.diastolicBp,
        pulse: input.pulse,
        // Handed to Prisma as a number and stored at the column's own scale — Decimal(4,1)
        // for a temperature, Decimal(5,2) for a weight. The response then reports what was
        // stored rather than what was sent.
        temperatureC: input.temperatureC,
        respiratory: input.respiratory,
        spo2: input.spo2,
        weightKg: input.weightKg,
        heightCm: input.heightCm,
      },
      select: vitalsSelect,
    });

    // Task 6b.4 — after the write commits, not before: a vitals row that failed to save
    // must not have called the patient in.
    await this.visits.autoStart(facilityId, userId, visitId);

    return this.toReading(created, await this.nameOf(created.recordedBy));
  }

  /** Newest first: what the patient is now, with what they were earlier underneath it. */
  async list(facilityId: string, visitId: string): Promise<VitalsListResponse> {
    const visit = await this.prisma.db.visit.findFirst({
      where: { id: visitId, facilityId },
      select: { id: true },
    });
    if (!visit) throw new NotFoundException('Visit not found');

    const rows = await this.prisma.db.vitals.findMany({
      where: { visitId },
      select: vitalsSelect,
      orderBy: { recordedAt: 'desc' },
    });

    const actorIds = [
      ...new Set(rows.map((row) => row.recordedBy).filter((id): id is string => !!id)),
    ];
    const actors = await this.prisma.db.appUser.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, fullName: true },
    });
    const names = new Map(actors.map((actor) => [actor.id, actor.fullName]));

    return {
      readings: rows.map((row) =>
        this.toReading(row, row.recordedBy ? (names.get(row.recordedBy) ?? null) : null),
      ),
    };
  }

  private async nameOf(userId: string | null): Promise<string | null> {
    if (!userId) return null;
    const user = await this.prisma.db.appUser.findUnique({
      where: { id: userId },
      select: { fullName: true },
    });
    return user?.fullName ?? null;
  }

  private toReading(row: VitalsRow, recordedByName: string | null): VitalsReading {
    return {
      id: row.id,
      visitId: row.visitId,
      systolicBp: row.systolicBp,
      diastolicBp: row.diastolicBp,
      pulse: row.pulse,
      // Decimal to string, which is lossless. A float here would be the one place a
      // measurement quietly changed on the way out.
      temperatureC: row.temperatureC?.toString() ?? null,
      respiratory: row.respiratory,
      spo2: row.spo2,
      weightKg: row.weightKg?.toString() ?? null,
      heightCm: row.heightCm?.toString() ?? null,
      recordedAt: row.recordedAt.toISOString(),
      recordedBy: row.recordedBy,
      recordedByName,
    };
  }
}
