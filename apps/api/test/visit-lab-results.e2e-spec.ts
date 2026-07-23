import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { ModuleKey, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse, VisitLabResultsResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Results flowing back to the doctor (e2e) — the loop closing.
 *
 * The done-when: the doctor reads the visit's lab tests and sees a VERIFIED result's value,
 * flag and normal band, while a test not yet verified shows only where it is in the pipeline —
 * because a doctor acting on an unverified number is the mistake verification exists to
 * prevent. Cancelled tests are gone. Only holders of lab_result.read get in (doctor yes;
 * receptionist no).
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_vlr_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Visit lab results / doctor read-back (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let doctorId: string;
  let opdId: string;
  let visitId: string;
  const tokens: Record<string, string> = {};

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E VisitLabResults ${suffix}`,
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

  const get = (as = 'doctor', vid = visitId) =>
    request(server).get(`/visits/${vid}/lab-results`).set('Authorization', `Bearer ${tokens[as]}`);

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.invoiceItem.deleteMany({ where: { invoice: facilityFilter } });
    await prisma.payment.deleteMany({ where: { invoice: facilityFilter } });
    await prisma.invoice.deleteMany({ where: facilityFilter });
    await prisma.labResult.deleteMany({
      where: { labOrderItem: { labOrder: { visit: facilityFilter } } },
    });
    await prisma.labOrderItem.deleteMany({ where: { labOrder: { visit: facilityFilter } } });
    await prisma.labOrder.deleteMany({ where: { visit: facilityFilter } });
    await prisma.referenceRange.deleteMany({ where: { test: { code: { startsWith: PREFIX } } } });
    await prisma.visitStatusHistory.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visit.deleteMany({ where: facilityFilter });
    await prisma.patient.deleteMany({ where: facilityFilter });
    await prisma.labTest.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.practitioner.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.facilityModule.deleteMany({ where: facilityFilter });
    await prisma.numberSequence.deleteMany({ where: facilityFilter });
    await prisma.department.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.auditLog.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.facility.deleteMany({ where: { code: { startsWith: PREFIX } } });
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
      await prisma.facility.create({ data: { code: `${PREFIX}fac`, name: 'E2E VLR Facility' } })
    ).id;
    await prisma.facilityModule.create({
      data: { facilityId, module: ModuleKey.lab, enabled: true, enabledAt: new Date() },
    });

    doctorId = await seedActor('doctor', 'doctor');
    await seedActor('receptionist', 'receptionist');

    opdId = (
      await prisma.department.create({
        data: { facilityId, code: `${PREFIX}OPD`, name: 'E2E OPD', type: 'opd' },
      })
    ).id;

    const glucose = await prisma.labTest.create({
      data: { facilityId, code: `${PREFIX}GLU`, name: 'Fasting Glucose', unit: 'mg/dL' },
    });
    await prisma.referenceRange.create({
      data: { testId: glucose.id, lowValue: '70', highValue: '110' },
    });
    const cbc = await prisma.labTest.create({
      data: { facilityId, code: `${PREFIX}CBC`, name: 'Complete Blood Count' },
    });
    const alt = await prisma.labTest.create({
      data: { facilityId, code: `${PREFIX}ALT`, name: 'ALT' },
    });
    const mp = await prisma.labTest.create({
      data: { facilityId, code: `${PREFIX}MP`, name: 'Malaria Film' },
    });

    const patient = await prisma.patient.create({
      data: {
        facilityId,
        mrn: `${PREFIX}MRN1`,
        firstName: 'Wali',
        gender: 'male',
        estimatedAgeYears: 40,
        ageRecordedAt: new Date(),
      },
    });
    const visit = await prisma.visit.create({
      data: {
        facilityId,
        patientId: patient.id,
        departmentId: opdId,
        visitNo: `${PREFIX}V1`,
        type: 'opd_consult',
        status: 'in_progress',
        statusHistory: { create: { status: 'arrived', changedBy: doctorId } },
      },
    });
    visitId = visit.id;
    const order = await prisma.labOrder.create({
      data: { facilityId, visitId: visit.id, orderNo: `${PREFIX}LAB1` },
    });

    // Verified glucose = 90 (normal, band 70–110).
    const gItem = await prisma.labOrderItem.create({
      data: {
        labOrderId: order.id,
        testId: glucose.id,
        testNameAtTime: 'Fasting Glucose',
        status: 'verified',
      },
    });
    await prisma.labResult.create({
      data: {
        labOrderItemId: gItem.id,
        valueNumeric: '90',
        unit: 'mg/dL',
        isAbnormal: false,
        enteredBy: doctorId,
        verifiedBy: doctorId,
        verifiedAt: new Date(),
      },
    });
    // Resulted-but-not-verified CBC — has a value in the DB, but must NOT be exposed.
    const cItem = await prisma.labOrderItem.create({
      data: {
        labOrderId: order.id,
        testId: cbc.id,
        testNameAtTime: 'Complete Blood Count',
        status: 'resulted',
      },
    });
    await prisma.labResult.create({
      data: { labOrderItemId: cItem.id, valueNumeric: '5', isAbnormal: false, enteredBy: doctorId },
    });
    // Ordered ALT — no result at all.
    await prisma.labOrderItem.create({
      data: { labOrderId: order.id, testId: alt.id, testNameAtTime: 'ALT', status: 'ordered' },
    });
    // Cancelled malaria film — must be excluded.
    await prisma.labOrderItem.create({
      data: {
        labOrderId: order.id,
        testId: mp.id,
        testNameAtTime: 'Malaria Film',
        status: 'cancelled',
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  it('the done-when: a verified result comes back with its value, flag and band', async () => {
    const body = (await get().expect(200)).body as VisitLabResultsResponse;
    const byName = Object.fromEntries(body.items.map((i) => [i.testName, i]));

    const glucose = byName['Fasting Glucose'];
    expect(glucose.status).toBe('verified');
    expect(glucose.value).toBe('90');
    expect(glucose.isNumeric).toBe(true);
    expect(glucose.unit).toBe('mg/dL');
    expect(glucose.flag).toBeNull(); // 90 is within 70–110
    expect(glucose.isAbnormal).toBe(false);
    expect(glucose.referenceLow).toBe('70');
    expect(glucose.referenceHigh).toBe('110');
    expect(glucose.verifiedAt).not.toBeNull();
  });

  it('an unverified result shows its status but NOT its value', async () => {
    const body = (await get().expect(200)).body as VisitLabResultsResponse;
    const cbc = body.items.find((i) => i.testName === 'Complete Blood Count')!;
    expect(cbc.status).toBe('resulted');
    expect(cbc.value).toBeNull(); // entered but not verified — withheld
    expect(cbc.verifiedAt).toBeNull();
  });

  it('an ordered test shows as pending with no value; a cancelled test is absent', async () => {
    const body = (await get().expect(200)).body as VisitLabResultsResponse;
    const names = body.items.map((i) => i.testName);
    expect(names).toContain('ALT');
    expect(names).not.toContain('Malaria Film'); // cancelled — gone
    const alt = body.items.find((i) => i.testName === 'ALT')!;
    expect(alt.status).toBe('ordered');
    expect(alt.value).toBeNull();
  });

  it('denies a receptionist — lab_result.read is not theirs', () =>
    get('receptionist').expect(403));
});
