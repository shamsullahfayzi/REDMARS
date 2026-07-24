import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse, TillReportResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Daily till reconciliation (e2e) — task 6.12.
 *
 * The done-when: reception and pharmacy tills balance at closing. Each operator sees their
 * OWN drawer (payment.receive); an admin sees every till (report.financial). A refund is a
 * negative row, so a till's cash is the signed sum. Yesterday's money is not today's.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_till_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Till reconciliation (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let recepId: string;
  let pharmId: string;
  const tokens: Record<string, string> = {};

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Till ${suffix}`,
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

  async function seedInvoice(no: string): Promise<string> {
    const patient = await prisma.patient.create({
      data: {
        facilityId,
        mrn: `${PREFIX}${no}`,
        firstName: 'P',
        gender: 'male',
        estimatedAgeYears: 30,
        ageRecordedAt: new Date(),
      },
    });
    const invoice = await prisma.invoice.create({
      data: {
        facilityId,
        patientId: patient.id,
        invoiceNo: `${PREFIX}${no}`,
        subtotal: '0',
        total: '0',
        paidAmount: '0',
        status: 'issued',
      },
    });
    return invoice.id;
  }

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.payment.deleteMany({ where: { invoice: facilityFilter } });
    await prisma.invoiceItem.deleteMany({ where: { invoice: facilityFilter } });
    await prisma.invoice.deleteMany({ where: facilityFilter });
    await prisma.patient.deleteMany({ where: facilityFilter });
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
        data: { code: `${PREFIX}fac`, name: 'E2E Till Facility', phone: '0700000000' },
      })
    ).id;

    recepId = await seedActor('recep', 'receptionist');
    pharmId = await seedActor('pharm', 'pharmacist');
    await seedActor('admin', 'admin');
    await seedActor('doctor', 'doctor');

    const opdInvoice = await seedInvoice('OPD');
    const rxInvoice = await seedInvoice('RX');
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    const yesterday = new Date(noon.getTime() - 24 * 3600 * 1000);

    // Reception till today: 300 cash + 200 card.
    await prisma.payment.createMany({
      data: [
        { invoiceId: opdInvoice, amount: '300', method: 'cash', receivedBy: recepId, receivedAt: noon },
        { invoiceId: opdInvoice, amount: '200', method: 'card', receivedBy: recepId, receivedAt: noon },
        // Yesterday's cash — must not count in today's drawer.
        { invoiceId: opdInvoice, amount: '999', method: 'cash', receivedBy: recepId, receivedAt: yesterday },
      ],
    });

    // Pharmacy till today: 500 cash, then 100 refunded (a negative row).
    await prisma.payment.createMany({
      data: [
        { invoiceId: rxInvoice, amount: '500', method: 'cash', receivedBy: pharmId, receivedAt: noon },
        { invoiceId: rxInvoice, amount: '-100', method: 'cash', receivedBy: pharmId, receivedAt: noon },
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  const mine = (as: string) =>
    request(server).get('/reports/till/mine').set('Authorization', `Bearer ${tokens[as]}`);
  const all = (as: string, qs = '') =>
    request(server).get(`/reports/till${qs}`).set('Authorization', `Bearer ${tokens[as]}`);

  it('the done-when: an operator reconciles their own drawer, cash and all', async () => {
    const body = (await mine('recep').expect(200)).body as TillReportResponse;
    expect(body.tills).toHaveLength(1);
    const till = body.tills[0];
    expect(till.userId).toBe(recepId);
    expect(till.cashTotal).toBe('300.00'); // yesterday's 999 excluded
    expect(till.total).toBe('500.00'); // 300 cash + 200 card
    expect(till.paymentCount).toBe(2);
    expect(till.refundCount).toBe(0);
    const cash = till.byMethod.find((m) => m.method === 'cash');
    expect(cash?.amount).toBe('300.00');
  });

  it('the pharmacy till is the signed sum — a refund lowers the drawer', async () => {
    const body = (await all('admin').expect(200)).body as TillReportResponse;
    const pharm = body.tills.find((t) => t.userId === pharmId);
    expect(pharm).toBeDefined();
    expect(pharm!.cashTotal).toBe('400.00'); // 500 − 100
    expect(pharm!.paymentCount).toBe(1);
    expect(pharm!.refundCount).toBe(1);

    // Every till at once, with a facility-wide total.
    expect(body.tills.length).toBeGreaterThanOrEqual(2);
    expect(body.cashTotal).toBe('700.00'); // reception 300 + pharmacy 400
    expect(body.grandTotal).toBe('900.00'); // reception 500 + pharmacy 400
  });

  it('an operator cannot see every till, only their own', async () => {
    await all('recep').expect(403);
  });

  it('denies a doctor — no drawer to close', async () => {
    await mine('doctor').expect(403);
    await all('doctor').expect(403);
  });
});
