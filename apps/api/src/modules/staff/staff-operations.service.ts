import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { shamsiToGregorian, utcToShamsi } from '@redmars/shared';
import type { AuthContext } from '../../auth/auth-context';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateLeaveRequest, MarkAttendance, SaveRosterEntry } from '@redmars/shared';
import { countWorkingDays, dateOnly, dateString, datesInclusive, timeToMinutes } from './hr-rules';
import { StaffService } from './staff.service';

const name = (e: { firstName: string; fatherName: string | null; lastName: string | null }) =>
  [e.firstName, e.fatherName, e.lastName].filter(Boolean).join(' ');
const time = (d: Date) => d.toISOString().slice(11, 16);

@Injectable()
export class StaffOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffService,
  ) {}

  async leaveTypes(auth: AuthContext) {
    return this.prisma.db.leaveType.findMany({
      where: { facilityId: auth.facilityId, voidedAt: null },
      orderBy: { nameEn: 'asc' },
      select: {
        id: true,
        code: true,
        nameEn: true,
        namePrs: true,
        namePs: true,
        annualEntitlement: true,
        requiresAttachment: true,
        isPaid: true,
        isActive: true,
      },
    });
  }

  async createLeaveType(auth: AuthContext, input: Record<string, unknown>) {
    return this.prisma.db.leaveType.create({
      data: {
        facilityId: auth.facilityId,
        ...input,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      } as Prisma.LeaveTypeUncheckedCreateInput,
      select: {
        id: true,
        code: true,
        nameEn: true,
        namePrs: true,
        namePs: true,
        annualEntitlement: true,
        requiresAttachment: true,
        isPaid: true,
        isActive: true,
      },
    });
  }

  async updateLeaveType(auth: AuthContext, id: string, input: Record<string, unknown>) {
    const found = await this.prisma.db.leaveType.findFirst({
      where: { id, facilityId: auth.facilityId, voidedAt: null },
    });
    if (!found) throw new NotFoundException('Leave type not found');
    return this.prisma.db.leaveType.update({
      where: { id },
      data: { ...input, updatedBy: auth.userId },
      select: {
        id: true,
        code: true,
        nameEn: true,
        namePrs: true,
        namePs: true,
        annualEntitlement: true,
        requiresAttachment: true,
        isPaid: true,
        isActive: true,
      },
    });
  }

  async holidays(auth: AuthContext, from?: string, to?: string) {
    const rows = await this.prisma.db.hrHoliday.findMany({
      where: {
        facilityId: auth.facilityId,
        ...(from || to
          ? {
              holidayDate: {
                ...(from ? { gte: dateOnly(from) } : {}),
                ...(to ? { lte: dateOnly(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { holidayDate: 'asc' },
    });
    return rows.map((h) => ({
      id: h.id,
      holidayDate: dateString(h.holidayDate),
      nameEn: h.nameEn,
      namePrs: h.namePrs,
      namePs: h.namePs,
      isActive: h.isActive,
    }));
  }

  async createHoliday(
    auth: AuthContext,
    input: {
      holidayDate: string;
      nameEn: string;
      namePrs?: string | null;
      namePs?: string | null;
      isActive?: boolean;
    },
  ) {
    const h = await this.prisma.db.hrHoliday.create({
      data: {
        facilityId: auth.facilityId,
        ...input,
        holidayDate: dateOnly(input.holidayDate),
        createdBy: auth.userId,
        updatedBy: auth.userId,
      },
    });
    return {
      id: h.id,
      holidayDate: dateString(h.holidayDate),
      nameEn: h.nameEn,
      namePrs: h.namePrs,
      namePs: h.namePs,
      isActive: h.isActive,
    };
  }

  private async leaveDays(auth: AuthContext, startsOn: string, endsOn: string) {
    const start = dateOnly(startsOn),
      end = dateOnly(endsOn);
    if (end < start)
      throw new BadRequestException('Leave end date must be on or after the start date.');
    const config = await this.staff.getConfig(auth);
    if (!config.weeklyRestDays.length)
      throw new BadRequestException({
        code: 'hr_calendar_not_configured',
        message: 'Configure weekly rest days before entering leave.',
      });
    const holidays = await this.prisma.db.hrHoliday.findMany({
      where: { facilityId: auth.facilityId, isActive: true, holidayDate: { gte: start, lte: end } },
      select: { holidayDate: true },
    });
    const set = new Set(holidays.map((h) => dateString(h.holidayDate)));
    return {
      days: countWorkingDays(start, end, config.weeklyRestDays, set),
      workingDates: datesInclusive(start, end).filter(
        (d) => !config.weeklyRestDays.includes(d.getUTCDay()) && !set.has(dateString(d)),
      ),
    };
  }

  async leaveRequests(auth: AuthContext, mine = false) {
    let employeeId: string | undefined;
    if (mine)
      employeeId = (
        await this.prisma.db.employee.findFirst({
          where: { facilityId: auth.facilityId, userId: auth.userId },
          select: { id: true },
        })
      )?.id;
    const rows = await this.prisma.db.leaveRequest.findMany({
      where: {
        facilityId: auth.facilityId,
        voidedAt: null,
        ...(mine ? { employeeId: employeeId ?? '__none__' } : {}),
      },
      include: { employee: true, leaveType: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: name(r.employee),
      leaveTypeId: r.leaveTypeId,
      leaveTypeName: r.leaveType.nameEn,
      startsOn: dateString(r.startsOn),
      endsOn: dateString(r.endsOn),
      daysRequested: r.daysRequested,
      reason: r.reason,
      status: r.status,
      decisionNote: r.decisionNote,
      decidedAt: r.decidedAt?.toISOString() ?? null,
    }));
  }

  async createLeaveRequest(auth: AuthContext, input: CreateLeaveRequest) {
    const own = await this.prisma.db.employee.findFirst({
      where: { facilityId: auth.facilityId, userId: auth.userId, voidedAt: null },
      select: { id: true },
    });
    const employeeId = input.employeeId ?? own?.id;
    if (!employeeId) throw new BadRequestException('Employee is required.');
    if (
      input.employeeId &&
      input.employeeId !== own?.id &&
      !auth.permissions.has('hr.leave.approve')
    )
      throw new BadRequestException('You may submit leave only for your own employee record.');
    const [employee, type] = await Promise.all([
      this.prisma.db.employee.findFirst({
        where: {
          id: employeeId,
          facilityId: auth.facilityId,
          status: { not: 'exited' },
          voidedAt: null,
        },
      }),
      this.prisma.db.leaveType.findFirst({
        where: {
          id: input.leaveTypeId,
          facilityId: auth.facilityId,
          isActive: true,
          voidedAt: null,
        },
      }),
    ]);
    if (!employee || !type) throw new BadRequestException('Employee or leave type is invalid.');
    const overlap = await this.prisma.db.leaveRequest.count({
      where: {
        facilityId: auth.facilityId,
        employeeId,
        status: { in: ['submitted', 'approved'] },
        startsOn: { lte: dateOnly(input.endsOn) },
        endsOn: { gte: dateOnly(input.startsOn) },
      },
    });
    if (overlap) throw new ConflictException('This employee already has overlapping leave.');
    if (type.requiresAttachment && !input.attachmentDocumentId)
      throw new BadRequestException('This leave type requires an attachment.');
    const config = await this.staff.getConfig(auth);
    if (
      dateOnly(input.startsOn).getTime() <
      dateOnly(new Date()).getTime() - config.leavePastEntryDays * 86_400_000
    )
      throw new BadRequestException('Leave is outside the permitted backdating window.');
    const { days } = await this.leaveDays(auth, input.startsOn, input.endsOn);
    if (!days) throw new BadRequestException('The selected range contains no working days.');
    if (type.annualEntitlement !== null) {
      const balance = (await this.leaveBalance(auth, employeeId, type.id)) as { remaining: number };
      if (days > balance.remaining)
        throw new BadRequestException({
          code: 'insufficient_leave_balance',
          message: `Only ${balance.remaining} day(s) remain for this leave type.`,
        });
    }
    const r = await this.prisma.db.leaveRequest.create({
      data: {
        facilityId: auth.facilityId,
        employeeId,
        leaveTypeId: input.leaveTypeId,
        startsOn: dateOnly(input.startsOn),
        endsOn: dateOnly(input.endsOn),
        daysRequested: days,
        reason: input.reason,
        attachmentDocumentId: input.attachmentDocumentId,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      },
    });
    return { id: r.id, status: r.status, daysRequested: r.daysRequested };
  }

  async leaveBalance(auth: AuthContext, employeeId: string, leaveTypeId?: string) {
    const jalaliYear = Number(utcToShamsi(new Date()).slice(0, 4));
    const starts = dateOnly(shamsiToGregorian(`${jalaliYear}-01-01`));
    const ends = dateOnly(shamsiToGregorian(`${jalaliYear + 1}-01-01`));
    const types = await this.prisma.db.leaveType.findMany({
      where: {
        facilityId: auth.facilityId,
        voidedAt: null,
        ...(leaveTypeId ? { id: leaveTypeId } : {}),
      },
    });
    const used = await this.prisma.db.leaveRequest.groupBy({
      by: ['leaveTypeId'],
      where: {
        facilityId: auth.facilityId,
        employeeId,
        status: 'approved',
        startsOn: { gte: starts, lt: ends },
      },
      _sum: { daysRequested: true },
    });
    const usedMap = new Map(used.map((u) => [u.leaveTypeId, u._sum.daysRequested ?? 0]));
    const items = types.map((t) => ({
      leaveTypeId: t.id,
      leaveTypeName: t.nameEn,
      entitlement: t.annualEntitlement,
      used: usedMap.get(t.id) ?? 0,
      remaining:
        t.annualEntitlement === null
          ? null
          : Math.max(0, t.annualEntitlement - (usedMap.get(t.id) ?? 0)),
      jalaliYear,
    }));
    return leaveTypeId
      ? (items[0] ?? { leaveTypeId, entitlement: null, used: 0, remaining: null, jalaliYear })
      : items;
  }

  async decideLeave(
    auth: AuthContext,
    id: string,
    decision: 'approve' | 'reject',
    note?: string | null,
  ) {
    const r = await this.prisma.db.leaveRequest.findFirst({
      where: { id, facilityId: auth.facilityId, status: 'submitted', voidedAt: null },
    });
    if (!r) throw new NotFoundException('Submitted leave request not found.');
    const working =
      decision === 'approve'
        ? (await this.leaveDays(auth, dateString(r.startsOn), dateString(r.endsOn))).workingDates
        : [];
    await this.prisma.db.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id },
        data: {
          status: decision === 'approve' ? 'approved' : 'rejected',
          decidedBy: auth.userId,
          decidedAt: new Date(),
          decisionNote: note,
          updatedBy: auth.userId,
        },
      });
      for (const workDate of working) {
        const existing = await tx.attendanceDay.findFirst({
          where: {
            facilityId: auth.facilityId,
            employeeId: r.employeeId,
            workDate,
            shiftTypeId: null,
            voidedAt: null,
          },
        });
        const data = {
          status: 'on_leave' as const,
          leaveRequestId: id,
          markedByUserId: auth.userId,
          markedAt: new Date(),
          note: 'Approved leave',
          updatedBy: auth.userId,
        };
        if (existing) await tx.attendanceDay.update({ where: { id: existing.id }, data });
        else
          await tx.attendanceDay.create({
            data: {
              facilityId: auth.facilityId,
              employeeId: r.employeeId,
              workDate,
              shiftTypeId: null,
              ...data,
              createdBy: auth.userId,
            },
          });
      }
    });
    return { id, status: decision === 'approve' ? 'approved' : 'rejected' };
  }

  async cancelLeave(auth: AuthContext, id: string) {
    const r = await this.prisma.db.leaveRequest.findFirst({
      where: {
        id,
        facilityId: auth.facilityId,
        status: { in: ['submitted', 'approved'] },
        voidedAt: null,
      },
      include: { employee: true },
    });
    if (!r) throw new NotFoundException('Active leave request not found.');
    if (r.employee.userId !== auth.userId && !auth.permissions.has('hr.leave.approve'))
      throw new BadRequestException('You cannot cancel this leave request.');
    await this.prisma.db.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id },
        data: { status: 'cancelled', cancelledAt: new Date(), updatedBy: auth.userId },
      });
      await tx.attendanceDay.updateMany({
        where: {
          facilityId: auth.facilityId,
          leaveRequestId: id,
          workDate: { gte: dateOnly(new Date()) },
          voidedAt: null,
        },
        data: {
          voidedAt: new Date(),
          voidedBy: auth.userId,
          voidReason: 'Leave cancelled',
          updatedBy: auth.userId,
        },
      });
    });
    return { id, status: 'cancelled' };
  }

  async attendance(auth: AuthContext, workDate: string, departmentId?: string) {
    const d = dateOnly(workDate),
      config = await this.staff.getConfig(auth);
    const [employees, rows, holiday] = await Promise.all([
      this.prisma.db.employee.findMany({
        where: {
          facilityId: auth.facilityId,
          status: { not: 'exited' },
          voidedAt: null,
          ...(departmentId ? { departmentId } : {}),
        },
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.db.attendanceDay.findMany({
        where: { facilityId: auth.facilityId, workDate: d, voidedAt: null },
      }),
      this.prisma.db.hrHoliday.findFirst({
        where: { facilityId: auth.facilityId, holidayDate: d, isActive: true },
      }),
    ]);
    return employees.map((e) => {
      const r = rows.find((x) => x.employeeId === e.id && x.shiftTypeId === null);
      const generated = holiday
        ? 'holiday'
        : config.weeklyRestDays.includes(d.getUTCDay())
          ? 'rest_day'
          : null;
      return {
        id: r?.id ?? null,
        employeeId: e.id,
        employeeNo: e.employeeNo,
        employeeName: name(e),
        workDate,
        shiftTypeId: r?.shiftTypeId ?? null,
        status: r?.status ?? generated ?? 'absent',
        minutesLate: r?.minutesLate ?? 0,
        note: r?.note ?? holiday?.nameEn ?? null,
        source: r ? 'recorded' : (generated ?? 'empty'),
      };
    });
  }

  async markAttendance(auth: AuthContext, input: MarkAttendance) {
    const workDate = dateOnly(input.workDate);
    await this.prisma.db.$transaction(async (tx) => {
      for (const entry of input.entries) {
        const employee = await tx.employee.count({
          where: {
            id: entry.employeeId,
            facilityId: auth.facilityId,
            status: { not: 'exited' },
            voidedAt: null,
          },
        });
        if (!employee) throw new BadRequestException('Attendance contains an invalid employee.');
        const existing = await tx.attendanceDay.findFirst({
          where: {
            facilityId: auth.facilityId,
            employeeId: entry.employeeId,
            workDate,
            shiftTypeId: entry.shiftTypeId ?? null,
            voidedAt: null,
          },
        });
        const data = {
          status: entry.status,
          minutesLate: entry.minutesLate,
          note: entry.note,
          markedByUserId: auth.userId,
          markedAt: new Date(),
          updatedBy: auth.userId,
        };
        if (existing) {
          if (existing.status === 'on_leave' && entry.status !== 'on_leave')
            throw new ConflictException('Approved leave attendance cannot be overwritten.');
          await tx.attendanceDay.update({ where: { id: existing.id }, data });
        } else
          await tx.attendanceDay.create({
            data: {
              facilityId: auth.facilityId,
              employeeId: entry.employeeId,
              workDate,
              shiftTypeId: entry.shiftTypeId ?? null,
              ...data,
              createdBy: auth.userId,
            },
          });
      }
    });
    return this.attendance(auth, input.workDate);
  }

  async shiftTypes(auth: AuthContext) {
    const rows = await this.prisma.db.shiftType.findMany({
      where: { facilityId: auth.facilityId, voidedAt: null },
      orderBy: { startsAt: 'asc' },
    });
    return rows.map((s) => ({
      id: s.id,
      code: s.code,
      nameEn: s.nameEn,
      namePrs: s.namePrs,
      namePs: s.namePs,
      startsAt: time(s.startsAt),
      endsAt: time(s.endsAt),
      crossesMidnight: s.crossesMidnight,
      color: s.color,
      isActive: s.isActive,
    }));
  }

  async createShiftType(
    auth: AuthContext,
    input: {
      code: string;
      nameEn: string;
      namePrs?: string | null;
      namePs?: string | null;
      startsAt: string;
      endsAt: string;
      color?: string | null;
      isActive?: boolean;
    },
  ) {
    const startsAt = new Date(`1970-01-01T${input.startsAt}:00.000Z`),
      endsAt = new Date(`1970-01-01T${input.endsAt}:00.000Z`);
    const s = await this.prisma.db.shiftType.create({
      data: {
        facilityId: auth.facilityId,
        ...input,
        startsAt,
        endsAt,
        crossesMidnight: timeToMinutes(input.endsAt) <= timeToMinutes(input.startsAt),
        createdBy: auth.userId,
        updatedBy: auth.userId,
      },
    });
    return {
      id: s.id,
      code: s.code,
      nameEn: s.nameEn,
      namePrs: s.namePrs,
      namePs: s.namePs,
      startsAt: time(s.startsAt),
      endsAt: time(s.endsAt),
      crossesMidnight: s.crossesMidnight,
      color: s.color,
      isActive: s.isActive,
    };
  }

  async updateShiftType(
    auth: AuthContext,
    id: string,
    input: Partial<{
      code: string;
      nameEn: string;
      namePrs: string | null;
      namePs: string | null;
      startsAt: string;
      endsAt: string;
      color: string | null;
      isActive: boolean;
    }>,
  ) {
    const found = await this.prisma.db.shiftType.findFirst({
      where: { id, facilityId: auth.facilityId, voidedAt: null },
    });
    if (!found) throw new NotFoundException('Shift type not found');
    const starts = input.startsAt ?? time(found.startsAt),
      ends = input.endsAt ?? time(found.endsAt);
    const s = await this.prisma.db.shiftType.update({
      where: { id },
      data: {
        ...input,
        ...(input.startsAt ? { startsAt: new Date(`1970-01-01T${input.startsAt}:00.000Z`) } : {}),
        ...(input.endsAt ? { endsAt: new Date(`1970-01-01T${input.endsAt}:00.000Z`) } : {}),
        crossesMidnight: timeToMinutes(ends) <= timeToMinutes(starts),
        updatedBy: auth.userId,
      },
    });
    return {
      id: s.id,
      code: s.code,
      nameEn: s.nameEn,
      namePrs: s.namePrs,
      namePs: s.namePs,
      startsAt: time(s.startsAt),
      endsAt: time(s.endsAt),
      crossesMidnight: s.crossesMidnight,
      color: s.color,
      isActive: s.isActive,
    };
  }

  async roster(auth: AuthContext, from: string, to: string, departmentId?: string) {
    const rows = await this.prisma.db.rosterEntry.findMany({
      where: {
        facilityId: auth.facilityId,
        dutyDate: { gte: dateOnly(from), lte: dateOnly(to) },
        voidedAt: null,
        ...(departmentId ? { departmentId } : {}),
      },
      include: { employee: true, shiftType: true },
      orderBy: [{ dutyDate: 'asc' }, { shiftType: { startsAt: 'asc' } }],
    });
    return rows.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: name(r.employee),
      departmentId: r.departmentId,
      shiftTypeId: r.shiftTypeId,
      shiftName: r.shiftType.nameEn,
      dutyDate: dateString(r.dutyDate),
      roleOnShift: r.roleOnShift,
      status: r.status,
      notes: r.notes,
    }));
  }

  async createRoster(auth: AuthContext, input: SaveRosterEntry) {
    const [employee, shift] = await Promise.all([
      this.prisma.db.employee.findFirst({
        where: {
          id: input.employeeId,
          facilityId: auth.facilityId,
          departmentId: input.departmentId,
          status: { not: 'exited' },
          voidedAt: null,
        },
      }),
      this.prisma.db.shiftType.findFirst({
        where: {
          id: input.shiftTypeId,
          facilityId: auth.facilityId,
          isActive: true,
          voidedAt: null,
        },
      }),
    ]);
    if (!employee || !shift)
      throw new BadRequestException('Employee, department or shift is invalid.');
    const leave = await this.prisma.db.leaveRequest.count({
      where: {
        facilityId: auth.facilityId,
        employeeId: input.employeeId,
        status: 'approved',
        startsOn: { lte: dateOnly(input.dutyDate) },
        endsOn: { gte: dateOnly(input.dutyDate) },
      },
    });
    if (leave) throw new ConflictException('Employee is on approved leave on this date.');
    const r = await this.prisma.db.rosterEntry.create({
      data: {
        facilityId: auth.facilityId,
        ...input,
        dutyDate: dateOnly(input.dutyDate),
        createdBy: auth.userId,
        updatedBy: auth.userId,
      },
    });
    return { id: r.id, status: r.status };
  }

  async copyRoster(
    auth: AuthContext,
    sourceStartsOn: string,
    targetStartsOn: string,
    departmentId?: string,
  ) {
    const source = dateOnly(sourceStartsOn),
      target = dateOnly(targetStartsOn),
      delta = target.getTime() - source.getTime();
    const rows = await this.prisma.db.rosterEntry.findMany({
      where: {
        facilityId: auth.facilityId,
        dutyDate: { gte: source, lt: new Date(source.getTime() + 7 * 86_400_000) },
        status: { not: 'cancelled' },
        voidedAt: null,
        ...(departmentId ? { departmentId } : {}),
      },
    });
    let copied = 0;
    for (const row of rows) {
      const dutyDate = new Date(row.dutyDate.getTime() + delta);
      await this.prisma.db.rosterEntry.upsert({
        where: {
          facilityId_employeeId_dutyDate_shiftTypeId: {
            facilityId: auth.facilityId,
            employeeId: row.employeeId,
            dutyDate,
            shiftTypeId: row.shiftTypeId,
          },
        },
        create: {
          facilityId: auth.facilityId,
          employeeId: row.employeeId,
          departmentId: row.departmentId,
          shiftTypeId: row.shiftTypeId,
          dutyDate,
          roleOnShift: row.roleOnShift,
          notes: row.notes,
          createdBy: auth.userId,
          updatedBy: auth.userId,
        },
        update: {
          roleOnShift: row.roleOnShift,
          notes: row.notes,
          status: 'draft',
          updatedBy: auth.userId,
        },
      });
      copied++;
    }
    return { copied };
  }

  async publishRoster(auth: AuthContext, startsOn: string, endsOn: string, departmentId?: string) {
    const where = {
      facilityId: auth.facilityId,
      dutyDate: { gte: dateOnly(startsOn), lte: dateOnly(endsOn) },
      status: 'draft' as const,
      voidedAt: null,
      ...(departmentId ? { departmentId } : {}),
    };
    const rows = await this.prisma.db.rosterEntry.findMany({ where, include: { employee: true } });
    await this.prisma.db.$transaction(async (tx) => {
      await tx.rosterEntry.updateMany({
        where,
        data: {
          status: 'confirmed',
          publishedAt: new Date(),
          publishedBy: auth.userId,
          updatedBy: auth.userId,
        },
      });
      const recipients = new Map(
        rows.filter((r) => r.employee.userId).map((r) => [r.employeeId, r.employee.userId!]),
      );
      if (recipients.size)
        await tx.hrNotification.createMany({
          data: [...recipients].map(([employeeId, recipientUserId]) => ({
            facilityId: auth.facilityId,
            employeeId,
            recipientUserId,
            type: 'roster_published',
            title: 'Duty roster published',
            message: `Your roster for ${startsOn} to ${endsOn} is available.`,
            payload: { startsOn, endsOn },
          })),
        });
    });
    return { published: rows.length, notified: new Set(rows.map((r) => r.employeeId)).size };
  }

  async cancelRoster(auth: AuthContext, id: string) {
    const found = await this.prisma.db.rosterEntry.findFirst({
      where: { id, facilityId: auth.facilityId, voidedAt: null },
    });
    if (!found) throw new NotFoundException('Roster entry not found');
    await this.prisma.db.rosterEntry.update({
      where: { id },
      data: { status: 'cancelled', updatedBy: auth.userId },
    });
    return { id, status: 'cancelled' };
  }

  async rosterWarnings(auth: AuthContext, startsOn: string, endsOn: string, departmentId?: string) {
    const start = dateOnly(startsOn),
      end = dateOnly(endsOn);
    const [rows, leaves, config] = await Promise.all([
      this.prisma.db.rosterEntry.findMany({
        where: {
          facilityId: auth.facilityId,
          dutyDate: { gte: start, lte: end },
          status: { not: 'cancelled' },
          voidedAt: null,
          ...(departmentId ? { departmentId } : {}),
        },
        include: { employee: true, shiftType: true },
      }),
      this.prisma.db.leaveRequest.findMany({
        where: {
          facilityId: auth.facilityId,
          status: 'approved',
          startsOn: { lte: end },
          endsOn: { gte: start },
        },
      }),
      this.staff.getConfig(auth),
    ]);
    const warnings: Array<Record<string, string | number | null>> = [];
    for (const row of rows) {
      if (
        leaves.some(
          (leave) =>
            leave.employeeId === row.employeeId &&
            leave.startsOn <= row.dutyDate &&
            leave.endsOn >= row.dutyDate,
        )
      ) {
        warnings.push({
          type: 'leave_conflict',
          date: dateString(row.dutyDate),
          employeeId: row.employeeId,
          departmentId: row.departmentId,
          message: `${name(row.employee)} is rostered during approved leave.`,
        });
      }
    }
    const nightByEmployee = new Map<string, typeof rows>();
    for (const row of rows.filter((x) => x.shiftType.crossesMidnight)) {
      const list = nightByEmployee.get(row.employeeId) ?? [];
      list.push(row);
      nightByEmployee.set(row.employeeId, list);
    }
    for (const list of nightByEmployee.values()) {
      list.sort((a, b) => a.dutyDate.getTime() - b.dutyDate.getTime());
      let count = 1;
      for (let i = 1; i < list.length; i++) {
        count =
          list[i].dutyDate.getTime() - list[i - 1].dutyDate.getTime() === 86_400_000
            ? count + 1
            : 1;
        if (count === config.maxConsecutiveNightShifts + 1)
          warnings.push({
            type: 'consecutive_nights',
            date: dateString(list[i].dutyDate),
            employeeId: list[i].employeeId,
            departmentId: list[i].departmentId,
            message: `${name(list[i].employee)} exceeds ${config.maxConsecutiveNightShifts} consecutive night shifts.`,
          });
      }
    }
    for (const dutyDate of datesInclusive(start, end)) {
      for (const requirement of config.staffingRequirements) {
        if (departmentId && requirement.departmentId !== departmentId) continue;
        const assigned = rows.filter(
          (row) =>
            row.dutyDate.getTime() === dutyDate.getTime() &&
            row.departmentId === requirement.departmentId &&
            row.shiftTypeId === requirement.shiftTypeId &&
            (!requirement.roleOnShift || row.roleOnShift === requirement.roleOnShift),
        ).length;
        if (assigned < requirement.minimumStaff)
          warnings.push({
            type: 'understaffed',
            date: dateString(dutyDate),
            employeeId: null,
            departmentId: requirement.departmentId,
            shiftTypeId: requirement.shiftTypeId,
            message: `Coverage is ${assigned}/${requirement.minimumStaff}${requirement.roleOnShift ? ` for ${requirement.roleOnShift}` : ''}.`,
          });
      }
    }
    return warnings;
  }

  async onDuty(auth: AuthContext, departmentId?: string, at = new Date()) {
    const local = new Date(at.getTime() + 4.5 * 60 * 60 * 1000),
      today = dateOnly(local),
      yesterday = new Date(today.getTime() - 86_400_000),
      minute = local.getUTCHours() * 60 + local.getUTCMinutes();
    const rows = await this.prisma.db.rosterEntry.findMany({
      where: {
        facilityId: auth.facilityId,
        dutyDate: { in: [today, yesterday] },
        status: 'confirmed',
        voidedAt: null,
        ...(departmentId ? { departmentId } : {}),
      },
      include: { employee: true, shiftType: true },
    });
    return rows
      .filter((r) => {
        const start = timeToMinutes(time(r.shiftType.startsAt)),
          end = timeToMinutes(time(r.shiftType.endsAt)),
          isToday = r.dutyDate.getTime() === today.getTime();
        return r.shiftType.crossesMidnight
          ? isToday
            ? minute >= start
            : minute < end
          : isToday && minute >= start && minute < end;
      })
      .map((r) => ({
        employeeId: r.employeeId,
        employeeName: name(r.employee),
        departmentId: r.departmentId,
        shiftName: r.shiftType.nameEn,
        roleOnShift: r.roleOnShift,
      }));
  }

  async report(auth: AuthContext, from: string, to: string) {
    const rows = await this.prisma.db.attendanceDay.groupBy({
      by: ['employeeId', 'status'],
      where: {
        facilityId: auth.facilityId,
        workDate: { gte: dateOnly(from), lte: dateOnly(to) },
        voidedAt: null,
      },
      _count: { _all: true },
      _sum: { minutesLate: true },
    });
    const employees = await this.prisma.db.employee.findMany({
      where: {
        facilityId: auth.facilityId,
        id: { in: [...new Set(rows.map((r) => r.employeeId))] },
      },
    });
    return employees.map((e) => ({
      employeeId: e.id,
      employeeNo: e.employeeNo,
      employeeName: name(e),
      statuses: Object.fromEntries(
        rows.filter((r) => r.employeeId === e.id).map((r) => [r.status, r._count._all]),
      ),
      minutesLate: rows
        .filter((r) => r.employeeId === e.id)
        .reduce((n, r) => n + (r._sum.minutesLate ?? 0), 0),
    }));
  }
}
