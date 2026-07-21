import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateVisitRequest, VisitOptionsResponse, VisitSummary } from '@redmars/shared';
import { OPEN_VISIT_STATUSES } from '@redmars/shared';
import { PrismaService, type AuditedTx } from '../../prisma/prisma.service';
import { NumberSequenceService } from '../../services/number-sequence.service';

/** Exactly what `VisitSummary` promises, plus the joins its denormalised names come from. */
const visitSummarySelect = {
  id: true,
  visitNo: true,
  type: true,
  status: true,
  patientId: true,
  departmentId: true,
  practitionerId: true,
  chiefComplaint: true,
  referredBy: true,
  referralSource: true,
  startedAt: true,
  patient: { select: { mrn: true, prefix: true, firstName: true, lastName: true } },
  department: { select: { name: true } },
  practitioner: { select: { firstName: true, lastName: true } },
} as const;

type VisitRow = {
  id: string;
  visitNo: string;
  type: VisitSummary['type'];
  status: VisitSummary['status'];
  patientId: string;
  departmentId: string;
  practitionerId: string | null;
  chiefComplaint: string | null;
  referredBy: string | null;
  referralSource: string | null;
  startedAt: Date;
  patient: { mrn: string; prefix: string | null; firstName: string; lastName: string | null };
  department: { name: string };
  practitioner: { firstName: string; lastName: string } | null;
};

function fullName(parts: Array<string | null | undefined>): string {
  return parts.filter((part) => part != null && part.trim().length > 0).join(' ');
}

