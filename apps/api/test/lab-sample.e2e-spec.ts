import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { ModuleKey, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { CollectSampleResponse, LabOrderResponse, LoginResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Phase 5, third slice — collecting the sample.
 *
 * The done-when has two halves: a paid, still-ordered test moves ordered → sample_collected
 * (and records who took it and when), and an UNPAID test is refused — this is where "pay at
 * the window first" becomes a locked door. The rest guards it: a whole order draws together
 * or not at all, an already-drawn test is not drawn twice, an unpriced test (no charge) is
 * collectable, the bench and nurse may collect but the doctor may not, and an unknown id 400s.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_ls_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Lab sample collection (e2e)', () => {
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
        fullName: `E2E LabSample ${suffix}`,
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

  /** Place an order and return it; optionally mark its invoice fully paid. */
  async function placeOrder(testIds: string[], pay: boolean): Promise<LabOrderResponse['order']> {
    const visitId = await stageVisit();
    const res = await request(server)
      .put(`/visits/${visitId}/lab-order`)
      .set('Authorization', `Bearer ${tokens.doctor}`)
      .send({ testIds })
      .expect(200);
    const order = (res.body as LabOrderResponse).order!;
    if (pay && order.invoice) {
      await prisma.invoice.update({
        where: { id: order.invoice.id },
        data: { paidAmount: order.invoice.total, status: 'paid' },
      });
    }
    return order;
  }

  const collect = (itemIds: string[], as = 'lab_tech') =>
    request(server)
      .post('/lab-queue/collect')
      .set('Authorization', `Bearer ${tokens[as]}`)
      .send({ itemIds });

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
        data: { code: `${PREFIX}fac`, name: 'E2E LabSample Facility' },
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
    const free = await prisma.labTest.create({
      data: { facilityId, code: `${PREFIX}FREE`, name: 'Bundled Only Test' },
    });
    tests.cbc = cbc.id;
    tests.alt = alt.id;
    tests.free = free.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  it('the done-when: a paid order draws — its tests move ordered → sample_collected, stamped by/at', async () => {
    const order = await placeOrder([tests.cbc, tests.alt], true);
    const itemIds = order!.items.map((i) => i.id);

    const res = await collect(itemIds).expect(201);
    const body = res.body as CollectSampleResponse;
    expect(body.items).toHaveLength(2);
    expect(body.items.every((i) => i.status === 'sample_collected')).toBe(true);

    const rows = await prisma.labOrderItem.findMany({
      where: { id: { in: itemIds } },
      select: { status: true, sampleCollectedAt: true, sampleCollectedBy: true },
    });
    expect(rows.every((r) => r.status === 'sample_collected')).toBe(true);
    expect(rows.every((r) => r.sampleCollectedAt != null)).toBe(true);
    // Stamped with who took it.
    expect(rows.every((r) => r.sampleCollectedBy != null)).toBe(true);
  });

  it('the gate: an UNPAID test is refused with 400, and its status does not move', async () => {
    const order = await placeOrder([tests.cbc], false);
    const itemId = order!.items[0].id;

    const res = await collect([itemId]).expect(400);
    expect((res.body as { code?: string }).code).toBe('unpaid');

    const row = await prisma.labOrderItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(row.status).toBe('ordered');
  });

  it('all or nothing: one unpaid test in the batch refuses the whole draw', async () => {
    // Two separate orders, one paid and one not — collecting both at once must draw neither.
    const paid = await placeOrder([tests.cbc], true);
    const unpaid = await placeOrder([tests.alt], false);
    const ids = [paid!.items[0].id, unpaid!.items[0].id];

    await collect(ids).expect(400);
    const rows = await prisma.labOrderItem.findMany({ where: { id: { in: ids } } });
    expect(rows.every((r) => r.status === 'ordered')).toBe(true);
  });

  it('an unpriced test (no charge) is collectable — nothing to pay', async () => {
    const order = await placeOrder([tests.free], false); // no invoice raised at all
    const itemId = order!.items[0].id;
    await collect([itemId]).expect(201);
    const row = await prisma.labOrderItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(row.status).toBe('sample_collected');
  });

  it('a test already drawn is not drawn twice: 400 not_collectable', async () => {
    const order = await placeOrder([tests.cbc], true);
    const itemId = order!.items[0].id;
    await collect([itemId]).expect(201);
    // Second attempt — it is no longer `ordered`.
    const res = await collect([itemId]).expect(400);
    expect((res.body as { code?: string }).code).toBe('not_collectable');
  });

  it('rejects an unknown item id with 400', () =>
    collect(['00000000-0000-0000-0000-000000000000']).expect(400));

  it('a nurse may collect (R9), a doctor may not (lab.collect_sample is not theirs)', async () => {
    const forNurse = await placeOrder([tests.cbc], true);
    await collect([forNurse!.items[0].id], 'nurse').expect(201);

    const forDoctor = await placeOrder([tests.alt], true);
    await collect([forDoctor!.items[0].id], 'doctor').expect(403);
  });
});
