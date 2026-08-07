import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  AuditLogResponse,
  CensusReportResponse,
  DiagnosisReportResponse,
  LoginResponse,
  PatientExportResponse,
  RevenueReportResponse,
  WaitTimeReportResponse,
} from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 6c — reports (e2e).
 *
 * `report.operational` / `report.financial` / `report.clinical_aggregate` / `audit_log.read`
 * / `data.export` were seeded with 6b's matrix and gated nothing until this phase. The
 * done-when for each: census and wait-times answer for admin/management facility-wide and
 * for reception ONLY HER OWN registrations (R8, the same task-scoping 6b.9 used); revenue
 * is admin/management only; diagnosis counts answer facility-wide for admin/management and
 * ONLY A DOCTOR'S OWN PATIENTS for a doctor; the audit log and the raw patient export are
 * admin/management and admin-only respectively, the latter refusing without a reason and
 * leaving its own audit row behind (R11).
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_rpt_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Reports (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let deptId: string;
  let dept2Id: string;
  let labDeptId: string;
  let doctorUserId: string;
  let practitionerId: string;
  let recepAId: string;
  let recepBId: string;
  let patientId: string;
  const tokens: Record<string, string> = {};

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Reports ${suffix}`,
        passwordHash: await hash(PASSWORD),
      },
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const res = await request(server)
      .post('/auth/login')
      .send({ username: `${PREFIX}${suffix}`, password: PASSWORD })
      .expect(200);
    tokens[suffix] = (res.body as LoginResponse).accessToken;
    return user.id;
  }

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.invoiceItem.deleteMany({ where: { invoice: facilityFilter } });
    await prisma.payment.deleteMany({ where: { invoice: facilityFilter } });
    await prisma.invoice.deleteMany({ where: facilityFilter });
    await prisma.diagnosis.deleteMany({ where: { visit: facilityFilter } });
    await prisma.appointment.deleteMany({ where: facilityFilter });
    await prisma.visitStatusHistory.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visit.deleteMany({ where: facilityFilter });
    await prisma.patient.deleteMany({ where: facilityFilter });
    await prisma.practitioner.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.icdCode.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.department.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });
    // Second sweep — R1's read row is fire-and-forget and can land after the first pass,
    // then block the facility delete on a foreign key (see history.e2e-spec.ts).
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.facility.deleteMany({ where: { code: { startsWith: PREFIX } } });
  }

  /** A visit with a full arrived → in_progress trail, staged directly (no consult flow needed). */
  async function stageVisit(opts: {
    departmentId: string;
    practitionerId?: string | null;
    createdBy: string;
    status: 'arrived' | 'in_progress' | 'completed' | 'cancelled';
    startedAt: Date;
    waitMinutes: number;
  }): Promise<string> {
    const visit = await prisma.visit.create({
      data: {
        facilityId,
        patientId,
        departmentId: opts.departmentId,
        practitionerId: opts.practitionerId ?? null,
        visitNo: `${PREFIX}V${Math.random().toString(36).slice(2, 10)}`,
        type: 'opd_consult',
        status: opts.status,
        startedAt: opts.startedAt,
        createdBy: opts.createdBy,
      },
    });
    const arrivedAt = opts.startedAt;
    await prisma.visitStatusHistory.create({
      data: { visitId: visit.id, status: 'arrived', changedAt: arrivedAt, changedBy: opts.createdBy },
    });
    if (opts.status !== 'arrived') {
      const inProgressAt = new Date(arrivedAt.getTime() + opts.waitMinutes * 60_000);
      await prisma.visitStatusHistory.create({
        data: {
          visitId: visit.id,
          status: 'in_progress',
          changedAt: inProgressAt,
          changedBy: opts.practitionerId ? doctorUserId : opts.createdBy,
        },
      });
    }
    return visit.id;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    await cleanup();

    facilityId = (
      await prisma.facility.create({ data: { code: `${PREFIX}fac`, name: 'E2E Reports Facility' } })
    ).id;

    deptId = (
      await prisma.department.create({
        data: { facilityId, code: `${PREFIX}OPD`, name: 'E2E OPD', type: 'opd' },
      })
    ).id;
    dept2Id = (
      await prisma.department.create({
        data: { facilityId, code: `${PREFIX}OPD2`, name: 'E2E OPD 2', type: 'opd' },
      })
    ).id;
    labDeptId = (
      await prisma.department.create({
        data: { facilityId, code: `${PREFIX}LAB`, name: 'E2E Lab', type: 'laboratory' },
      })
    ).id;

    doctorUserId = await seedActor('doctor', 'doctor');
    recepAId = await seedActor('recepA', 'receptionist');
    recepBId = await seedActor('recepB', 'receptionist');
    await seedActor('admin', 'admin');
    await seedActor('management', 'management');
    await seedActor('lab', 'lab_tech');
    await seedActor('pharmacist', 'pharmacist');

    practitionerId = (
      await prisma.practitioner.create({
        data: {
          facilityId,
          code: `${PREFIX}DR1`,
          firstName: 'Zia',
          lastName: 'Rahimi',
          userId: doctorUserId,
        },
      })
    ).id;

    const patient = await prisma.patient.create({
      data: {
        facilityId,
        mrn: `${PREFIX}MRN1`,
        firstName: 'Bibi',
        lastName: 'Gul',
        gender: 'female',
        phone: '0700000000',
        estimatedAgeYears: 30,
        ageRecordedAt: new Date(),
      },
    });
    patientId = patient.id;

    // Two visits registered by receptionist A (her own desk), one by receptionist B — the
    // fixture that proves R8 scoping. All completed, with a 10-minute and a 30-minute wait.
    await stageVisit({
      departmentId: deptId,
      practitionerId,
      createdBy: recepAId,
      status: 'completed',
      startedAt: new Date(),
      waitMinutes: 10,
    });
    await stageVisit({
      departmentId: deptId,
      practitionerId,
      createdBy: recepAId,
      status: 'cancelled',
      startedAt: new Date(),
      waitMinutes: 5,
    });
    await stageVisit({
      departmentId: dept2Id,
      practitionerId: null,
      createdBy: recepBId,
      status: 'completed',
      startedAt: new Date(),
      waitMinutes: 30,
    });

    // Diagnoses — two coded to the same ICD (one doctor, one no practitioner) and one free text.
    const icd = await prisma.icdCode.create({
      data: { code: `${PREFIX}F32.1`, title: 'E2E Moderate depressive episode' },
    });
    const visitForDx = await stageVisit({
      departmentId: deptId,
      practitionerId,
      createdBy: recepAId,
      status: 'completed',
      startedAt: new Date(),
      waitMinutes: 8,
    });
    await prisma.diagnosis.create({
      data: { visitId: visitForDx, practitionerId, icdCode: icd.code, text: icd.title },
    });
    await prisma.diagnosis.create({
      data: { visitId: visitForDx, practitionerId, icdCode: icd.code, text: icd.title },
    });
    await prisma.diagnosis.create({
      data: { visitId: visitForDx, practitionerId: null, text: 'unattributed free text case' },
    });

    // Revenue — one OPD-department invoice, one laboratory-department invoice, each paid,
    // each tied to its own visit so byDepartment has something real to bucket by.
    const opdRevenueVisitId = await stageVisit({
      departmentId: deptId,
      practitionerId: null,
      createdBy: recepAId,
      status: 'completed',
      startedAt: new Date(),
      waitMinutes: 1,
    });
    const labRevenueVisitId = await stageVisit({
      departmentId: labDeptId,
      practitionerId: null,
      createdBy: recepAId,
      status: 'completed',
      startedAt: new Date(),
      waitMinutes: 1,
    });

    const recInvoice = await prisma.invoice.create({
      data: {
        facilityId,
        patientId,
        visitId: opdRevenueVisitId,
        invoiceNo: `${PREFIX}INV1`,
        subtotal: '500',
        discount: '0',
        total: '500',
        paidAmount: '500',
        status: 'paid',
        items: { create: [{ refType: 'service', description: 'Consult', quantity: 1, unitPrice: '500', total: '500', isPaid: true }] },
      },
    });
    await prisma.payment.create({
      data: { invoiceId: recInvoice.id, amount: '500', method: 'cash', receiptNo: `${PREFIX}R1`, receivedBy: recepAId },
    });

    const labInvoice = await prisma.invoice.create({
      data: {
        facilityId,
        patientId,
        visitId: labRevenueVisitId,
        invoiceNo: `${PREFIX}INV2`,
        subtotal: '150',
        discount: '0',
        total: '150',
        paidAmount: '150',
        status: 'paid',
        items: { create: [{ refType: 'lab_order_item', description: 'CBC', quantity: 1, unitPrice: '150', total: '150', isPaid: true }] },
      },
    });
    await prisma.payment.create({
      data: { invoiceId: labInvoice.id, amount: '150', method: 'card', receiptNo: `${PREFIX}R2`, receivedBy: recepAId },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  const get = (path: string, as: string) =>
    request(server).get(path).set('Authorization', `Bearer ${tokens[as]}`);

  describe('census + wait times — report.operational, R8-scoped for reception', () => {
    it('admin sees every registration, from every desk', async () => {
      const body = (await get('/reports/census', 'admin').expect(200)).body as CensusReportResponse;
      expect(body.scope).toBe('facility');
      expect(body.totals.visitCount).toBeGreaterThanOrEqual(4);
    });

    it('R8: receptionist A sees only her own registrations, never receptionist B’s', async () => {
      const body = (await get('/reports/census', 'recepA').expect(200)).body as CensusReportResponse;
      expect(body.scope).toBe('own');
      expect(body.rows.every((r) => r.departmentId !== dept2Id)).toBe(true);
      const facilityWide = (await get('/reports/census', 'admin').expect(200))
        .body as CensusReportResponse;
      expect(body.totals.visitCount).toBeLessThan(facilityWide.totals.visitCount);
    });

    it('wait times report a per-department, per-doctor average', async () => {
      const body = (await get('/reports/wait-times', 'admin').expect(200))
        .body as WaitTimeReportResponse;
      const row = body.rows.find((r) => r.practitionerId === practitionerId);
      expect(row).toBeDefined();
      expect(row!.avgWaitMinutes).not.toBeNull();
      expect(row!.medianWaitMinutes).not.toBeNull();
    });

    it('departmentId narrows census to that department only', async () => {
      const body = (await get(`/reports/census?departmentId=${deptId}`, 'admin').expect(200))
        .body as CensusReportResponse;
      expect(body.rows.every((r) => r.departmentId === deptId)).toBe(true);
      expect(body.rows.length).toBeGreaterThan(0);
    });

    it('practitionerId narrows wait times to that doctor only', async () => {
      const body = (
        await get(`/reports/wait-times?practitionerId=${practitionerId}`, 'admin').expect(200)
      ).body as WaitTimeReportResponse;
      expect(body.rows.every((r) => r.practitionerId === practitionerId)).toBe(true);
      expect(body.rows.length).toBeGreaterThan(0);

      const otherDoctor = await get(
        `/reports/wait-times?practitionerId=00000000-0000-0000-0000-000000000000`,
        'admin',
      ).expect(200);
      expect((otherDoctor.body as WaitTimeReportResponse).rows).toHaveLength(0);
    });

    it('denies a doctor, a lab tech and a pharmacist — report.operational is not theirs', async () => {
      await get('/reports/census', 'doctor').expect(403);
      await get('/reports/wait-times', 'lab').expect(403);
      await get('/reports/census', 'pharmacist').expect(403);
    });
  });

  describe('revenue — report.financial, admin/management only', () => {
    it('sums payments by day, department and method', async () => {
      const body = (await get('/reports/revenue', 'admin').expect(200))
        .body as RevenueReportResponse;
      // Department, not till-origin: an invoice tied to an OPD visit lands in 'opd', one
      // tied to a laboratory visit lands in 'laboratory' — never a generic 'reception'/'lab'
      // split that doesn't correspond to a real department.
      const byDepartment = Object.fromEntries(
        body.byDepartment.map((d) => [d.type ?? 'other', d.total]),
      );
      expect(byDepartment.opd).toBe('500.00');
      expect(byDepartment.laboratory).toBe('150.00');
      expect(byDepartment.other).toBeUndefined();
      const byMethod = Object.fromEntries(body.byMethod.map((m) => [m.method, m.total]));
      expect(byMethod.cash).toBe('500.00');
      expect(byMethod.card).toBe('150.00');
      expect(body.grandTotal).toBe('650.00');
    });

    it('denies a receptionist and a pharmacist — money oversight is not the till', async () => {
      await get('/reports/revenue', 'recepA').expect(403);
      await get('/reports/revenue', 'pharmacist').expect(403);
    });
  });

  describe('diagnosis counts — report.clinical_aggregate, a doctor sees only their own', () => {
    it('admin/management see the facility total, coded rows collapsed by ICD code', async () => {
      const body = (await get('/reports/diagnoses', 'management').expect(200))
        .body as DiagnosisReportResponse;
      expect(body.scope).toBe('facility');
      const coded = body.rows.find((r) => r.icdCode === `${PREFIX}F32.1`);
      expect(coded?.count).toBe(2);
    });

    it('a doctor’s own tab is scoped to their practitioner id', async () => {
      const body = (await get('/reports/diagnoses', 'doctor').expect(200))
        .body as DiagnosisReportResponse;
      expect(body.scope).toBe('own');
      const coded = body.rows.find((r) => r.icdCode === `${PREFIX}F32.1`);
      expect(coded?.count).toBe(2);
      // The unattributed free-text row (no practitionerId) is not this doctor's to see.
      expect(body.rows.some((r) => r.label === 'unattributed free text case')).toBe(false);
    });

    it('denies a receptionist — counts with no names is still not the front desk’s to see', () =>
      get('/reports/diagnoses', 'recepA').expect(403));

    it('admin can filter the facility view down to one practitioner or department', async () => {
      const byDoctor = (
        await get(`/reports/diagnoses?practitionerId=${practitionerId}`, 'admin').expect(200)
      ).body as DiagnosisReportResponse;
      expect(byDoctor.scope).toBe('facility'); // a chosen filter, not a forced scope
      expect(byDoctor.rows.find((r) => r.icdCode === `${PREFIX}F32.1`)?.count).toBe(2);

      const byDept2 = (
        await get(`/reports/diagnoses?departmentId=${dept2Id}`, 'admin').expect(200)
      ).body as DiagnosisReportResponse;
      expect(byDept2.rows.some((r) => r.icdCode === `${PREFIX}F32.1`)).toBe(false);
    });
  });

  describe('audit log — audit_log.read, admin/management only', () => {
    it('lists rows for the facility, newest first, filterable by user', async () => {
      const body = (await get('/reports/audit-log', 'admin').expect(200)).body as AuditLogResponse;
      expect(body.total).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(body.rows)).toBe(true);
    });

    it('denies a doctor — audit oversight is management’s and admin’s alone', () =>
      get('/reports/audit-log', 'doctor').expect(403));
  });

  describe('patient export — data.export, R11: admin only, reason required, audited', () => {
    it('refuses without a reason', async () => {
      await get('/reports/patient-export', 'admin').expect(400);
    });

    it('returns the register and leaves its own audit row, reason and count included', async () => {
      const body = (
        await get('/reports/patient-export?reason=Ministry%20inspection%20request', 'admin').expect(
          200,
        )
      ).body as PatientExportResponse;
      expect(body.count).toBeGreaterThanOrEqual(1);
      expect(body.rows.some((r) => r.mrn === `${PREFIX}MRN1`)).toBe(true);

      const row = await prisma.auditLog.findFirst({
        where: { facilityId, action: 'export', entity: 'Patient' },
        orderBy: { createdAt: 'desc' },
      });
      expect(row).not.toBeNull();
      expect((row!.after as { reason?: string })?.reason).toBe('Ministry inspection request');
    });

    it('denies management — R11 is admin only, not every oversight role', () =>
      get('/reports/patient-export?reason=trying%20anyway', 'management').expect(403));
  });
});