@Injectable()
export class VisitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: NumberSequenceService,
  ) {}

  /**
   * Start a visit. Everything the desk sends is checked against THIS facility before a
   * number is issued, because a visit number is gapless — burning one on a request that
   * was going to fail anyway leaves a hole no one can explain later.
   *
   * `tx` lets the visit join a caller's transaction (task 3.6). The validating reads go
   * through it too, so a patient created earlier in the same transaction is visible here
   * — outside it, that patient does not exist yet and the check would 404 on a row it
   * had just written.
   */
  async create(
    facilityId: string,
    userId: string,
    input: CreateVisitRequest,
    tx: AuditedTx = this.prisma.db,
  ): Promise<VisitSummary> {
    const patient = await tx.patient.findFirst({
      where: { id: input.patientId, facilityId },
      select: { id: true },
    });
    // 404, not 403: whether a patient exists in another facility is not something this
    // one gets to learn — the same rule the patient reads follow (task 3.4).
    if (!patient) throw new NotFoundException('Patient not found');

    const department = await tx.department.findFirst({
      where: { id: input.departmentId, facilityId },
      select: { id: true, isActive: true },
    });
    if (!department) throw new BadRequestException('Unknown department');
    // A deactivated department is history, not a destination. Visits already filed
    // against it stay valid; new ones do not get to join them.
    if (!department.isActive) throw new BadRequestException('Department is not active');

    if (input.practitionerId) {
      const practitioner = await tx.practitioner.findFirst({
        where: { id: input.practitionerId, facilityId },
        select: {
          isActive: true,
          departments: {
            where: { departmentId: input.departmentId },
            select: { departmentId: true },
          },
        },
      });
      if (!practitioner) throw new BadRequestException('Unknown practitioner');
      if (!practitioner.isActive) throw new BadRequestException('Practitioner is not active');
      // PractitionerDepartment exists because one doctor works OPD and IPD both. Without
      // this check the desk can file a psychiatrist under the laboratory department: the
      // row stores fine, and the doctor's queue — which reads (facility, department,
      // status, startedAt) — never shows it. The patient waits for nobody.
      if (practitioner.departments.length === 0) {
        throw new BadRequestException('Practitioner does not work in that department');
      }
    }

    // The same shape as the duplicate-patient guard (task 3.3): refuse, explain, and let
    // the desk override. A receptionist double-clicking Save otherwise files two queue
    // rows for one arrival — and at task 3.6, two invoices.
    if (!input.acknowledgeOpenVisit) {
      const open = await this.findOpenVisits(facilityId, input.patientId, input.departmentId, tx);
      if (open.length > 0) {
        throw new ConflictException({
          code: 'open_visit',
          message: 'This patient already has an open visit in that department',
          visits: open,
        });
      }
    }

    const visitNo = await this.sequence.next(facilityId, 'visit_no', undefined, tx);

    const created = await tx.visit.create({
      data: {
        facilityId,
        createdBy: userId,
        visitNo: visitNo.formatted,
        patientId: input.patientId,
        departmentId: input.departmentId,
        practitionerId: input.practitionerId ?? null,
        type: input.type,
        // Not sent by the client and not defaulted silently: the patient is standing at
        // the desk, so `arrived` is a fact the server states. Task 3.9 owns every move
        // after this one.
        status: 'arrived',
        chiefComplaint: input.chiefComplaint ?? null,
        referredBy: input.referredBy ?? null,
        referralSource: input.referralSource ?? null,
        // The medico-legal trail starts at the first status, not the second. Writing it
        // here means every status a visit ever held has a named author; leaving it to
        // task 3.9 would make `arrived` the one nobody signed.
        statusHistory: { create: { status: 'arrived', changedBy: userId } },
      },
      select: visitSummarySelect,
    });

    return this.toSummary(created);
  }

  async findById(facilityId: string, id: string): Promise<VisitSummary> {
    const visit = await this.prisma.db.visit.findFirst({
      where: { id, facilityId },
      select: visitSummarySelect,
    });
    if (!visit) throw new NotFoundException('Visit not found');
    return this.toSummary(visit);
  }

  /**
   * The pickers the reception screen needs, narrowed to what the desk chooses between:
   * active rows only, no licence numbers, no linked user accounts. Deliberately not the
   * admin lists — those are gated on `*.manage` and carry more than this screen needs.
   *
   * Services joined the payload at task 3.6. The check-in screen picks a department, a
   * doctor and a set of charges in one pass, and three round trips on the one screen
   * that has a queue in front of it is three chances to be slow.
   */
  async options(facilityId: string): Promise<VisitOptionsResponse> {
    const [departments, practitioners, services] = await Promise.all([
      this.prisma.db.department.findMany({
        where: { facilityId, isActive: true },
        select: { id: true, code: true, name: true, nameLocalPrs: true, nameLocalPs: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.db.practitioner.findMany({
        where: { facilityId, isActive: true, deletedAt: null },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          speciality: { select: { name: true } },
          departments: { select: { departmentId: true } },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      this.prisma.db.service.findMany({
        where: { facilityId, isActive: true },
        select: { id: true, departmentId: true, code: true, name: true, fee: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      departments,
      // Fee as a fixed-2 STRING, never a number: Decimal(12,2) is exact and a float is
      // not. It is shown to the desk and never sent back — the server prices the
      // invoice from this same catalog (task 3.6).
      services: services.map((service) => ({ ...service, fee: service.fee.toFixed(2) })),
      practitioners: practitioners.map((practitioner) => ({
        id: practitioner.id,
        name: fullName([practitioner.firstName, practitioner.lastName]),
        specialityName: practitioner.speciality?.name ?? null,
        departmentIds: practitioner.departments.map((link) => link.departmentId),
      })),
    };
  }

  private async findOpenVisits(
    facilityId: string,
    patientId: string,
    departmentId: string,
    tx: AuditedTx = this.prisma.db,
  ): Promise<VisitSummary[]> {
    const rows = await tx.visit.findMany({
      where: {
        facilityId,
        patientId,
        // Scoped to the department on purpose. A patient sent from OPD to the lab has
        // two genuinely different visits open at once; the same patient registered twice
        // for the same department does not.
        departmentId,
        status: { in: [...OPEN_VISIT_STATUSES] },
      },
      select: visitSummarySelect,
      orderBy: { startedAt: 'desc' },
    });
    return rows.map((row) => this.toSummary(row));
  }

  private toSummary(row: VisitRow): VisitSummary {
    return {
      id: row.id,
      visitNo: row.visitNo,
      type: row.type,
      status: row.status,
      patientId: row.patientId,
      patientName: fullName([row.patient.prefix, row.patient.firstName, row.patient.lastName]),
      patientMrn: row.patient.mrn,
      departmentId: row.departmentId,
      departmentName: row.department.name,
      practitionerId: row.practitionerId,
      practitionerName: row.practitioner
        ? fullName([row.practitioner.firstName, row.practitioner.lastName])
        : null,
      chiefComplaint: row.chiefComplaint,
      referredBy: row.referredBy,
      referralSource: row.referralSource,
      startedAt: row.startedAt.toISOString(),
    };
  }
}
