import { Injectable } from '@nestjs/common';
import type { FollowUp, FollowUpListResponse, FollowUpQuery } from '@redmars/shared';
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
      };
    });

    // Counted BEFORE the filter, so the header number does not change meaning when the
    // desk switches the filter on to work down the list it describes.
    const missed = followUps.filter((followUp) => !followUp.attended).length;
    if (query.onlyMissed) followUps = followUps.filter((followUp) => !followUp.attended);

    return { from, to, followUps, truncated, missed };
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
