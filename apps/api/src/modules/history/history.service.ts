import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  HistoryDiagnosis,
  HistoryPrescription,
  HistoryQuery,
  HistoryVisit,
  PatientHistoryResponse,
} from '@redmars/shared';
import { HISTORY_VISIT_LIMIT } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Everything the panel shows, in ONE query with the relations included.
 *
 * Not a query per visit: a patient with forty visits would otherwise cost forty-one round
 * trips to render a panel a doctor glances at between two patients. `@@index([patientId,
 * startedAt])` on Visit is the index this is written against.
 */
const historySelect = {
  id: true,
  visitNo: true,
  type: true,
  status: true,
  startedAt: true,
  chiefComplaint: true,
  department: { select: { name: true } },
  practitioner: { select: { firstName: true, lastName: true } },
  diagnoses: {
    select: {
      text: true,
      icdCode: true,
      certainty: true,
      isPrimary: true,
      icd: { select: { title: true } },
    },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  },
  prescriptions: {
    select: {
      createdAt: true,
      advice: true,
      practitioner: { select: { firstName: true, lastName: true } },
      items: {
        select: {
          drugNameAtTime: true,
          dose: true,
          frequency: true,
          duration: true,
          route: true,
          quantity: true,
          instructions: true,
        },
        orderBy: { sequence: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  },
  // `satisfies` rather than `as const`, unlike every other select in this codebase: the
  // nested orderBy arrays have to stay mutable for Prisma's input types, and a plain
  // literal would widen 'desc' to string.
} satisfies Prisma.VisitSelect;

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async forPatient(
    facilityId: string,
    patientId: string,
    query: HistoryQuery,
  ): Promise<PatientHistoryResponse> {
    await this.requirePatient(facilityId, patientId);

    // Computed here rather than sent by the browser. A shared hospital workstation's clock
    // is frequently wrong, and "the last twelve months" that silently means fourteen is the
    // kind of wrong nobody notices.
    const from = new Date();
    from.setMonth(from.getMonth() - query.months);

    const where = {
      patientId,
      facilityId,
      // A voided visit is one the record says never happened. Everything else stays,
      // including cancelled — see the contract.
      status: { not: 'entered_in_error' as const },
    };

    const [rows, olderVisits] = await Promise.all([
      this.prisma.db.visit.findMany({
        where: { ...where, startedAt: { gte: from } },
        select: historySelect,
        orderBy: { startedAt: 'desc' },
        // One more than the limit, so "there were more" is answered without a second count.
        take: HISTORY_VISIT_LIMIT + 1,
      }),
      this.prisma.db.visit.count({ where: { ...where, startedAt: { lt: from } } }),
    ]);

    const truncated = rows.length > HISTORY_VISIT_LIMIT;

    return {
      patientId,
      months: query.months,
      from: from.toISOString(),
      visits: rows.slice(0, HISTORY_VISIT_LIMIT).map((row) => this.toHistoryVisit(row)),
      truncated,
      olderVisits,
    };
  }

  private async requirePatient(facilityId: string, patientId: string): Promise<void> {
    const patient = await this.prisma.db.patient.findFirst({
      where: { id: patientId, facilityId },
      select: { id: true },
    });
    // 404, not 403 — whether a patient exists in another facility is not this one's to learn.
    if (!patient) throw new NotFoundException('Patient not found');
  }

  private toHistoryVisit(row: HistoryRow): HistoryVisit {
    return {
      id: row.id,
      visitNo: row.visitNo,
      type: row.type,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      departmentName: row.department.name,
      practitionerName: fullName(row.practitioner),
      chiefComplaint: row.chiefComplaint,
      diagnoses: row.diagnoses.map((dx): HistoryDiagnosis => ({
        text: dx.text,
        icdCode: dx.icdCode,
        // Denormalised so a history line reads as "F32.1 — Moderate depressive episode"
        // without the panel making a second request per row.
        icdTitle: dx.icd?.title ?? null,
        certainty: dx.certainty,
        isPrimary: dx.isPrimary,
      })),
      prescription: this.toHistoryPrescription(row.prescriptions),
    };
  }

  /**
   * The sheet, singular. The schema allows a visit several prescriptions and task 4.7
   * writes one — so this takes the most recent rather than pretending the column cannot
   * hold two. A panel that showed a superseded sheet beside the real one would be worse
   * than one that shows the latest.
   */
  private toHistoryPrescription(rows: HistoryRow['prescriptions']): HistoryPrescription | null {
    const latest = rows[0];
    if (!latest) return null;
    return {
      writtenAt: latest.createdAt.toISOString(),
      practitionerName: fullName(latest.practitioner),
      advice: latest.advice,
      items: latest.items,
    };
  }
}

function fullName(person: { firstName: string; lastName: string } | null): string | null {
  return person ? [person.firstName, person.lastName].filter(Boolean).join(' ') : null;
}

type HistoryRow = {
  id: string;
  visitNo: string;
  type: HistoryVisit['type'];
  status: HistoryVisit['status'];
  startedAt: Date;
  chiefComplaint: string | null;
  department: { name: string };
  practitioner: { firstName: string; lastName: string } | null;
  diagnoses: {
    text: string;
    icdCode: string | null;
    certainty: HistoryDiagnosis['certainty'];
    isPrimary: boolean;
    icd: { title: string } | null;
  }[];
  prescriptions: {
    createdAt: Date;
    advice: string | null;
    practitioner: { firstName: string; lastName: string } | null;
    items: {
      drugNameAtTime: string;
      dose: string | null;
      frequency: string;
      duration: string;
      route: string;
      quantity: number | null;
      instructions: string | null;
    }[];
  }[];
};
