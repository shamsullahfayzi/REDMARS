import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { CancelVisitResponse, CheckInResponse, LoginResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 3.11 — visit cancel + refund, under rule R5.
 *
 * R5, as written: "allowed same-day, before the next step has occurred. Outside the
 * window → admin only. All logged with a mandatory reason." Three clauses, and each one
 * has its own case here, because each one is a different way for money to walk out of a
 * till unexplained.
 *
 * The refund is a LEDGER, not an edit. The original payment is marked reversed and stays
 * exactly where it was — it is still true that money came in — and a negative payment is
 * appended for the money going back out, with its own author and its own timestamp.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_vcanc_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Visit cancel and refund (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let otherFacilityId: string;
  let receptionistId: string;
  let adminId: string;
  let receptionistToken: string;
  let adminToken: string;
  let doctorToken: string;

  let opdId: string;
  let drOpdId: string;
  let consultId: string;

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Cancel ${suffix}`,
        passwordHash: await hash(PASSWORD),
      },
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return user.id;
  }

  async function login(username: string): Promise<string> {
    const res = await request(server)
      .post('/auth/login')
      .send({ username, password: PASSWORD })
      .expect(200);
    return (res.body as LoginResponse).accessToken;
  }

  let counter = 0;
  /** A real paid visit, made the way the desk makes one (task 3.6). */
  async function checkIn(): Promise<CheckInResponse> {
    counter += 1;
    const res = await request(server)
      .post('/reception/check-in')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        patient: {
          firstName: `Leaver${counter}`,
          lastName: 'Patient',
          gender: 'female',
          phone: `07006${String(counter).padStart(5, '0')}`,
          estimatedAgeYears: 30,
        },
        visit: { type: 'opd_consult', departmentId: opdId, practitionerId: drOpdId },
        items: [{ serviceId: consultId, quantity: 1 }],
        paymentMethod: 'cash',
      })
      .expect(201);
    return res.body as CheckInResponse;
  }

  function cancel(id: string, body: unknown, token = receptionistToken) {
    return request(server)
      .post(`/visits/${id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.payment.deleteMany({ where: { invoice: facilityFilter } });
    await prisma.invoiceItem.deleteMany({ where: { invoice: facilityFilter } });
    await prisma.invoice.deleteMany({ where: facilityFilter });
    await prisma.visitStatusHistory.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visit.deleteMany({ where: facilityFilter });
    await prisma.appointment.deleteMany({ where: facilityFilter });
    await prisma.patient.deleteMany({ where: facilityFilter });
    await prisma.service.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.practitionerDepartment.deleteMany({
      where: { department: { code: { startsWith: PREFIX } } },
    });
    await prisma.practitioner.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.department.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.numberSequence.deleteMany({ where: facilityFilter });
    // Again, and deliberately. The R1 read row is written fire-and-forget, so one can
    // land AFTER the sweep above and before the facility goes — and then the facility
    // delete fails on a foreign key, inside afterAll, which Jest reports as a failed suite
    // with no failed tests. Cheap to repeat, miserable to debug.
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
      await prisma.facility.create({ data: { code: `${PREFIX}fac`, name: 'E2E Cancel Facility' } })
    ).id;
    otherFacilityId = (
      await prisma.facility.create({ data: { code: `${PREFIX}other`, name: 'E2E Cancel Other' } })
    ).id;

    receptionistId = await seedActor('receptionist', 'receptionist');
    adminId = await seedActor('admin', 'admin');
    await seedActor('doctor', 'doctor');
    receptionistToken = await login(`${PREFIX}receptionist`);
    adminToken = await login(`${PREFIX}admin`);
    doctorToken = await login(`${PREFIX}doctor`);

    opdId = (
      await prisma.department.create({
        data: { facilityId, code: `${PREFIX}OPD`, name: 'E2E OPD', type: 'opd' },
      })
    ).id;
    drOpdId = (
      await prisma.practitioner.create({
        data: {
          facilityId,
          code: `${PREFIX}DR1`,
          firstName: 'Hafizullah',
          lastName: 'Sherzai',
          departments: { create: { departmentId: opdId } },
        },
      })
    ).id;
    consultId = (
      await prisma.service.create({
        data: {
          facilityId,
          departmentId: opdId,
          code: `${PREFIX}CONSULT`,
          name: 'OPD Consultation',
          fee: '500.00',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  // --- The done-when ---------------------------------------------------------

  it('the done-when: a cancelled visit refunds, and logs why', async () => {
    const { visit, invoice } = await checkIn();

    const res = await cancel(visit.id, { reason: 'Patient left before being seen' }).expect(200);
    const out = res.body as CancelVisitResponse;

    expect(out.visit.status).toBe('cancelled');
    expect(out.refund).not.toBeNull();
    expect(out.refund?.refunded).toBe('500.00');
    expect(out.refund?.invoiceNo).toBe(invoice.invoiceNo);

    // And the WHY is on the record, signed, where the next status change cannot overwrite it.
    const history = await prisma.visitStatusHistory.findFirst({
      where: { visitId: visit.id, status: 'cancelled' },
    });
    expect(history?.note).toBe('Patient left before being seen');
    expect(history?.changedBy).toBe(receptionistId);
  });

  it('the refund is a ledger entry, not an edit', async () => {
    const { visit, invoice } = await checkIn();
    await cancel(visit.id, { reason: 'Changed their mind' }).expect(200);

    const payments = await prisma.payment.findMany({
      where: { invoiceId: invoice.id },
      orderBy: { receivedAt: 'asc' },
    });

    // Two rows: the money that came in, and the money that went back out.
    expect(payments).toHaveLength(2);
    // The original still says money was taken, because it was. It is marked, not erased.
    expect(payments[0].amount.toFixed(2)).toBe('500.00');
    expect(payments[0].isReversed).toBe(true);
    // The refund is its own event, with its own author.
    expect(payments[1].amount.toFixed(2)).toBe('-500.00');
    expect(payments[1].receivedBy).toBe(receptionistId);
    // Summing every row gives the truth: nothing is owed and nothing is held.
    const net = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    expect(net).toBe(0);
  });

  it('closes the invoice and zeroes what it claims to hold', async () => {
    const { visit, invoice } = await checkIn();
    await cancel(visit.id, { reason: 'Duplicate registration' }).expect(200);

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe('cancelled');
    expect(after.paidAmount.toFixed(2)).toBe('0.00');
  });

  it('closes the clock on the visit', async () => {
    const { visit } = await checkIn();
    await cancel(visit.id, { reason: 'Sent to another hospital' }).expect(200);

    const after = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } });
    expect(after.endedAt).not.toBeNull();
  });

  // --- R5, clause by clause ---------------------------------------------------

  it('R5: a reason is mandatory', async () => {
    const { visit } = await checkIn();
    await cancel(visit.id, {}).expect(400);
    await cancel(visit.id, { reason: '  ' }).expect(400);
    // Still cancellable once a reason is actually given.
    await cancel(visit.id, { reason: 'Patient left' }).expect(200);
  });

  it('R5: the desk cannot cancel a visit from another day — admin only', async () => {
    const { visit } = await checkIn();
    // Yesterday. The money is banked, the day is closed, and this is no longer the
    // desk's to undo.
    await prisma.visit.update({
      where: { id: visit.id },
      data: { startedAt: new Date(Date.now() - 36 * 60 * 60 * 1000) },
    });

    const refused = await cancel(visit.id, { reason: 'Late correction' }).expect(403);
    expect((refused.body as { code: string }).code).toBe('outside_r5_window');

    // An admin holds it unconditionally, which is exactly what "outside the window →
    // admin only" means.
    await cancel(visit.id, { reason: 'Late correction' }, adminToken).expect(200);
  });

  it('R5: the desk cannot cancel once the doctor has called the patient in', async () => {
    const { visit } = await checkIn();
    await request(server)
      .patch(`/visits/${visit.id}/status`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ status: 'in_progress' })
      .expect(200);

    const refused = await cancel(visit.id, { reason: 'Too late' }).expect(403);
    expect((refused.body as { code: string }).code).toBe('next_step_occurred');

    // An admin may, because abandoning a started consultation is a real event.
    await cancel(visit.id, { reason: 'Patient collapsed, sent to hospital' }, adminToken).expect(
      200,
    );
  });

  it('nobody cancels a completed visit — not even an admin', async () => {
    const { visit } = await checkIn();
    for (const status of ['in_progress', 'completed']) {
      await request(server)
        .patch(`/visits/${visit.id}/status`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ status })
        .expect(200);
    }

    // The patient WAS seen. Correcting a visit that should never have existed is
    // entered_in_error (visit.void), not a cancellation.
    const res = await cancel(visit.id, { reason: 'Nope' }, adminToken).expect(400);
    expect((res.body as { code: string }).code).toBe('illegal_transition');
  });

  it('refuses to cancel the same visit twice', async () => {
    const { visit } = await checkIn();
    await cancel(visit.id, { reason: 'Patient left' }).expect(200);
    await cancel(visit.id, { reason: 'Again' }).expect(400);
  });

  it('does not refund twice when asked twice', async () => {
    const { visit, invoice } = await checkIn();
    await cancel(visit.id, { reason: 'Patient left' }).expect(200);
    await cancel(visit.id, { reason: 'Again' }).expect(400);

    const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
    // Still exactly one in and one out. A second refund would be money invented.
    expect(payments).toHaveLength(2);
  });

  // --- A visit nobody paid for ------------------------------------------------

  it('cancels a free visit with no refund at all', async () => {
    const free = await prisma.service.create({
      data: {
        facilityId,
        departmentId: opdId,
        code: `${PREFIX}FREE`,
        name: 'Charity Follow-up',
        fee: '0.00',
      },
    });
    counter += 1;
    const created = (
      await request(server)
        .post('/reception/check-in')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          patient: {
            firstName: `Free${counter}`,
            gender: 'male',
            phone: `07005${String(counter).padStart(5, '0')}`,
            estimatedAgeYears: 44,
          },
          visit: { type: 'opd_consult', departmentId: opdId, practitionerId: drOpdId },
          items: [{ serviceId: free.id, quantity: 1 }],
          paymentMethod: 'cash',
        })
        .expect(201)
    ).body as CheckInResponse;

    const res = await cancel(created.visit.id, { reason: 'Came on the wrong day' }).expect(200);
    // Nothing was taken, so nothing goes back — and the cancellation still stands.
    expect((res.body as CancelVisitResponse).refund).toBeNull();
    expect((res.body as CancelVisitResponse).visit.status).toBe('cancelled');
  });

  // --- Who may do it ----------------------------------------------------------

  it('denies a doctor: cancelling is the desk and the administrator', async () => {
    const { visit } = await checkIn();
    await cancel(visit.id, { reason: 'Not mine to do' }, doctorToken).expect(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const { visit } = await checkIn();
    await request(server)
      .post(`/visits/${visit.id}/cancel`)
      .send({ reason: 'Anonymous' })
      .expect(401);
  });

  it("another facility's visit is a 404, never a 403", async () => {
    const patient = await prisma.patient.create({
      data: {
        facilityId: otherFacilityId,
        mrn: `${PREFIX}MRN-FOR`,
        firstName: 'Elsewhere',
        gender: 'male',
        estimatedAgeYears: 50,
      },
    });
    const department = await prisma.department.create({
      data: { facilityId: otherFacilityId, code: `${PREFIX}FOR`, name: 'Foreign', type: 'opd' },
    });
    const foreign = await prisma.visit.create({
      data: {
        facilityId: otherFacilityId,
        patientId: patient.id,
        departmentId: department.id,
        visitNo: `${PREFIX}V-FOR`,
        type: 'opd_consult',
      },
    });

    await cancel(foreign.id, { reason: 'Not ours' }, adminToken).expect(404);
  });

  it('rejects a non-uuid id with 400', () => cancel('not-a-uuid', { reason: 'x y z' }).expect(400));

  it('audits the cancellation and the refund to whoever made them', async () => {
    const { visit, invoice } = await checkIn();
    await cancel(visit.id, { reason: 'Patient left' }, adminToken).expect(200);

    const visitEntry = await prisma.auditLog.findFirst({
      where: { entity: 'Visit', entityId: visit.id, action: 'update' },
      orderBy: { createdAt: 'desc' },
    });
    expect(visitEntry?.userId).toBe(adminId);

    const invoiceEntry = await prisma.auditLog.findFirst({
      where: { entity: 'Invoice', entityId: invoice.id, action: 'update' },
      orderBy: { createdAt: 'desc' },
    });
    expect(invoiceEntry?.userId).toBe(adminId);
  });

  it('the cancelled visit leaves the queue', async () => {
    const { visit } = await checkIn();
    await cancel(visit.id, { reason: 'Patient left' }).expect(200);

    const queue = await request(server)
      .get('/visits/queue')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);

    const ids = (queue.body as { entries: Array<{ id: string }> }).entries.map((e) => e.id);
    expect(ids).not.toContain(visit.id);
  });
});
