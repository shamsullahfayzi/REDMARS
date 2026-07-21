import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AppointmentListQuery,
  AppointmentListResponse,
  AppointmentSummary,
  CloseAppointmentRequest,
  CreateAppointmentRequest,
} from '@redmars/shared';
import { OPEN_APPOINTMENT_STATUSES } from '@redmars/shared';
import { PrismaService, type AuditedTx } from '../../prisma/prisma.service';
import {
  facilityDateString,
  facilityDayBounds,
  facilityDayBoundsFor,
} from '../../common/facility-time';

const appointmentSelect = {
  id: true,
  status: true,
  patientId: true,
  departmentId: true,
  practitionerId: true,
  scheduledAt: true,
  reason: true,
  createdAt: true,
  patient: { select: { mrn: true, prefix: true, firstName: true, lastName: true, phone: true } },
  department: { select: { name: true } },
  practitioner: { select: { firstName: true, lastName: true } },
  visit: { select: { id: true, visitNo: true } },
} as const;

type AppointmentRow = {
  id: string;
  status: AppointmentSummary['status'];
  patientId: string;
  departmentId: string;
  practitionerId: string | null;
  scheduledAt: Date;
  reason: string | null;
  createdAt: Date;
  patient: {
    mrn: string;
    prefix: string | null;
    firstName: string;
    lastName: string | null;
    phone: string | null;
  };
  department: { name: string };
  practitioner: { firstName: string; lastName: string } | null;
  visit: { id: string; visitNo: string } | null;
};

function fullName(parts: Array<string | null | undefined>): string {
  return parts.filter((part) => part != null && part.trim().length > 0).join(' ');
}

