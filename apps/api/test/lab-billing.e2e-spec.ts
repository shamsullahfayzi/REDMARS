import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { ModuleKey, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  LabChargesResponse,
  LabOrderResponse,
  LoginResponse,
  PayLabChargesResponse,
} from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Reception's lab settlement (e2e) — the desk collecting lab money ONE TEST AT A TIME.
 *
 * The done-when: a doctor's order raises unpaid charges, reception sees them, and paying for
 * ONE test of several settles only that line — which then frees exactly that test for the
 * bench to draw while the rest stay waiting at the window. That last cross-check (pay CBC →
 * the bench may collect CBC but not ALT) is the whole point of per-line settlement, and it is
 * proved end to end here. The rest guards it: an already-paid line refuses, a fully-paid order
 * drops off the desk's list, an unknown charge 400s, and only the desk's permissions get in.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_lb_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Lab billing / reception settlement (e2e)', () => {
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
        fullName: `E2E LabBilling ${suffix}`,
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
  /** Create a patient + visit and place a lab order on it as the doctor. */
  async function placeOrder(
    testIds: string[],
  ): Promise<{ patientId: string; order: NonNullable<LabOrderResponse['order']> }> {
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
    const res = await request(server)
      .put(`/visits/${visit.id}/lab-order`)
      .set('Authorization', `Bearer ${tokens.doctor}`)
      .send({ testIds })
      .expect(200);
    return { patientId: patient.id, order: (res.body as LabOrderResponse).order! };
  }

  const getCharges = (patientId: string, includePaid = false, as = 'receptionist') =>
    request(server)
      .get(`/lab-charges?patientId=${patientId}${includePaid ? '&includePaid=true' : ''}`)
      .set('Authorization', `Bearer ${tokens[as]}`);

  const pay = (itemIds: string[], as = 'receptionist') =>
    request(server)
      .post('/lab-charges/pay')
      .set('Authorization', `Bearer ${tokens[as]}`)
      .send({ itemIds, method: 'cash' });

  const collect = (itemIds: string[]) =>
    request(server)
      .post('/lab-queue/collect')
      .set('Authorization', `Bearer ${tokens.lab_tech}`)
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
        data: { code: `${PREFIX}fac`, name: 'E2E LabBilling Facility' },
      })
    ).id;
    await prisma.facilityModule.create({
      data: { facilityId, module: ModuleKey.lab, enabled: true, enabledAt: new Date() },
    });

    doctorId = await seedActor('doctor', 'doctor');
    await seedActor('receptionist', 'receptionist');
    await seedActor('lab_tech', 'lab_tech');
    await seedActor('pharmacist', 'pharmacist');

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

  it('reception sees a patient’s unpaid lab charges, per test, with the order’s outstanding', async () => {
    const { patientId, order } = await placeOrder([tests.cbc, tests.alt]);
    const res = await getCharges(patientId).expect(200);
    const body = res.body as LabChargesResponse;

    expect(body.orders).toHaveLength(1);
    const group = body.orders[0];
    expect(group.orderNo).toBe(order.orderNo);
    expect(group.items).toHaveLength(2);
    expect(group.items.every((i) => i.isPaid === false)).toBe(true);
    expect(group.outstanding).toBe('230.50');
    const byName = Object.fromEntries(group.items.map((i) => [i.testName, i]));
    expect(byName['Complete Blood Count'].price).toBe('150.50');
  });

  it('the done-when: paying ONE test settles only its line, and frees only that test for the bench', async () => {
    const { order } = await placeOrder([tests.cbc, tests.alt]);
    const cbc = order.items.find((i) => i.name === 'Complete Blood Count')!;
    const alt = order.items.find((i) => i.name === 'ALT')!;

    const payRes = await pay([cbc.id]).expect(201);
    const paid = payRes.body as PayLabChargesResponse;
    expect(paid.amount).toBe('150.50'); // server-summed, only the CBC line
    expect(paid.paidItemIds).toEqual([cbc.id]);

    // The line is paid, the invoice partially settled, and the cash trail exists.
    const cbcLine = await prisma.invoiceItem.findFirstOrThrow({ where: { refId: cbc.id } });
    expect(cbcLine.isPaid).toBe(true);
    const altLine = await prisma.invoiceItem.findFirstOrThrow({ where: { refId: alt.id } });
    expect(altLine.isPaid).toBe(false);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: cbcLine.invoiceId } });
    expect(invoice.status).toBe('partially_paid');
    expect(invoice.paidAmount.toFixed(2)).toBe('150.50');
    const payments = await prisma.payment.count({ where: { invoiceId: cbcLine.invoiceId } });
    expect(payments).toBe(1);

    // THE POINT: the bench may now draw the paid test, but not the unpaid one.
    await collect([cbc.id]).expect(201);
    const denied = await collect([alt.id]).expect(400);
    expect((denied.body as { code?: string }).code).toBe('unpaid');
  });

  it('a fully-paid order drops off the desk’s list, but shows with includePaid', async () => {
    const { patientId, order } = await placeOrder([tests.cbc, tests.alt]);
    await pay(order.items.map((i) => i.id)).expect(201);

    const hidden = (await getCharges(patientId).expect(200)).body as LabChargesResponse;
    expect(hidden.orders).toHaveLength(0);

    const shown = (await getCharges(patientId, true).expect(200)).body as LabChargesResponse;
    expect(shown.orders).toHaveLength(1);
    expect(shown.orders[0].items.every((i) => i.isPaid)).toBe(true);
    expect(shown.orders[0].outstanding).toBe('0.00');
  });

  it('an unpriced test is born paid — it never appears as an outstanding charge', async () => {
    const { patientId } = await placeOrder([tests.free]);
    const hidden = (await getCharges(patientId).expect(200)).body as LabChargesResponse;
    expect(hidden.orders).toHaveLength(0); // nothing owed
    const shown = (await getCharges(patientId, true).expect(200)).body as LabChargesResponse;
    expect(shown.orders[0].items[0].isPaid).toBe(true);
  });

  it('paying an already-paid test is refused', async () => {
    const { order } = await placeOrder([tests.cbc]);
    await pay([order.items[0].id]).expect(201);
    const again = await pay([order.items[0].id]).expect(400);
    expect((again.body as { code?: string }).code).toBe('already_paid');
  });

  it('rejects an unknown charge with 400', () =>
    pay(['00000000-0000-0000-0000-000000000000']).expect(400));

  it('only the desk’s permissions get in: a doctor may neither read nor pay', async () => {
    const { patientId, order } = await placeOrder([tests.cbc]);
    await getCharges(patientId, false, 'doctor').expect(403);
    await pay([order.items[0].id], 'doctor').expect(403);
  });

  it('a pharmacist may neither read nor pay a lab charge — R12: a lab bill is not theirs, unlike their own till', async () => {
    const { patientId, order } = await placeOrder([tests.cbc]);
    await getCharges(patientId, false, 'pharmacist').expect(403);
    await pay([order.items[0].id], 'pharmacist').expect(403);
  });
});
