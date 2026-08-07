import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AuditLogQuery,
  AuditLogResponse,
  CensusReportResponse,
  ClinicalDepartmentType,
  DiagnosisReportResponse,
  ErrorLogQuery,
  ErrorLogResponse,
  PatientExportResponse,
  ReportRangeQuery,
  RevenueReportResponse,
  WaitTimeReportResponse,
} from '@redmars/shared';
import { CLINICAL_DEPARTMENT_TYPES } from '@redmars/shared';
import { resolveRange } from '../../common/date-range';
import { facilityDateString } from '../../common/facility-time';
import { PrismaService } from '../../prisma/prisma.service';
import { fullName, money } from '../invoice/invoice.service';

const ZERO = new Prisma.Decimal(0);

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Task 6c — reports. Every method here answers a question a manager or admin already had
 * the RIGHT to ask (the permission grants are 6b's, seeded and unused until now); this is
 * just the first thing that actually reads them.
 *
 * `ownerId`, where a method takes one, is the R8 scope from 6c.6: the receptionist's grant
 * on `report.operational` is task-scoped exactly the way `invoice.list` was narrowed off
 * her in 6b.9 — her own day, never the facility's. It is resolved by the controller from
 * `auth.permissions`, the same shape InvoiceService reads R12 off of, so this service never
 * has to know which role is asking, only whether the caller's view is scoped.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async census(
    facilityId: string,
    query: ReportRangeQuery,
    ownerId: string | null,
  ): Promise<CensusReportResponse> {
    const { start, end, from, to } = resolveRange(query);

    const visitWhere: Prisma.VisitWhereInput = {
      facilityId,
      startedAt: { gte: start, lt: end },
    };
    if (query.departmentId) visitWhere.departmentId = query.departmentId;
    if (query.practitionerId) visitWhere.practitionerId = query.practitionerId;
    if (ownerId) visitWhere.createdBy = ownerId;

    const visits = await this.prisma.db.visit.findMany({
      where: visitWhere,
      select: {
        startedAt: true,
        status: true,
        departmentId: true,
        department: { select: { name: true } },
      },
    });

    const apptWhere: Prisma.AppointmentWhereInput = {
      facilityId,
      scheduledAt: { gte: start, lt: end },
      status: 'no_show',
    };
    if (query.departmentId) apptWhere.departmentId = query.departmentId;
    if (query.practitionerId) apptWhere.practitionerId = query.practitionerId;
    if (ownerId) apptWhere.createdBy = ownerId;

    const noShows = await this.prisma.db.appointment.findMany({
      where: apptWhere,
      select: { scheduledAt: true, departmentId: true },
    });

    interface Bucket {
      date: string;
      departmentId: string;
      departmentName: string;
      visitCount: number;
      completed: number;
      cancelled: number;
      noShow: number;
    }
    const buckets = new Map<string, Bucket>();
    const bucketFor = (date: string, departmentId: string, departmentName: string): Bucket => {
      const key = `${date}|${departmentId}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          date,
          departmentId,
          departmentName,
          visitCount: 0,
          completed: 0,
          cancelled: 0,
          noShow: 0,
        };
        buckets.set(key, bucket);
      }
      return bucket;
    };

    for (const visit of visits) {
      const bucket = bucketFor(
        facilityDateString(visit.startedAt),
        visit.departmentId,
        visit.department.name,
      );
      bucket.visitCount += 1;
      if (visit.status === 'completed') bucket.completed += 1;
      if (visit.status === 'cancelled') bucket.cancelled += 1;
    }

    if (noShows.length > 0) {
      const deptNames = await this.prisma.db.department.findMany({
        where: { id: { in: [...new Set(noShows.map((a) => a.departmentId))] } },
        select: { id: true, name: true },
      });
      const nameOf = new Map(deptNames.map((d) => [d.id, d.name]));
      for (const appt of noShows) {
        const bucket = bucketFor(
          facilityDateString(appt.scheduledAt),
          appt.departmentId,
          nameOf.get(appt.departmentId) ?? '',
        );
        bucket.noShow += 1;
      }
    }

    const rows = [...buckets.values()].sort(
      (a, b) => b.date.localeCompare(a.date) || a.departmentName.localeCompare(b.departmentName),
    );

    const totals = rows.reduce(
      (sum, r) => ({
        visitCount: sum.visitCount + r.visitCount,
        completed: sum.completed + r.completed,
        cancelled: sum.cancelled + r.cancelled,
        noShow: sum.noShow + r.noShow,
      }),
      { visitCount: 0, completed: 0, cancelled: 0, noShow: 0 },
    );

    return { from, to, scope: ownerId ? 'own' : 'facility', rows, totals };
  }

  async waitTimes(
    facilityId: string,
    query: ReportRangeQuery,
    ownerId: string | null,
  ): Promise<WaitTimeReportResponse> {
    const { start, end, from, to } = resolveRange(query);

    const where: Prisma.VisitWhereInput = { facilityId, startedAt: { gte: start, lt: end } };
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.practitionerId) where.practitionerId = query.practitionerId;
    if (ownerId) where.createdBy = ownerId;

    const visits = await this.prisma.db.visit.findMany({
      where,
      select: {
        departmentId: true,
        department: { select: { name: true } },
        practitionerId: true,
        practitioner: { select: { firstName: true, lastName: true } },
        statusHistory: { select: { status: true, changedAt: true }, orderBy: { changedAt: 'asc' } },
      },
    });

    interface Bucket {
      departmentId: string;
      departmentName: string;
      practitionerId: string | null;
      practitionerName: string | null;
      waits: number[];
    }
    const buckets = new Map<string, Bucket>();

    for (const visit of visits) {
      const arrived = visit.statusHistory.find((h) => h.status === 'arrived')?.changedAt;
      const inProgress = visit.statusHistory.find((h) => h.status === 'in_progress')?.changedAt;
      if (!arrived || !inProgress) continue; // never progressed within the window — no wait to report yet

      const key = `${visit.departmentId}|${visit.practitionerId ?? ''}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          departmentId: visit.departmentId,
          departmentName: visit.department.name,
          practitionerId: visit.practitionerId,
          practitionerName: visit.practitioner
            ? fullName([visit.practitioner.firstName, visit.practitioner.lastName])
            : null,
          waits: [],
        };
        buckets.set(key, bucket);
      }
      bucket.waits.push((inProgress.getTime() - arrived.getTime()) / 60_000);
    }

    const rows = [...buckets.values()]
      .map((b) => ({
        departmentId: b.departmentId,
        departmentName: b.departmentName,
        practitionerId: b.practitionerId,
        practitionerName: b.practitionerName,
        visitCount: b.waits.length,
        avgWaitMinutes: average(b.waits),
        medianWaitMinutes: median(b.waits),
      }))
      .sort((a, b) => a.departmentName.localeCompare(b.departmentName));

    return { from, to, scope: ownerId ? 'own' : 'facility', rows };
  }

  async revenue(facilityId: string, query: ReportRangeQuery): Promise<RevenueReportResponse> {
    const { start, end, from, to } = resolveRange(query);

    // No practitionerId filter — a payment belongs to a till, not a doctor. departmentId
    // reaches through the invoice's own visit, since Invoice carries no department itself.
    const invoiceWhere: Prisma.InvoiceWhereInput = { facilityId };
    if (query.departmentId) invoiceWhere.visit = { departmentId: query.departmentId };

    const payments = await this.prisma.db.payment.findMany({
      where: { receivedAt: { gte: start, lt: end }, invoice: invoiceWhere },
      select: {
        amount: true,
        method: true,
        receivedAt: true,
        // Real department, not till-side plumbing: an invoice's own visit (nullable — a
        // payment can land on an invoice raised with no visit at all) carries the
        // department the money was actually earned by.
        invoice: { select: { visit: { select: { department: { select: { type: true } } } } } },
      },
    });

    const byDay = new Map<string, Prisma.Decimal>();
    // Keyed by the department type, or 'other' for anything outside the five patient-facing
    // types — an unlinked invoice, or (not seeded today) a radiology/administration visit.
    const byDepartment = new Map<ClinicalDepartmentType | 'other', Prisma.Decimal>();
    const byMethod = new Map<string, Prisma.Decimal>();
    let grandTotal = ZERO;

    const clinicalTypes: readonly string[] = CLINICAL_DEPARTMENT_TYPES;

    for (const payment of payments) {
      const day = facilityDateString(payment.receivedAt);
      const rawType = payment.invoice.visit?.department.type;
      const deptKey: ClinicalDepartmentType | 'other' =
        rawType && clinicalTypes.includes(rawType) ? (rawType as ClinicalDepartmentType) : 'other';
      byDay.set(day, (byDay.get(day) ?? ZERO).add(payment.amount));
      byDepartment.set(deptKey, (byDepartment.get(deptKey) ?? ZERO).add(payment.amount));
      byMethod.set(payment.method, (byMethod.get(payment.method) ?? ZERO).add(payment.amount));
      grandTotal = grandTotal.add(payment.amount);
    }

    return {
      from,
      to,
      byDay: [...byDay.entries()]
        .map(([date, total]) => ({ date, total: money(total) }))
        .sort((a, b) => b.date.localeCompare(a.date)),
      byDepartment: [...byDepartment.entries()].map(([type, total]) => ({
        type: type === 'other' ? null : type,
        total: money(total),
      })),
      byMethod: [...byMethod.entries()].map(([method, total]) => ({
        method: method as RevenueReportResponse['byMethod'][number]['method'],
        total: money(total),
      })),
      grandTotal: money(grandTotal),
    };
  }

  /**
   * `practitionerId` is a single dial serving two different callers: the controller passes
   * the CALLER'S OWN id when 'doctor' is the sole reason they hold the grant (forced, not a
   * choice — see the controller), and passes whatever `query.practitionerId` asked for
   * otherwise (an admin/management filter, optional). Either way this method only needs to
   * know the id to filter on, never which case produced it.
   */
  async diagnoses(
    facilityId: string,
    query: ReportRangeQuery,
    practitionerId: string | null,
    scope: 'own' | 'facility',
  ): Promise<DiagnosisReportResponse> {
    const { start, end, from, to } = resolveRange(query);

    const where: Prisma.DiagnosisWhereInput = {
      visit: { facilityId, ...(query.departmentId ? { departmentId: query.departmentId } : {}) },
      createdAt: { gte: start, lt: end },
    };
    if (practitionerId) where.practitionerId = practitionerId;

    const diagnoses = await this.prisma.db.diagnosis.findMany({
      where,
      select: { icdCode: true, text: true, icd: { select: { title: true } } },
    });

    const counts = new Map<string, { icdCode: string | null; label: string; count: number }>();
    for (const d of diagnoses) {
      const key = d.icdCode ?? `text:${d.text.trim().toLowerCase()}`;
      const label = d.icdCode ? (d.icd?.title ?? d.icdCode) : d.text.trim();
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { icdCode: d.icdCode, label, count: 1 });
    }

    const rows = [...counts.values()].sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label),
    );

    return { from, to, scope, rows };
  }

  async auditLog(facilityId: string, query: AuditLogQuery): Promise<AuditLogResponse> {
    const where: Prisma.AuditLogWhereInput = { facilityId };
    if (query.from || query.to) {
      const { start, end } = resolveRange(query);
      where.createdAt = { gte: start, lt: end };
    }
    if (query.userId) where.userId = query.userId;
    if (query.action) where.action = query.action;
    if (query.entity) where.entity = { contains: query.entity, mode: 'insensitive' };

    const [total, rows] = await this.prisma.db.$transaction([
      this.prisma.db.auditLog.count({ where }),
      this.prisma.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          userId: true,
          user: { select: { fullName: true } },
          action: true,
          entity: true,
          entityId: true,
          ipAddress: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      rows: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.user?.fullName ?? null,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        ipAddress: r.ipAddress,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async errorLog(facilityId: string, query: ErrorLogQuery): Promise<ErrorLogResponse> {
    // Facility-scoped OR facility-null: a failure before auth resolved (a malformed
    // login body, a probe on a public route) still belongs on this facility's screen —
    // there is nowhere else for a single-tenant deployment to show it.
    const where: Prisma.ErrorLogWhereInput = {
      OR: [{ facilityId }, { facilityId: null }],
    };
    if (query.from || query.to) {
      const { start, end } = resolveRange(query);
      where.createdAt = { gte: start, lt: end };
    }
    if (query.statusCode) where.statusCode = query.statusCode;

    const [total, rows] = await this.prisma.db.$transaction([
      this.prisma.db.errorLog.count({ where }),
      this.prisma.db.errorLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          userId: true,
          user: { select: { fullName: true } },
          method: true,
          path: true,
          statusCode: true,
          message: true,
          stack: true,
          ipAddress: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      rows: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.user?.fullName ?? null,
        method: r.method,
        path: r.path,
        statusCode: r.statusCode,
        message: r.message,
        stack: r.stack,
        ipAddress: r.ipAddress,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /** Same shape as DiagnosisService.practitionerIdOf — resolves the caller's own linked staff row. */
  async practitionerIdOf(facilityId: string, userId: string): Promise<string | null> {
    const practitioner = await this.prisma.db.practitioner.findFirst({
      where: { facilityId, userId },
      select: { id: true },
    });
    return practitioner?.id ?? null;
  }

  /**
   * Task 6c.10 / R11 — the raw patient list. No date range: this is the register itself,
   * not a period's activity, and the reason plus the audit row are the control, not a
   * filter that would make a smaller pull feel less like an export.
   */
  async exportPatients(
    facilityId: string,
    actorUserId: string,
    reason: string,
  ): Promise<PatientExportResponse> {
    const patients = await this.prisma.db.patient.findMany({
      where: { facilityId },
      orderBy: { createdAt: 'asc' },
      select: {
        mrn: true,
        prefix: true,
        firstName: true,
        lastName: true,
        gender: true,
        phone: true,
        address: true,
        createdAt: true,
      },
    });

    // R11 — heavily audited, deliberately outside the opt-in @AuditRead lane: that
    // decorator names one entity id, and this read has none, only a reason and a count.
    await this.prisma.db.auditLog.create({
      data: {
        facilityId,
        userId: actorUserId,
        action: 'export',
        entity: 'Patient',
        after: { reason, count: patients.length },
      },
    });

    return {
      rows: patients.map((p) => ({
        mrn: p.mrn,
        name: fullName([p.prefix, p.firstName, p.lastName]),
        gender: p.gender,
        phone: p.phone,
        address: p.address,
        registeredAt: p.createdAt.toISOString(),
      })),
      count: patients.length,
    };
  }
}
