import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  FollowUp,
  FollowUpListResponse,
  FollowUpQuery,
  FollowUpResponse,
  RecordFollowUpResponseRequest,
} from '@redmars/shared';
import { FOLLOW_UP_DEFAULT_DAYS, FOLLOW_UP_LIMIT } from '@redmars/shared';
import { facilityDateString } from '../../common/facility-time';
import { PrismaService } from '../../prisma/prisma.service';

/** A YYYY-MM-DD shifted by whole days, in UTC — these are calendar days, not instants. */
function shiftDay(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

const dayStart = (date: string) => new Date(`${date}T00:00:00.000Z`);

@Injectable()
export class FollowUpService {
  constructor(private readonly prisma: PrismaService) {}

  async list(facilityId: string, query: FollowUpQuery): Promise<FollowUpListResponse> {
    // Today AT THE HOSPITAL, not on whichever machine asked. The whole list is a set of
    // calendar days there, and a window computed from a server running in UTC would show
    // the wrong day's recalls for four and a half hours out of every twenty-four.
    const from = query.from ?? facilityDateString();
    const to = query.to ?? shiftDay(from, FOLLOW_UP_DEFAULT_DAYS);

    const rows = await this.prisma.db.prescription.findMany({
      where: {
        followUpDate: { gte: dayStart(from), lte: dayStart(to) },
        visit: { facilityId },
        ...(query.practitionerId ? { practitionerId: query.practitionerId } : {}),
      },
      select: {
        id: true,
        followUpDate: true,
        practitionerId: true,
        practitioner: { select: { firstName: true, lastName: true } },
        visit: {
          select: {
            id: true,
            visitNo: true,
            startedAt: true,
            patient: {
              select: { id: true, mrn: true, firstName: true, lastName: true, phone: true },
            },
          },
        },
      },
      // Soonest first: the ones about to be missed are the ones to ring today.
      orderBy: { followUpDate: 'asc' },
      take: FOLLOW_UP_LIMIT + 1,
    });

    const truncated = rows.length > FOLLOW_UP_LIMIT;
    const page = rows.slice(0, FOLLOW_UP_LIMIT);

    const attendance = await this.attendanceFor(facilityId, page, from);
    const responses = await this.responsesFor(page.map((row) => row.id));

    let followUps: FollowUp[] = page.map((row) => {
      const followUpDate = row.followUpDate!.toISOString().slice(0, 10);
      const attendedAt = attendance.get(row.visit.patient.id)?.find(
        (at) =>
          // The day AT THE HOSPITAL. A visit at 02:00 Kabul is the previous day in UTC,
          // and comparing UTC days here would read it as having happened before the
          // recall it actually answered.
          facilityDateString(at) >= followUpDate &&
          // And not the consultation the follow-up was decided in. A review set for the
          // same day would otherwise mark itself attended the moment it was written.
          at.getTime() > row.visit.startedAt.getTime(),
      );
      return this.toFollowUp(
        row,
        followUpDate,
        attendedAt ?? null,
        responses.get(`${row.id}|${followUpDate}`) ?? null,
      );
    });

    // Counted BEFORE the filter, so the header number does not change meaning when the
    // desk switches the filter on to work down the list it describes.
    const missed = followUps.filter((followUp) => !followUp.attended).length;
    if (query.onlyMissed) followUps = followUps.filter((followUp) => !followUp.attended);

    return { from, to, followUps, truncated, missed };
  }

  /**
   * `follow_up.respond` — the call center's (or admin's) answer for one follow-up. Snapshots
   * the prescription's CURRENT `followUpDate` onto the new row, so a doctor rescheduling the
   * date afterward cannot silently reattribute an old answer to the new one — see the
   * FollowUpResponse model's own comment.
   */
  async respond(
    facilityId: string,
    actorUserId: string,
    prescriptionId: string,
    input: RecordFollowUpResponseRequest,
  ): Promise<FollowUp> {
    const row = await this.prisma.db.prescription.findFirst({
      where: { id: prescriptionId, visit: { facilityId } },
      select: {
        id: true,
        followUpDate: true,
        practitionerId: true,
        practitioner: { select: { firstName: true, lastName: true } },
        visit: {
          select: {
            id: true,
            visitNo: true,
            startedAt: true,
            patient: {
              select: { id: true, mrn: true, firstName: true, lastName: true, phone: true },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Follow-up not found');
    if (!row.followUpDate) {
      throw new BadRequestException('This prescription has no follow-up date to respond to');
    }

    const followUpDate = row.followUpDate.toISOString().slice(0, 10);
    const created = await this.prisma.db.followUpResponse.create({
      data: {
        prescriptionId,
        followUpDate: row.followUpDate,
        status: input.status,
        note: input.note ?? null,
        recordedBy: actorUserId,
      },
      select: {
        status: true,
        note: true,
        recordedAt: true,
        recordedByUser: { select: { fullName: true } },
      },
    });

    const attendance = await this.attendanceFor(facilityId, [row], followUpDate);
    const attendedAt =
      attendance.get(row.visit.patient.id)?.find(
        (at) =>
          facilityDateString(at) >= followUpDate && at.getTime() > row.visit.startedAt.getTime(),
      ) ?? null;

    return this.toFollowUp(row, followUpDate, attendedAt, {
      status: created.status,
      note: created.note,
      recordedByName: created.recordedByUser.fullName,
      recordedAt: created.recordedAt.toISOString(),
    });
  }

  /** The shared row shape between `list()` and `respond()` — kept in exactly one place. */
  private toFollowUp(
    row: {
      id: string;
      practitionerId: string | null;
      practitioner: { firstName: string; lastName: string } | null;
      visit: {
        id: string;
        visitNo: string;
        startedAt: Date;
        patient: {
          id: string;
          mrn: string;
          firstName: string;
          lastName: string | null;
          phone: string | null;
        };
      };
    },
    followUpDate: string,
    attendedAt: Date | null,
    response: FollowUpResponse | null,
  ): FollowUp {
    return {
      prescriptionId: row.id,
      visitId: row.visit.id,
      visitNo: row.visit.visitNo,
      visitDate: row.visit.startedAt.toISOString(),
      patientId: row.visit.patient.id,
      patientName: [row.visit.patient.firstName, row.visit.patient.lastName]
        .filter(Boolean)
        .join(' '),
      patientMrn: row.visit.patient.mrn,
      patientPhone: row.visit.patient.phone,
      practitionerId: row.practitionerId,
      practitionerName: row.practitioner
        ? [row.practitioner.firstName, row.practitioner.lastName].filter(Boolean).join(' ')
        : null,
      followUpDate,
      attended: attendedAt != null,
      attendedAt: attendedAt?.toISOString() ?? null,
      response,
    };
  }

  /**
   * The latest response per (prescription, follow-up date), for a page of rows in one query
   * — the same one-query-not-N discipline as `attendanceFor`. Keyed as a plain string rather
   * than a nested map: this list is at most `FOLLOW_UP_LIMIT` rows, and a string key is one
   * fewer data structure to get wrong for a value read exactly once per row.
   */
  private async responsesFor(
    prescriptionIds: string[],
  ): Promise<Map<string, FollowUpResponse>> {
    if (prescriptionIds.length === 0) return new Map();

    const rows = await this.prisma.db.followUpResponse.findMany({
      where: { prescriptionId: { in: prescriptionIds } },
      orderBy: { recordedAt: 'desc' },
      select: {
        prescriptionId: true,
        followUpDate: true,
        status: true,
        note: true,
        recordedAt: true,
        recordedByUser: { select: { fullName: true } },
      },
    });

    const byKey = new Map<string, FollowUpResponse>();
    for (const row of rows) {
      const key = `${row.prescriptionId}|${row.followUpDate.toISOString().slice(0, 10)}`;
      // Newest first, and a key set only once — every later (older) row for the same
      // key is silently skipped, which is exactly "keep the latest."
      if (!byKey.has(key)) {
        byKey.set(key, {
          status: row.status,
          note: row.note,
          recordedByName: row.recordedByUser.fullName,
          recordedAt: row.recordedAt.toISOString(),
        });
      }
    }
    return byKey;
  }

  /**
   * Every visit these patients have had since the EARLIEST due date in the window, in one
   * query, keyed by patient.
   *
   * One query rather than one per row: a month of a busy clinic is two hundred rows, and
   * two hundred round trips to answer "did they come back" would make the list slower than
   * the paper diary it replaces.
   *
   * `entered_in_error` is excluded — a voided visit is one the record says never happened,
   * and counting it as attendance would take a patient off the recall list on the strength
   * of a mistake somebody already corrected.
   */
  private async attendanceFor(
    facilityId: string,
    rows: { followUpDate: Date | null; visit: { patient: { id: string } } }[],
    from: string,
  ): Promise<Map<string, Date[]>> {
    const patientIds = [...new Set(rows.map((row) => row.visit.patient.id))];
    if (patientIds.length === 0) return new Map();

    const earliest = rows.reduce(
      (soonest, row) => (row.followUpDate! < soonest ? row.followUpDate! : soonest),
      dayStart(from),
    );

    const visits = await this.prisma.db.visit.findMany({
      where: {
        facilityId,
        patientId: { in: patientIds },
        startedAt: { gte: earliest },
        status: { not: 'entered_in_error' },
      },
      select: { patientId: true, startedAt: true },
      orderBy: { startedAt: 'asc' },
    });

    const byPatient = new Map<string, Date[]>();
    for (const visit of visits) {
      const list = byPatient.get(visit.patientId);
      if (list) list.push(visit.startedAt);
      else byPatient.set(visit.patientId, [visit.startedAt]);
    }
    return byPatient;
  }
}
