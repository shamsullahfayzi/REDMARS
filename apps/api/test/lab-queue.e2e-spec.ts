import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { ModuleKey, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LabOrderResponse, LabQueueResponse, LoginResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Phase 5, second slice — the lab worklist the bench reads.
 *
 * The done-when: a lab tech sees the facility's ordered tests, oldest first, one row per
 * test, with the fact that gates the next step — is this paid — on every row. The rest guards
 * what makes it usable: the default view is the active work (verified and cancelled tests
 * drop off), the status filter narrows it, the day counts say what the filter hides, payment
 * reads `paid` only when the whole bill is settled, and the read is gated on
 * `lab_order.read_queue` (the lab tech's and the desk's, not a nurse's).
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_lq_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Lab queue (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let doctorId: string;
  let opdId: string;
  const tokens: Record<string, string> = {};
  const tests: Record<string, string> = {};

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E LabQueue ${suffix}`,
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

  let counter = 0;
  async function stageVisit(): Promise<string> {
    counter += 1;
    const patient = await prisma.patient.create({
      data: {
        facilityId,
        mrn: `${PREFIX}MRN${counter}`,
        firstName: `Wali${counter}`,
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
        visitNo: `${PREFIX}V${counter}`,
        type: 'opd_consult',
        status: 'in_progress',
        statusHistory: { create: { status: 'arrived', changedBy: doctorId } },
      },
    });
    return visit.id;
  }

  const order = (visitId: string, testIds: string[]) =>
    request(server)
      .put(`/visits/${visitId}/lab-order`)
      .set('Authorization', `Bearer ${tokens.doctor}`)
      .send({ testIds });

  const queue = (as = 'lab_tech', qs = '') =>
    request(server).get(`/lab-queue${qs}`).set('Authorization', `Bearer ${tokens[as]}`);

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
      await prisma.facility.create({
        data: { code: `${PREFIX}fac`, name: 'E2E LabQueue Facility' },
      })
    ).id;
    await prisma.facilityModule.create({
      data: { facilityId, module: ModuleKey.lab, enabled: true, enabledAt: new Date() },
    });

    doctorId = await seedActor('doctor', 'doctor');
    await seedActor('lab_tech', 'lab_tech');
    await seedActor('nurse', 'nurse');

    opdId = (
      await prisma.department.create({
        data: { facilityId, code: `${PREFIX}OPD`, name: 'E2E OPD', type: 'opd' },
      })
    ).id;
    await prisma.practitioner.create({
      data: {
        facilityId,
        code: `${PREFIX}DR1`,
        firstName: 'Hafizullah',
        lastName: 'Sherzai',
        userId: doctorId,
      },
    });

    const cbc = await prisma.labTest.create({
      data: { facilityId, code: `${PREFIX}CBC`, name: 'Complete Blood Count', price: '150.50' },
    });
    const alt = await prisma.labTest.create({
      data: { facilityId, code: `${PREFIX}ALT`, name: 'ALT', price: '80' },
    });
    tests.cbc = cbc.id;
    tests.alt = alt.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  it('the done-when: a lab tech sees ordered tests on the queue, one row per test, unpaid', async () => {
    const visitId = await stageVisit();
    await order(visitId, [tests.cbc, tests.alt]).expect(200);

    const res = await queue().expect(200);
    const body = res.body as LabQueueResponse;
    const mine = body.entries.filter((e) => e.visitId === visitId);

    expect(mine).toHaveLength(2);
    const byName = Object.fromEntries(mine.map((e) => [e.testName, e]));
    expect(byName['Complete Blood Count'].status).toBe('ordered');
    expect(byName['Complete Blood Count'].price).toBe('150.50');
    expect(byName['Complete Blood Count'].code).toBe(`${PREFIX}CBC`);
    // Born unpaid: the desk has not collected yet.
    expect(mine.every((e) => e.paid === false)).toBe(true);
    expect(mine.every((e) => e.invoiceStatus === 'issued')).toBe(true);
    // Enough patient identity to say whose sample this is.
    expect(byName['ALT'].patientMrn).toBe(`${PREFIX}MRN${counter}`);
    expect(byName['ALT'].waitedMinutes).toBeGreaterThanOrEqual(0);
  });

  it('paid is PER LINE: paying one test frees it while the other stays unpaid', async () => {
    const visitId = await stageVisit();
    const placed = (await order(visitId, [tests.cbc, tests.alt]).expect(200))
      .body as LabOrderResponse;
    const cbcItem = placed.order!.items.find((i) => i.name === 'Complete Blood Count')!;

    // Born unpaid: neither line is settled.
    let mine = (await queue().expect(200)).body as LabQueueResponse;
    expect(mine.entries.filter((e) => e.visitId === visitId).every((e) => e.paid === false)).toBe(
      true,
    );

    // Settle only the CBC line — the way reception collects one test of several.
    await prisma.invoiceItem.updateMany({
      where: { refType: 'lab_order_item', refId: cbcItem.id },
      data: { isPaid: true, paidAt: new Date() },
    });
    mine = (await queue().expect(200)).body as LabQueueResponse;
    const byName = Object.fromEntries(
      mine.entries.filter((e) => e.visitId === visitId).map((e) => [e.testName, e]),
    );
    expect(byName['Complete Blood Count'].paid).toBe(true);
    expect(byName['ALT'].paid).toBe(false);
  });

  it('the default view is active work: verified and cancelled tests drop off', async () => {
    const visitId = await stageVisit();
    await order(visitId, [tests.cbc, tests.alt]).expect(200);
    const items = await prisma.labOrderItem.findMany({
      where: { labOrder: { visitId } },
      select: { id: true, testId: true },
    });
    const cbcItem = items.find((i) => i.testId === tests.cbc)!;
    const altItem = items.find((i) => i.testId === tests.alt)!;
    await prisma.labOrderItem.update({ where: { id: cbcItem.id }, data: { status: 'verified' } });
    await prisma.labOrderItem.update({
      where: { id: altItem.id },
      data: { status: 'in_progress' },
    });

    const body = (await queue().expect(200)).body as LabQueueResponse;
    const mine = body.entries.filter((e) => e.visitId === visitId);
    // Verified is done — off the worklist. The in-progress one stays.
    expect(mine).toHaveLength(1);
    expect(mine[0].status).toBe('in_progress');
  });

  it('the status filter narrows to one status', async () => {
    const body = (await queue('lab_tech', '?status=in_progress').expect(200))
      .body as LabQueueResponse;
    expect(body.entries.every((e) => e.status === 'in_progress')).toBe(true);
    expect(body.entries.length).toBeGreaterThan(0);
  });

  it('counts report every active status for the day, whatever the filter shows', async () => {
    const filtered = (await queue('lab_tech', '?status=ordered').expect(200))
      .body as LabQueueResponse;
    // The rows are only the ordered ones...
    expect(filtered.entries.every((e) => e.status === 'ordered')).toBe(true);
    // ...but the counts still see the in_progress test staged above.
    expect(filtered.counts.in_progress).toBeGreaterThanOrEqual(1);
    expect(filtered.counts.ordered).toBeGreaterThanOrEqual(1);
  });

  it('the doctor may read the queue too (they placed the order and may see where it is)', async () => {
    await queue('doctor').expect(200);
  });

  it('rejects a bad date filter with 400', () => queue('lab_tech', '?date=2026-1-1').expect(400));

  it('denies a nurse the queue (lab_order.read_queue is not theirs)', () =>
    queue('nurse').expect(403));
});
