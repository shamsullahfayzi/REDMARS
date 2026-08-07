import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { CollectionsListResponse, LoginResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * The collections worklist (e2e) — task 6b.7.
 *
 * The done-when: "Reception finds an unpaid bill without opening the patient." An unpaid lab
 * bill and an unpaid pharmacy bill both show up here, sorted newest first, each carrying
 * what it still owes; a bill reception itself raised (origin 'reception'), a bill already
 * settled in full, a cancelled bill, and one still a draft are all absent — the point of the
 * list is a worklist of money actually left to collect, not every invoice that ever existed.
 * Same `invoice.read` gate as the register (6.1): receptionist in, doctor out.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_coll_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Collections worklist (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let patientId: string;
  const tokens: Record<string, string> = {};

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Collections ${suffix}`,
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
    await prisma.patient.deleteMany({ where: facilityFilter });
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.facility.deleteMany({ where: { code: { startsWith: PREFIX } } });
  }

  let counter = 0;
  /** One invoice, shaped by the fields a test actually cares about. */
  async function stageInvoice(overrides: {
    status: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'cancelled';
    refType: 'service' | 'lab_order_item' | 'prescription_item';
    total: string;
    paidAmount: string;
    createdAt?: Date;
  }): Promise<string> {
    counter += 1;
    const invoice = await prisma.invoice.create({
      data: {
        facilityId,
        patientId,
        invoiceNo: `${PREFIX}INV${counter}`,
        subtotal: overrides.total,
        discount: '0',
        total: overrides.total,
        paidAmount: overrides.paidAmount,
        status: overrides.status,
        ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
        items: {
          create: [
            {
              refType: overrides.refType,
              description: `E2E ${overrides.refType} line`,
              quantity: 1,
              unitPrice: overrides.total,
              total: overrides.total,
              isPaid: overrides.paidAmount === overrides.total,
            },
          ],
        },
      },
    });
    return invoice.id;
  }

  const list = (as = 'recep', query = '') =>
    request(server).get(`/collections${query}`).set('Authorization', `Bearer ${tokens[as]}`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    await cleanup();

    facilityId = (
      await prisma.facility.create({ data: { code: `${PREFIX}fac`, name: 'E2E Collections Facility' } })
    ).id;

    await seedActor('recep', 'receptionist');
    await seedActor('doctor', 'doctor');
    await seedActor('pharmacist', 'pharmacist');

    const patient = await prisma.patient.create({
      data: {
        facilityId,
        mrn: `${PREFIX}MRN1`,
        firstName: 'Zarghona',
        gender: 'female',
        estimatedAgeYears: 28,
        ageRecordedAt: new Date(),
      },
    });
    patientId = patient.id;

    await stageInvoice({ status: 'issued', refType: 'lab_order_item', total: '400', paidAmount: '0' });
    await stageInvoice({
      status: 'partially_paid',
      refType: 'prescription_item',
      total: '600',
      paidAmount: '200',
    });
    // Absent from the list — each for a different reason.
    await stageInvoice({ status: 'paid', refType: 'lab_order_item', total: '300', paidAmount: '300' }); // settled
    await stageInvoice({ status: 'cancelled', refType: 'lab_order_item', total: '150', paidAmount: '0' }); // void
    await stageInvoice({ status: 'draft', refType: 'prescription_item', total: '250', paidAmount: '0' }); // not raised yet
    await stageInvoice({ status: 'issued', refType: 'service', total: '100', paidAmount: '0' }); // reception's own till
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  it('the done-when: an unpaid lab bill and an unpaid pharmacy bill both show up, owing what they owe', async () => {
    const body = (await list().expect(200)).body as CollectionsListResponse;
    const byOrigin = Object.fromEntries(body.bills.map((b) => [b.origin, b]));

    expect(byOrigin.lab).toBeDefined();
    expect(byOrigin.lab.outstanding).toBe('400.00');
    expect(byOrigin.lab.status).toBe('issued');

    expect(byOrigin.pharmacy).toBeDefined();
    expect(byOrigin.pharmacy.outstanding).toBe('400.00'); // 600 total - 200 paid
    expect(byOrigin.pharmacy.status).toBe('partially_paid');
  });

  it('leaves out a settled bill, a cancelled bill, a draft, and reception\'s own till', async () => {
    const body = (await list().expect(200)).body as CollectionsListResponse;
    expect(body.bills).toHaveLength(2);
    expect(body.bills.every((b) => b.origin === 'lab' || b.origin === 'pharmacy')).toBe(true);
    expect(body.bills.some((b) => b.status === 'paid')).toBe(false);
    expect(body.bills.some((b) => b.status === 'cancelled')).toBe(false);
    expect(body.bills.some((b) => b.status === 'draft')).toBe(false);
    expect(body.bills.some((b) => b.origin === 'reception')).toBe(false);
  });

  it('denies a doctor — invoice.read is not theirs', () => list('doctor').expect(403));

  it('R12: a pharmacist sees the pharmacy bill but not the lab one', async () => {
    const body = (await list('pharmacist').expect(200)).body as CollectionsListResponse;
    expect(body.bills.some((b) => b.origin === 'pharmacy')).toBe(true);
    expect(body.bills.some((b) => b.origin === 'lab')).toBe(false);
  });

  /**
   * A bill that has been sitting unpaid for a while is a MORE urgent reason to be on this
   * worklist, not a reason to be hidden — so unlike Reports and Invoices, this list gets no
   * default date window. `from`/`to`, when given, only narrow it.
   */
  it('shows an old unpaid bill with no date filter, and total/page/limit are always present', async () => {
    const body = (await list().expect(200)).body as CollectionsListResponse;
    expect(body.bills).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(50);
  });

  it('narrows by from/to without hiding anything when the range is not given', async () => {
    const farPast = new Date('2020-01-01T00:00:00Z');
    const staleId = await stageInvoice({
      status: 'issued',
      refType: 'lab_order_item',
      total: '999',
      paidAmount: '0',
      createdAt: farPast,
    });

    const unfiltered = (await list().expect(200)).body as CollectionsListResponse;
    expect(unfiltered.bills.some((b) => b.id === staleId)).toBe(true);

    const narrowed = (await list('recep', '?from=2026-01-01').expect(200))
      .body as CollectionsListResponse;
    expect(narrowed.bills.some((b) => b.id === staleId)).toBe(false);

    await prisma.invoice.delete({ where: { id: staleId } });
  });

  it('searches by patient name, MRN or invoice number, same as the register', async () => {
    const byName = (await list('recep', '?q=Zarghona').expect(200)).body as CollectionsListResponse;
    expect(byName.bills.length).toBeGreaterThan(0);

    const byNothing = (await list('recep', '?q=no-such-patient-xyz').expect(200))
      .body as CollectionsListResponse;
    expect(byNothing.bills).toHaveLength(0);
    expect(byNothing.total).toBe(0);
  });

  it('paginates the result, newest first', async () => {
    const page1 = (await list('recep', '?limit=1&page=1').expect(200))
      .body as CollectionsListResponse;
    expect(page1.bills).toHaveLength(1);
    expect(page1.total).toBe(2);
    expect(page1.limit).toBe(1);

    const page2 = (await list('recep', '?limit=1&page=2').expect(200))
      .body as CollectionsListResponse;
    expect(page2.bills).toHaveLength(1);
    expect(page2.bills[0].id).not.toBe(page1.bills[0].id);
  });
});
