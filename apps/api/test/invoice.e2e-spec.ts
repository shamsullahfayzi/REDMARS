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
  RecordPaymentResponse,
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
  let payInvoiceId: string;
  let overInvoiceId: string;
  let discountInvoiceId: string;
  let refundGuardInvoiceId: string;
  let approvalInvoiceId: string;
  let adminId: string;
  let refundInvoiceId: string;
  let refundOldInvoiceId: string;
  let oldPaymentId: string;
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
    // Taking a payment issues a receipt number, which leaves a per-facility sequence row —
    // clear it before the facility, or its FK blocks the delete (task 6.3).
    await prisma.numberSequence.deleteMany({ where: facilityFilter });
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
    adminId = await seedActor('admin', 'admin');

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

    // Two unpaid bills with NO visit, for the payment tests — kept off the visit so the
    // 6.2 rollup (which counts bills on the visit) is not disturbed by settling them.
    payInvoiceId = (
      await prisma.invoice.create({
        data: {
          facilityId,
          patientId: patient.id,
          createdBy: receptionistId,
          invoiceNo: `${PREFIX}INVP`,
          subtotal: '400',
          total: '400',
          paidAmount: '0',
          status: 'issued',
          items: {
            create: {
              refType: 'service',
              description: 'Dressing',
              quantity: 1,
              unitPrice: '400',
              total: '400',
            },
          },
        },
      })
    ).id;

    overInvoiceId = (
      await prisma.invoice.create({
        data: {
          facilityId,
          patientId: patient.id,
          createdBy: receptionistId,
          invoiceNo: `${PREFIX}INVO`,
          subtotal: '100',
          total: '100',
          paidAmount: '0',
          status: 'issued',
          items: {
            create: {
              refType: 'service',
              description: 'Injection',
              quantity: 1,
              unitPrice: '100',
              total: '100',
            },
          },
        },
      })
    ).id;

    // A 1000 bill for the discount tests: 10% ceiling is a round 100.
    discountInvoiceId = (
      await prisma.invoice.create({
        data: {
          facilityId,
          patientId: patient.id,
          createdBy: receptionistId,
          invoiceNo: `${PREFIX}INVD`,
          subtotal: '1000',
          total: '1000',
          paidAmount: '0',
          status: 'issued',
          items: {
            create: {
              refType: 'service',
              description: 'Procedure',
              quantity: 1,
              unitPrice: '1000',
              total: '1000',
            },
          },
        },
      })
    ).id;

    // A 1000 bill for the over-ceiling approval tests (task 6.5), kept separate so its
    // state is not touched by the 6.4 discount sequence above.
    approvalInvoiceId = (
      await prisma.invoice.create({
        data: {
          facilityId,
          patientId: patient.id,
          createdBy: receptionistId,
          invoiceNo: `${PREFIX}INVA`,
          subtotal: '1000',
          total: '1000',
          paidAmount: '0',
          status: 'issued',
          items: {
            create: {
              refType: 'service',
              description: 'Operation',
              quantity: 1,
              unitPrice: '1000',
              total: '1000',
            },
          },
        },
      })
    ).id;

    // A fully-paid 500 bill, to prove a discount that would drop the total below what is
    // already paid is refused (the gap is a refund, task 6.6).
    refundGuardInvoiceId = (
      await prisma.invoice.create({
        data: {
          facilityId,
          patientId: patient.id,
          createdBy: receptionistId,
          invoiceNo: `${PREFIX}INVDR`,
          subtotal: '500',
          total: '500',
          paidAmount: '500',
          status: 'paid',
          items: {
            create: {
              refType: 'service',
              description: 'Scan',
              quantity: 1,
              unitPrice: '500',
              total: '500',
            },
          },
        },
      })
    ).id;

    // A 400 bill for the refund happy-path (paid today via the endpoint in the test).
    refundInvoiceId = (
      await prisma.invoice.create({
        data: {
          facilityId,
          patientId: patient.id,
          createdBy: receptionistId,
          invoiceNo: `${PREFIX}INVR`,
          subtotal: '400',
          total: '400',
          paidAmount: '0',
          status: 'issued',
          items: {
            create: {
              refType: 'service',
              description: 'Ultrasound',
              quantity: 1,
              unitPrice: '400',
              total: '400',
            },
          },
        },
      })
    ).id;

    // A paid bill whose payment is dated two days ago — outside the R5 same-day window, so a
    // receptionist may not refund it but an admin may.
    const oldInvoice = await prisma.invoice.create({
      data: {
        facilityId,
        patientId: patient.id,
        createdBy: receptionistId,
        invoiceNo: `${PREFIX}INVRO`,
        subtotal: '200',
        total: '200',
        paidAmount: '200',
        status: 'paid',
        items: {
          create: {
            refType: 'service',
            description: 'Old visit',
            quantity: 1,
            unitPrice: '200',
            total: '200',
          },
        },
        payments: {
          create: {
            amount: '200',
            method: 'cash',
            receivedBy: receptionistId,
            receiptNo: `${PREFIX}RCPOLD`,
            receivedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
          },
        },
      },
      select: { id: true, payments: { select: { id: true } } },
    });
    refundOldInvoiceId = oldInvoice.id;
    oldPaymentId = oldInvoice.payments[0].id;

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
  const pay = (as: string, id: string, body: unknown) =>
    request(server)
      .post(`/invoices/${id}/payments`)
      .set('Authorization', `Bearer ${tokens[as]}`)
      .send(body);
  const discount = (as: string, id: string, body: unknown) =>
    request(server)
      .post(`/invoices/${id}/discount`)
      .set('Authorization', `Bearer ${tokens[as]}`)
      .send(body);
  const refund = (as: string, id: string, paymentId: string, body: unknown) =>
    request(server)
      .post(`/invoices/${id}/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${tokens[as]}`)
      .send(body);

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

  it('the done-when: instalments settle a bill, each with its own receipt', async () => {
    // First instalment — part of the 400.
    const first = (await pay('recep', payInvoiceId, { amount: '150', method: 'cash' }).expect(200))
      .body as RecordPaymentResponse;
    expect(first.status).toBe('partially_paid');
    expect(first.paidAmount).toBe('150.00');
    expect(first.outstanding).toBe('250.00');
    expect(first.payment.amount).toBe('150.00');
    expect(first.payment.method).toBe('cash');
    expect(first.payment.receiptNo).toMatch(/^RCP-/);

    // Second instalment closes it.
    const second = (await pay('recep', payInvoiceId, { amount: '250', method: 'card' }).expect(200))
      .body as RecordPaymentResponse;
    expect(second.status).toBe('paid');
    expect(second.outstanding).toBe('0.00');
    expect(second.payment.receiptNo).not.toBe(first.payment.receiptNo);

    // The cash trail: two payments on the bill, both with receipt numbers.
    const body = (await detail('recep', payInvoiceId).expect(200)).body as InvoiceDetail;
    expect(body.invoice.status).toBe('paid');
    expect(body.payments).toHaveLength(2);
    expect(body.payments.every((p) => p.receiptNo?.startsWith('RCP-'))).toBe(true);
  });

  it('refuses to take more than is owed, or to pay a settled bill', async () => {
    const over = (await pay('recep', overInvoiceId, { amount: '150', method: 'cash' }).expect(400))
      .body as { code?: string };
    expect(over.code).toBe('overpayment');

    // Settle it exactly, then a further payment is refused.
    await pay('recep', overInvoiceId, { amount: '100', method: 'cash' }).expect(200);
    const again = (await pay('recep', overInvoiceId, { amount: '10', method: 'cash' }).expect(400))
      .body as { code?: string };
    expect(again.code).toBe('already_paid');
  });

  it('rejects a zero or malformed amount at the contract', async () => {
    await pay('recep', payInvoiceId, { amount: '0', method: 'cash' }).expect(400);
    await pay('recep', payInvoiceId, { amount: 'lots', method: 'cash' }).expect(400);
    // waiver is not a tender — writing a bill off is a discount, not a payment.
    await pay('recep', payInvoiceId, { amount: '10', method: 'waiver' }).expect(400);
  });

  it('the done-when: a receptionist cannot discount past 10%, but an admin can', async () => {
    // Exactly the 10% ceiling on a 1000 bill — allowed, with its mandatory reason.
    const ok = (
      await discount('recep', discountInvoiceId, { amount: '100', reason: 'Elderly patient' })
        .expect(200)
    ).body as ApplyDiscountResponse;
    expect(ok.discount).toBe('100.00');
    expect(ok.total).toBe('900.00');
    expect(ok.discountReason).toBe('Elderly patient');
    expect(ok.status).toBe('issued');

    // A hair over the ceiling — refused. This is "the receptionist can't zero a bill".
    const over = (
      await discount('recep', discountInvoiceId, { amount: '150', reason: 'Friend of the family' })
        .expect(403)
    ).body as { code?: string };
    expect(over.code).toBe('over_ceiling');

    // The same over-ceiling discount from an admin lands — an unconditional grant has no cap.
    const admin = (
      await discount('admin', discountInvoiceId, { amount: '500', reason: 'Director approved' })
        .expect(200)
    ).body as ApplyDiscountResponse;
    expect(admin.discount).toBe('500.00');
    expect(admin.total).toBe('500.00');
  });

  it('requires a reason, refuses more than the bill, and no refund by discount', async () => {
    await discount('recep', discountInvoiceId, { amount: '50', reason: '  ' }).expect(400);
    await discount('recep', discountInvoiceId, { amount: '50' }).expect(400);
    // Admin, uncapped, but still cannot discount beyond the subtotal.
    const overSub = (
      await discount('admin', discountInvoiceId, { amount: '2000', reason: 'Too much' }).expect(400)
    ).body as { code?: string };
    expect(overSub.code).toBe('over_subtotal');
    // A discount that would drop the total below what is already paid needs a refund first.
    const refund = (
      await discount('admin', refundGuardInvoiceId, { amount: '100', reason: 'Late goodwill' })
        .expect(400)
    ).body as { code?: string };
    expect(refund.code).toBe('would_owe_refund');
  });

  it('the done-when: an over-ceiling discount goes through on an admin approval', async () => {
    // 300 on a 1000 bill is past the receptionist's 100 ceiling: refused without approval…
    const refused = (
      await discount('recep', approvalInvoiceId, { amount: '300', reason: 'Hardship case' })
        .expect(403)
    ).body as { code?: string };
    expect(refused.code).toBe('over_ceiling');

    // …and accepted with a valid admin standing behind it — the second person.
    const ok = (
      await discount('recep', approvalInvoiceId, {
        amount: '300',
        reason: 'Hardship case',
        approval: { username: `${PREFIX}admin`, password: PASSWORD },
      }).expect(200)
    ).body as ApplyDiscountResponse;
    expect(ok.discount).toBe('300.00');
    expect(ok.total).toBe('700.00');
    expect(ok.approvedByName).toBe('E2E Invoice admin');

    // The approver is stamped on the bill.
    const stamped = await prisma.invoice.findUniqueOrThrow({
      where: { id: approvalInvoiceId },
      select: { discountApprovedBy: true, discountApprovedAt: true },
    });
    expect(stamped.discountApprovedBy).toBe(adminId);
    expect(stamped.discountApprovedAt).not.toBeNull();
  });

  it('refuses a bad approval: wrong password, or an approver without the authority', async () => {
    const wrongPass = (
      await discount('recep', approvalInvoiceId, {
        amount: '300',
        reason: 'Hardship case',
        approval: { username: `${PREFIX}admin`, password: 'not-the-password' },
      }).expect(401)
    ).body as { code?: string };
    expect(wrongPass.code).toBe('approval_invalid');

    // A second person who lacks the authority — the doctor holds no
    // discount.approve_over_threshold — is refused.
    const notAllowed = (
      await discount('recep', approvalInvoiceId, {
        amount: '300',
        reason: 'Hardship case',
        approval: { username: `${PREFIX}doctor`, password: PASSWORD },
      }).expect(403)
    ).body as { code?: string };
    expect(notAllowed.code).toBe('approval_insufficient');

    // The caller cannot be their own approver — a second person is required.
    const self = (
      await discount('recep', approvalInvoiceId, {
        amount: '300',
        reason: 'Hardship case',
        approval: { username: `${PREFIX}recep`, password: PASSWORD },
      }).expect(403)
    ).body as { code?: string };
    expect(self.code).toBe('approval_self');
  });

  it('the done-when: refunds a payment same-day, reverses it, gives a receipt', async () => {
    // Take a payment now, so it is dated today, then give it back.
    const paid = (await pay('recep', refundInvoiceId, { amount: '400', method: 'cash' }).expect(200))
      .body as RecordPaymentResponse;
    const paymentId = paid.payment.id;

    const r = (
      await refund('recep', refundInvoiceId, paymentId, { reason: 'Test billed by mistake' })
        .expect(200)
    ).body as RefundPaymentResponse;
    expect(r.refundedAmount).toBe('400.00');
    expect(r.refundReceiptNo).toMatch(/^RCP-/);
    expect(r.method).toBe('cash');
    expect(r.status).toBe('issued');
    expect(r.paidAmount).toBe('0.00');
    expect(r.outstanding).toBe('400.00');

    // Reversed, not deleted: the original stands marked, a negative row records the money out.
    const body = (await detail('recep', refundInvoiceId).expect(200)).body as InvoiceDetail;
    const original = body.payments.find((p) => p.id === paymentId);
    expect(original?.isReversed).toBe(true);
    const refundRow = body.payments.find((p) => p.id === r.refundId);
    expect(refundRow?.amount).toBe('-400.00');
    expect(refundRow?.receiptNo).toBe(r.refundReceiptNo);

    // A payment already reversed cannot be refunded again.
    await refund('recep', refundInvoiceId, paymentId, { reason: 'once more' }).expect(400);
  });

  it('holds the R5 same-day window: old payments are an admin’s to refund, and a reason is required', async () => {
    const closed = (
      await refund('recep', refundOldInvoiceId, oldPaymentId, { reason: 'Too late for the desk' })
        .expect(403)
    ).body as { code?: string };
    expect(closed.code).toBe('outside_r5_window');

    // The same refund from an admin, who is not time-boxed, goes through.
    const byAdmin = (
      await refund('admin', refundOldInvoiceId, oldPaymentId, { reason: 'Approved late refund' })
        .expect(200)
    ).body as RefundPaymentResponse;
    expect(byAdmin.refundedAmount).toBe('200.00');

    // A refund with no real reason is refused at the contract.
    await refund('admin', refundOldInvoiceId, oldPaymentId, { reason: ' ' }).expect(400);
  });

  it('denies a doctor — invoice.read, payment.receive, discount.apply and payment.refund are not theirs', async () => {
    await list('doctor').expect(403);
    await detail('doctor', invoiceId).expect(403);
    await byVisit('doctor', visitId).expect(403);
    await pay('doctor', payInvoiceId, { amount: '10', method: 'cash' }).expect(403);
    await discount('doctor', discountInvoiceId, { amount: '10', reason: 'no' }).expect(403);
    await refund('doctor', refundInvoiceId, oldPaymentId, { reason: 'nope' }).expect(403);
  });
});
