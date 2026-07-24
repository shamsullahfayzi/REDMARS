import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  InvoiceDetail,
  InvoiceListResponse,
  LoginResponse,
  VisitBillsResponse,
} from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * The invoice register and reprint (e2e) — task 6.1.
 *
 * The done-when: an invoice the desk raised can be found again by number, name or day, and
 * opened back into the identical receipt — facility, patient, visit, charges and the cash
 * trail. Only holders of `invoice.read` get in (receptionist yes; doctor no), and one
 * facility never reads another's bills.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_inv_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Invoice register + reprint (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let receptionistId: string;
  let patientId: string;
  let visitId: string;
  let invoiceId: string;
  let invoiceNo: string;
  const tokens: Record<string, string> = {};

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Invoice ${suffix}`,
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
    await prisma.visitStatusHistory.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visit.deleteMany({ where: facilityFilter });
    await prisma.patient.deleteMany({ where: facilityFilter });
    await prisma.department.deleteMany({ where: { code: { startsWith: PREFIX } } });
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
        data: { code: `${PREFIX}fac`, name: 'E2E Invoice Facility', phone: '0700000000' },
      })
    ).id;

    receptionistId = await seedActor('recep', 'receptionist');
    await seedActor('doctor', 'doctor');

    const dept = await prisma.department.create({
      data: { facilityId, code: `${PREFIX}OPD`, name: 'E2E OPD', type: 'opd' },
    });

    const patient = await prisma.patient.create({
      data: {
        facilityId,
        mrn: `${PREFIX}MRN1`,
        prefix: 'Mr.',
        firstName: 'Karim',
        lastName: 'Noori',
        gender: 'male',
        estimatedAgeYears: 30,
        ageRecordedAt: new Date(),
        phone: '0788112233',
      },
    });
    patientId = patient.id;

    const visit = await prisma.visit.create({
      data: {
        facilityId,
        patientId: patient.id,
        departmentId: dept.id,
        visitNo: `${PREFIX}V1`,
        type: 'opd_consult',
        status: 'completed',
        statusHistory: { create: { status: 'arrived', changedBy: receptionistId } },
      },
    });

    visitId = visit.id;
    invoiceNo = `${PREFIX}INV1`;
    const invoice = await prisma.invoice.create({
      data: {
        facilityId,
        patientId: patient.id,
        visitId: visit.id,
        createdBy: receptionistId,
        invoiceNo,
        subtotal: '500',
        discount: '0',
        total: '500',
        paidAmount: '500',
        status: 'paid',
        items: {
          create: [
            {
              refType: 'service',
              description: 'OPD Consultation',
              quantity: 1,
              unitPrice: '300',
              total: '300',
              isPaid: true,
              paidAt: new Date(),
            },
            {
              refType: 'service',
              description: 'Registration card',
              quantity: 1,
              unitPrice: '200',
              total: '200',
              isPaid: true,
              paidAt: new Date(),
            },
          ],
        },
        payments: {
          create: { amount: '500', method: 'cash', receivedBy: receptionistId },
        },
      },
    });
    invoiceId = invoice.id;

    // A SECOND bill on the SAME visit, raised at the lab till and still unpaid — so the
    // visit carries two bills across two windows (task 6.2).
    await prisma.invoice.create({
      data: {
        facilityId,
        patientId: patient.id,
        visitId: visit.id,
        createdBy: receptionistId,
        invoiceNo: `${PREFIX}INV1L`,
        subtotal: '250',
        total: '250',
        paidAmount: '0',
        status: 'issued',
        items: {
          create: {
            refType: 'lab_order_item',
            description: 'CBC',
            quantity: 1,
            unitPrice: '250',
            total: '250',
          },
        },
      },
    });

    // A second facility's invoice, to prove the register is facility-scoped.
    const otherFacilityId = (
      await prisma.facility.create({ data: { code: `${PREFIX}fac2`, name: 'E2E Other' } })
    ).id;
    const otherPatient = await prisma.patient.create({
      data: {
        facilityId: otherFacilityId,
        mrn: `${PREFIX}MRN2`,
        firstName: 'Other',
        gender: 'female',
        estimatedAgeYears: 25,
        ageRecordedAt: new Date(),
      },
    });
    await prisma.invoice.create({
      data: {
        facilityId: otherFacilityId,
        patientId: otherPatient.id,
        createdBy: receptionistId,
        invoiceNo: `${PREFIX}INV2`,
        subtotal: '100',
        total: '100',
        paidAmount: '0',
        status: 'issued',
        items: { create: { refType: 'service', description: 'X', quantity: 1, unitPrice: '100', total: '100' } },
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  const list = (as: string, qs = '') =>
    request(server).get(`/invoices${qs}`).set('Authorization', `Bearer ${tokens[as]}`);
  const detail = (as: string, id: string) =>
    request(server).get(`/invoices/${id}`).set('Authorization', `Bearer ${tokens[as]}`);
  const byVisit = (as: string, id: string) =>
    request(server).get(`/invoices/by-visit/${id}`).set('Authorization', `Bearer ${tokens[as]}`);

  it('lists a facility’s invoices, newest first, with a one-line summary', async () => {
    const body = (await list('recep').expect(200)).body as InvoiceListResponse;
    const row = body.invoices.find((i) => i.invoiceNo === invoiceNo);
    expect(row).toBeDefined();
    expect(row!.patientName).toBe('Mr. Karim Noori');
    expect(row!.patientMrn).toBe(`${PREFIX}MRN1`);
    expect(row!.total).toBe('500.00');
    expect(row!.status).toBe('paid');
    expect(row!.itemCount).toBe(2);
    expect(row!.summary).not.toBe('');
    // Never another facility's bill.
    expect(body.invoices.some((i) => i.invoiceNo === `${PREFIX}INV2`)).toBe(false);
  });

  it('finds an invoice by its number, and by the patient’s name', async () => {
    const byNo = (await list('recep', `?q=${PREFIX}INV1`).expect(200)).body as InvoiceListResponse;
    expect(byNo.invoices.map((i) => i.invoiceNo)).toContain(invoiceNo);

    const byName = (await list('recep', '?q=Noori').expect(200)).body as InvoiceListResponse;
    expect(byName.invoices.map((i) => i.invoiceNo)).toContain(invoiceNo);
  });

  it('filters by patient and by status', async () => {
    const byPatient = (await list('recep', `?patientId=${patientId}`).expect(200))
      .body as InvoiceListResponse;
    expect(byPatient.invoices.every((i) => i.patientMrn === `${PREFIX}MRN1`)).toBe(true);

    const paid = (await list('recep', '?status=paid').expect(200)).body as InvoiceListResponse;
    expect(paid.invoices.every((i) => i.status === 'paid')).toBe(true);
    const cancelled = (await list('recep', '?status=cancelled').expect(200))
      .body as InvoiceListResponse;
    expect(cancelled.invoices.some((i) => i.invoiceNo === invoiceNo)).toBe(false);
  });

  it('the done-when: opens one bill into the full reprint', async () => {
    const body = (await detail('recep', invoiceId).expect(200)).body as InvoiceDetail;
    expect(body.facility.name).toBe('E2E Invoice Facility');
    expect(body.patient.name).toBe('Mr. Karim Noori');
    expect(body.patient.ageYears).toBe(30);
    expect(body.visit).not.toBeNull();
    expect(body.visit!.visitNo).toBe(`${PREFIX}V1`);
    expect(body.invoice.invoiceNo).toBe(invoiceNo);
    expect(body.invoice.total).toBe('500.00');
    expect(body.invoice.items).toHaveLength(2);
    expect(body.invoice.paymentMethod).toBe('cash');
    expect(body.createdByName).toBe('E2E Invoice recep');
    expect(body.payments).toHaveLength(1);
    expect(body.payments[0].amount).toBe('500.00');
  });

  it('the done-when: gathers every bill one visit carries, with a running total', async () => {
    const body = (await byVisit('recep', visitId).expect(200)).body as VisitBillsResponse;
    expect(body.visit.visitNo).toBe(`${PREFIX}V1`);
    expect(body.visit.patientName).toBe('Mr. Karim Noori');
    expect(body.bills).toHaveLength(2);

    const reception = body.bills.find((b) => b.invoiceNo === invoiceNo);
    const lab = body.bills.find((b) => b.invoiceNo === `${PREFIX}INV1L`);
    // Each bill is tagged by the till that raised it, read off its lines.
    expect(reception!.origin).toBe('reception');
    expect(reception!.outstanding).toBe('0.00');
    expect(lab!.origin).toBe('lab');
    expect(lab!.outstanding).toBe('250.00');

    // Three tills, one running total: 500 charged and paid, 250 charged and open.
    expect(body.totals.billed).toBe('750.00');
    expect(body.totals.paid).toBe('500.00');
    expect(body.totals.outstanding).toBe('250.00');
    expect(body.totals.currency).toBe('AFN');
  });

  it('404s a visit belonging to another facility (or no visit at all)', async () => {
    await byVisit('recep', '00000000-0000-4000-8000-000000000000').expect(404);
  });

  it('404s an invoice belonging to another facility', async () => {
    const other = await prisma.invoice.findFirstOrThrow({
      where: { invoiceNo: `${PREFIX}INV2` },
      select: { id: true },
    });
    await detail('recep', other.id).expect(404);
  });

  it('denies a doctor — invoice.read is not theirs', async () => {
    await list('doctor').expect(403);
    await detail('doctor', invoiceId).expect(403);
    await byVisit('doctor', visitId).expect(403);
  });
});