@Injectable()
export class AppointmentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Book a follow-up. Stored at the facility's own midnight for the chosen day, because
   * the contract carries a DAY and the column holds a DateTime — anchoring it anywhere
   * else would put a booking on the wrong side of a date line for a hospital at +04:30.
   */
  async create(
    facilityId: string,
    userId: string,
    input: CreateAppointmentRequest,
  ): Promise<AppointmentSummary> {
    const patient = await this.prisma.db.patient.findFirst({
      where: { id: input.patientId, facilityId },
      select: { id: true },
    });
    // 404 rather than 403 — the same rule every other patient read follows.
    if (!patient) throw new NotFoundException('Patient not found');

    const department = await this.prisma.db.department.findFirst({
      where: { id: input.departmentId, facilityId },
      select: { isActive: true },
    });
    if (!department) throw new BadRequestException('Unknown department');
    if (!department.isActive) throw new BadRequestException('Department is not active');

    if (input.practitionerId) {
      const practitioner = await this.prisma.db.practitioner.findFirst({
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
      // Same check the visit makes (task 3.5), and for the same reason: a booking with a
      // doctor who does not work that department is one nobody will ever be there for.
      if (practitioner.departments.length === 0) {
        throw new BadRequestException('Practitioner does not work in that department');
      }
    }

    const { start } = facilityDayBoundsFor(input.scheduledOn);
    const todayStart = facilityDayBounds().start;
    // Yesterday is not a thing you can be asked to come back to.
    if (start.getTime() < todayStart.getTime()) {
      throw new BadRequestException('That date has already passed.');
    }

    const created = await this.prisma.db.appointment.create({
      data: {
        facilityId,
        createdBy: userId,
        patientId: input.patientId,
        departmentId: input.departmentId,
        practitionerId: input.practitionerId ?? null,
        scheduledAt: start,
        reason: input.reason ?? null,
        status: 'booked',
      },
      select: appointmentSelect,
    });
    return this.toSummary(created);
  }

  async list(facilityId: string, query: AppointmentListQuery): Promise<AppointmentListResponse> {
    const { start, end } = query.date ? facilityDayBoundsFor(query.date) : facilityDayBounds();

    const scheduledAt = query.upcoming ? { gte: start } : { gte: start, lt: end };

    const rows = await this.prisma.db.appointment.findMany({
      where: {
        facilityId,
        scheduledAt,
        ...(query.patientId ? { patientId: query.patientId } : {}),
        ...(query.practitionerId ? { practitionerId: query.practitionerId } : {}),
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      select: appointmentSelect,
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      appointments: rows.map((row) => this.toSummary(row)),
      date: query.date ?? facilityDateString(),
    };
  }

  /**
   * Close a booking that will not become a visit — cancelled, or a no-show.
   *
   * A fulfilled appointment cannot be closed: the patient came, and saying afterwards
   * that they did not is a lie about a record that already has a visit attached to it.
   */
  async close(
    facilityId: string,
    id: string,
    input: CloseAppointmentRequest,
  ): Promise<AppointmentSummary> {
    const current = await this.prisma.db.appointment.findFirst({
      where: { id, facilityId },
      select: { status: true, reason: true },
    });
    if (!current) throw new NotFoundException('Appointment not found');

    if (!(OPEN_APPOINTMENT_STATUSES as readonly string[]).includes(current.status)) {
      throw new BadRequestException({
        message: `A ${current.status} appointment cannot be marked ${input.status}.`,
        code: 'illegal_transition',
        from: current.status,
      });
    }

    // What the booking was FOR and why it fell through are two different facts sharing
    // one column, so the closing note is APPENDED. Overwriting would erase the clinical
    // reason the follow-up existed, which is the more valuable half of the two.
    const closingNote = input.reason?.trim();
    const reason = closingNote
      ? current.reason
        ? `${current.reason} — ${closingNote}`
        : closingNote
      : undefined;

    const updated = await this.prisma.db.appointment.update({
      where: { id },
      data: { status: input.status, ...(reason === undefined ? {} : { reason }) },
      select: appointmentSelect,
    });
    return this.toSummary(updated);
  }

  /**
   * The patient turned up: link the booking to the visit that resulted and mark it
   * fulfilled (task 3.10). Called from inside the check-in transaction, so a check-in
   * that rolls back does not leave an appointment claiming a visit that never existed.
   *
   * Auto-matched on patient and day, and ONLY when the match is unambiguous. Two open
   * bookings for one patient on one day means the server cannot know which was meant, so
   * it links neither and both stay visible in the book — a wrong link is far harder to
   * notice than a missing one, because it silently marks somebody as having been seen.
   */
  async fulfilOnArrival(
    facilityId: string,
    patientId: string,
    visitId: string,
    tx: AuditedTx,
    at: Date = new Date(),
  ): Promise<string | null> {
    const { start, end } = facilityDayBounds(at);
    const candidates = await tx.appointment.findMany({
      where: {
        facilityId,
        patientId,
        scheduledAt: { gte: start, lt: end },
        status: { in: [...OPEN_APPOINTMENT_STATUSES] },
      },
      select: { id: true },
    });

    if (candidates.length !== 1) return null;

    const appointmentId = candidates[0].id;
    await tx.appointment.update({
      where: { id: appointmentId },
      data: { status: 'fulfilled' },
    });
    // Visit.appointmentId is @unique, so the link is one-to-one by construction: a
    // second visit can never claim the same booking.
    await tx.visit.update({ where: { id: visitId }, data: { appointmentId } });
    return appointmentId;
  }

  private toSummary(row: AppointmentRow): AppointmentSummary {
    return {
      id: row.id,
      status: row.status,
      patientId: row.patientId,
      patientName: fullName([row.patient.prefix, row.patient.firstName, row.patient.lastName]),
      patientMrn: row.patient.mrn,
      patientPhone: row.patient.phone,
      departmentId: row.departmentId,
      departmentName: row.department.name,
      practitionerId: row.practitionerId,
      practitionerName: row.practitioner
        ? fullName([row.practitioner.firstName, row.practitioner.lastName])
        : null,
      scheduledOn: facilityDateString(row.scheduledAt),
      reason: row.reason,
      visitId: row.visit?.id ?? null,
      visitNo: row.visit?.visitNo ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
