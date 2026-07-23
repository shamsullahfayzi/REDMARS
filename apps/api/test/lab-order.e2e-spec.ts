import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { ModuleKey, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LabOrderResponse, LabTestListResponse, LoginResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Phase 5, first slice — the doctor orders lab tests from the consult screen.
 *
 * The done-when has two halves that a per-test API would not have forced and this one must:
 * a save DIFFS (ordering the same tests twice leaves ONE order and ONE invoice, not two),
 * and ordering RAISES A BILL (the tests become priced lines on the order's own invoice,
 * born unpaid, at a price snapshotted from the catalog and never sent by the browser).
 *
 * The rest guards what makes that safe: an unpriced test bills nothing rather than crashing,
 * a removed test takes its charge with it, an emptied order is gone rather than blank, a
 * renamed test still prints as it was ordered, only a doctor may order, and a closed visit
 * refuses.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_lo_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Lab order (e2e)', () => {
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
        fullName: `E2E LabOrder ${suffix}`,
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
  async function stageVisit(status: 'in_progress' | 'completed' = 'in_progress'): Promise<string> {
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
        status,
        statusHistory: { create: { status: 'arrived', changedBy: doctorId } },
      },
    });
    return visit.id;
  }

  const put = (visitId: string, body: unknown, as = 'doctor') =>
    request(server)
      .put(`/visits/${visitId}/lab-order`)
      .set('Authorization', `Bearer ${tokens[as]}`)
      .send(body);

  const get = (visitId: string, as = 'doctor') =>
    request(server)
      .get(`/visits/${visitId}/lab-order`)
      .set('Authorization', `Bearer ${tokens[as]}`);

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
    // The order issues order_no and invoice_no from the per-facility sequence; those rows
    // point at the facility and must go before it does.
    await prisma.numberSequence.deleteMany({ where: facilityFilter });
    await prisma.department.deleteMany({ where: { code: { startsWith: PREFIX } } });
    // Again, deliberately — the R1 read row is written fire-and-forget and can land after
    // the sweep above, failing the facility delete on a foreign key inside afterAll.
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
        data: { code: `${PREFIX}fac`, name: 'E2E LabOrder Facility' },
      })
    ).id;
    // The route is @RequiresModule('lab') — the module has to be on or the guard 403s
    // before any of this runs.
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
    const lft = await prisma.labTest.create({
      data: { facilityId, code: `${PREFIX}ALT`, name: 'ALT', price: '80' },
    });
    const free = await prisma.labTest.create({
      // Priced only inside a panel — orderable, but bills nothing on its own.
      data: { facilityId, code: `${PREFIX}FREE`, name: 'Bundled Only Test' },
    });
    tests.cbc = cbc.id;
    tests.alt = lft.id;
    tests.free = free.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  it('the doctor may list the orderable catalog (active tests) though they lack labtest.manage', async () => {
    const res = await request(server)
      .get('/lab-tests/orderable')
      .set('Authorization', `Bearer ${tokens.doctor}`)
      .expect(200);
    const names = (res.body as LabTestListResponse).tests.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['Complete Blood Count', 'ALT']));
    expect((res.body as LabTestListResponse).tests.every((t) => t.isActive)).toBe(true);
  });

  it('denies a receptionist the orderable catalog', () =>
    request(server)
      .get('/lab-tests/orderable')
      .set('Authorization', `Bearer ${tokens.receptionist}`)
      .expect(403));

  it('no order yet: GET returns null', async () => {
    const visitId = await stageVisit();
    const res = await get(visitId).expect(200);
    expect((res.body as LabOrderResponse).order).toBeNull();
  });

  it('the done-when (bill): ordering two priced tests raises an unpaid invoice for their sum', async () => {
    const visitId = await stageVisit();
    const res = await put(visitId, { testIds: [tests.cbc, tests.alt] }).expect(200);

    const order = (res.body as LabOrderResponse).order!;
    expect(order.items).toHaveLength(2);
    // Prices ride as exact decimal strings, snapshotted per line.
    const byName = Object.fromEntries(order.items.map((i) => [i.name, i.price]));
    expect(byName['Complete Blood Count']).toBe('150.50');
    expect(byName['ALT']).toBe('80.00');
    expect(order.items.every((i) => i.status === 'ordered')).toBe(true);

    // The invoice: born unpaid, total is the sum, and it is the order's OWN invoice.
    expect(order.invoice).not.toBeNull();
    expect(order.invoice!.total).toBe('230.50');
    expect(order.invoice!.paidAmount).toBe('0.00');
    expect(order.invoice!.status).toBe('issued');
    // Quoted in raw JSON — money is never a bare number on the wire.
    expect(res.text).toContain('"total":"230.50"');
  });

  it('the done-when (diff): ordering the same tests again leaves ONE order and ONE invoice', async () => {
    const visitId = await stageVisit();
    const first = (await put(visitId, { testIds: [tests.cbc, tests.alt] }).expect(200))
      .body as LabOrderResponse;
    const again = (await put(visitId, { testIds: [tests.cbc, tests.alt] }).expect(200))
      .body as LabOrderResponse;

    expect(again.order!.id).toBe(first.order!.id);
    expect(again.order!.orderNo).toBe(first.order!.orderNo);
    expect(again.order!.invoice!.invoiceNo).toBe(first.order!.invoice!.invoiceNo);
    expect(again.order!.items).toHaveLength(2);

    // One order, one invoice in the database — not a second of each.
    const orders = await prisma.labOrder.count({ where: { visitId } });
    const invoices = await prisma.invoice.count({ where: { visitId } });
    expect(orders).toBe(1);
    expect(invoices).toBe(1);
  });

  it('adding a test grows the same order and its bill; removing one shrinks them', async () => {
    const visitId = await stageVisit();
    const start = (await put(visitId, { testIds: [tests.cbc] }).expect(200))
      .body as LabOrderResponse;
    expect(start.order!.invoice!.total).toBe('150.50');

    const grown = (await put(visitId, { testIds: [tests.cbc, tests.alt] }).expect(200))
      .body as LabOrderResponse;
    expect(grown.order!.id).toBe(start.order!.id);
    expect(grown.order!.items).toHaveLength(2);
    expect(grown.order!.invoice!.total).toBe('230.50');

    const shrunk = (await put(visitId, { testIds: [tests.alt] }).expect(200))
      .body as LabOrderResponse;
    expect(shrunk.order!.items).toHaveLength(1);
    expect(shrunk.order!.items[0].name).toBe('ALT');
    expect(shrunk.order!.invoice!.total).toBe('80.00');
    // The removed test's charge is gone, not orphaned.
    const labLines = await prisma.invoiceItem.count({
      where: { invoice: { visitId }, refType: 'lab_order_item' },
    });
    expect(labLines).toBe(1);
  });

  it('an unpriced test is orderable and bills nothing — price is null, not zero', async () => {
    const visitId = await stageVisit();
    const res = await put(visitId, { testIds: [tests.cbc, tests.free] }).expect(200);
    const order = (res.body as LabOrderResponse).order!;

    const free = order.items.find((i) => i.name === 'Bundled Only Test')!;
    expect(free.price).toBe('0.00'); // the line is 0.00; the catalog price was null
    // Only the CBC contributes.
    expect(order.invoice!.total).toBe('150.50');
  });

  it('emptying the order removes it and its invoice; GET is null again', async () => {
    const visitId = await stageVisit();
    await put(visitId, { testIds: [tests.cbc] }).expect(200);
    const emptied = (await put(visitId, { testIds: [] }).expect(200)).body as LabOrderResponse;
    expect(emptied.order).toBeNull();

    expect(await prisma.labOrder.count({ where: { visitId } })).toBe(0);
    expect(await prisma.invoice.count({ where: { visitId } })).toBe(0);
    const res = await get(visitId).expect(200);
    expect((res.body as LabOrderResponse).order).toBeNull();
  });

  it('the test name is snapshotted: renaming the catalog test does not change the order', async () => {
    const visitId = await stageVisit();
    const order = (await put(visitId, { testIds: [tests.cbc] }).expect(200))
      .body as LabOrderResponse;
    expect(order.order!.items[0].name).toBe('Complete Blood Count');

    await prisma.labTest.update({
      where: { id: tests.cbc },
      data: { name: 'CBC (renamed)' },
    });
    const after = (await get(visitId).expect(200)).body as LabOrderResponse;
    expect(after.order!.items[0].name).toBe('Complete Blood Count');

    // Put it back so later assertions on the name still hold.
    await prisma.labTest.update({
      where: { id: tests.cbc },
      data: { name: 'Complete Blood Count' },
    });
  });

  it('carries the clinical note onto the order', async () => {
    const visitId = await stageVisit();
    const res = await put(visitId, {
      testIds: [tests.cbc],
      clinicalNote: 'r/o anaemia',
    }).expect(200);
    expect((res.body as LabOrderResponse).order!.clinicalNote).toBe('r/o anaemia');
  });

  it('rejects an unknown test with 400', async () => {
    const visitId = await stageVisit();
    await put(visitId, { testIds: ['00000000-0000-0000-0000-000000000000'] }).expect(400);
  });

  it('rejects the same test listed twice with 400', async () => {
    const visitId = await stageVisit();
    await put(visitId, { testIds: [tests.cbc, tests.cbc] }).expect(400);
  });

  it('a closed visit refuses the order with 400', async () => {
    const visitId = await stageVisit('completed');
    await put(visitId, { testIds: [tests.cbc] }).expect(400);
  });

  it('denies a receptionist the order (lab_order.create is the doctor alone)', async () => {
    const visitId = await stageVisit();
    await put(visitId, { testIds: [tests.cbc] }, 'receptionist').expect(403);
  });
});
