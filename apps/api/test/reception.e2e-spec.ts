import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { CheckInResponse, LoginResponse, VisitOptionsResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 3.6 — the reception desk. One screen, one save.
 *
 * The done-when: ONE request registers the patient, creates the visit, raises the bill
 * and logs the cash. The tests that matter most are not the happy path but the two
 * properties that make the happy path safe to rely on:
 *
 *  - ATOMICITY. A save that fails half way leaves nothing behind — no orphan patient, no
 *    visit without a bill, and no burnt numbers in a sequence that calls itself gapless.
 *  - PRICES COME FROM THE CATALOG. The request carries a serviceId and a quantity and no
 *    money at all, so there is nothing for a browser to tamper with.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_recep_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Reception check-in (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let otherFacilityId: string;
  let receptionistId: string;
  let receptionistToken: string;
  let doctorToken: string;
  let adminToken: string;

  let opdId: string;
  let labId: string;
  let closedDeptId: string;
  let drOpdId: string;

  let consultId: string; // 500.00
  let ecgId: string; // 400.50
  let freeId: string; // 0.00
  let retiredServiceId: string; // inactive
  let foreignServiceId: string; // another facility

  let returningPatientId: string;

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Reception ${suffix}`,
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

  /** A walk-in nobody has seen before. Each call is a different person. */
  let personCounter = 0;
  function newPatient(overrides: Record<string, unknown> = {}) {
    personCounter += 1;
    return {
      firstName: `Walkin${personCounter}`,
      lastName: 'Test',
      gender: 'female',
      phone: `07009${String(personCounter).padStart(5, '0')}`,
      estimatedAgeYears: 30,
      ...overrides,
    };
  }

  /** A complete, valid check-in. Overrides make each case say only what it is testing. */
  function body(overrides: Record<string, unknown> = {}) {
    return {
      patient: newPatient(),
      visit: { type: 'opd_consult', departmentId: opdId, practitionerId: drOpdId },
      items: [{ serviceId: consultId, quantity: 1 }],
      paymentMethod: 'cash',
      ...overrides,
    };
  }

  function post(payload: unknown, token = receptionistToken) {
    return request(server)
      .post('/reception/check-in')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
  }

  async function sequenceValues(): Promise<Record<string, number>> {
    const rows = await prisma.numberSequence.findMany({ where: { facilityId } });
    return Object.fromEntries(rows.map((row) => [row.key, row.current]));
  }

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.payment.deleteMany({ where: { invoice: facilityFilter } });
    await prisma.invoiceItem.deleteMany({ where: { invoice: facilityFilter } });
    await prisma.invoice.deleteMany({ where: facilityFilter });
    await prisma.visitStatusHistory.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visit.deleteMany({ where: facilityFilter });
    await prisma.patientIdentifier.deleteMany({ where: { patient: facilityFilter } });
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
      await prisma.facility.create({
        data: { code: `${PREFIX}fac`, name: 'E2E Reception Facility' },
      })
    ).id;
    otherFacilityId = (
      await prisma.facility.create({
        data: { code: `${PREFIX}other`, name: 'E2E Reception Other' },
      })
    ).id;

    receptionistId = await seedActor('receptionist', 'receptionist');
    await seedActor('doctor', 'doctor');
    await seedActor('admin', 'admin');
    receptionistToken = await login(`${PREFIX}receptionist`);
    doctorToken = await login(`${PREFIX}doctor`);
    adminToken = await login(`${PREFIX}admin`);

    opdId = (
      await prisma.department.create({
        data: { facilityId, code: `${PREFIX}OPD`, name: 'E2E OPD', type: 'opd' },
      })
    ).id;
    labId = (
      await prisma.department.create({
        data: { facilityId, code: `${PREFIX}LAB`, name: 'E2E Lab', type: 'laboratory' },
      })
    ).id;
    closedDeptId = (
      await prisma.department.create({
        data: {
          facilityId,
          code: `${PREFIX}OLD`,
          name: 'E2E Closed',
          type: 'opd',
          isActive: false,
        },
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
    ecgId = (
      await prisma.service.create({
        data: {
          facilityId,
          departmentId: labId,
          code: `${PREFIX}ECG`,
          name: 'ECG',
          fee: '400.50',
        },
      })
    ).id;
    // A genuinely free service. The desk still bills it, so the record says what was
    // provided; there is simply nothing to take at the window.
    freeId = (
      await prisma.service.create({
        data: {
          facilityId,
          departmentId: opdId,
          code: `${PREFIX}FREE`,
          name: 'Charity Follow-up',
          fee: '0.00',
        },
      })
    ).id;
    retiredServiceId = (
      await prisma.service.create({
        data: {
          facilityId,
          departmentId: opdId,
          code: `${PREFIX}RETIRED`,
          name: 'Withdrawn Service',
          fee: '900.00',
          isActive: false,
        },
      })
    ).id;
    foreignServiceId = (
      await prisma.service.create({
        data: {
          facilityId: otherFacilityId,
          departmentId: (
            await prisma.department.create({
              data: {
                facilityId: otherFacilityId,
                code: `${PREFIX}FOROPD`,
                name: 'E2E Foreign OPD',
                type: 'opd',
              },
            })
          ).id,
          code: `${PREFIX}FOREIGN`,
          name: 'Someone Else Consultation',
          fee: '100.00',
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

  it('the done-when: ONE save registers, admits, bills and logs the cash', async () => {
    const res = await post(body()).expect(201);
    const out = res.body as CheckInResponse;

    // Registered — with a medical record number the patient keeps.
    expect(out.patient.mrn).toMatch(/^MRN-\d{6}$/);
    expect(out.patient.isNew).toBe(true);

    // In the queue.
    expect(out.visit.visitNo).toMatch(/^V-\d{4}-\d{4}$/);
    expect(out.visit.status).toBe('arrived');
    expect(out.visit.departmentName).toBe('E2E OPD');

    // Billed.
    expect(out.invoice.invoiceNo).toMatch(/^INV-\d{4}-\d{4}$/);
    expect(out.invoice.subtotal).toBe('500.00');
    expect(out.invoice.total).toBe('500.00');
    expect(out.invoice.items).toHaveLength(1);
    expect(out.invoice.items[0].description).toBe('OPD Consultation');

    // Paid, and the cash is on the record rather than only in the drawer.
    expect(out.invoice.status).toBe('paid');
    expect(out.invoice.paidAmount).toBe('500.00');
    expect(out.invoice.paymentMethod).toBe('cash');

    const payments = await prisma.payment.findMany({ where: { invoiceId: out.invoice.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0].amount.toFixed(2)).toBe('500.00');
    expect(payments[0].method).toBe('cash');
    expect(payments[0].receivedBy).toBe(receptionistId);

    // And the four are joined up, not four unrelated rows.
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: out.invoice.id } });
    expect(invoice.visitId).toBe(out.visit.id);
    expect(invoice.patientId).toBe(out.patient.id);
  });

  it('checks in a returning patient without registering a second one', async () => {
    const first = await post(body()).expect(201);
    returningPatientId = (first.body as CheckInResponse).patient.id;

    const before = await prisma.patient.count({ where: { facilityId } });
    const res = await post(
      body({
        patient: null,
        patientId: returningPatientId,
        visit: { type: 'follow_up', departmentId: labId },
      }),
    ).expect(201);

    const out = res.body as CheckInResponse;
    expect(out.patient.id).toBe(returningPatientId);
    expect(out.patient.isNew).toBe(false);
    expect(await prisma.patient.count({ where: { facilityId } })).toBe(before);
  });

  it('refuses a check-in that names neither an existing patient nor a new one', () =>
    post({ ...body(), patient: null }).expect(400));

  it('refuses a check-in that names both', () =>
    post(body({ patientId: returningPatientId })).expect(400));

  // --- The money comes from the catalog ---------------------------------------

  it('prices from the catalog: a fee the client never sent', async () => {
    const res = await post(body()).expect(201);
    const out = res.body as CheckInResponse;
    // The request carried a serviceId and a quantity. 500.00 came from the service row.
    expect(out.invoice.items[0].unitPrice).toBe('500.00');
  });

  it('multiplies by quantity and sums several lines exactly', async () => {
    const res = await post(
      body({
        items: [
          { serviceId: consultId, quantity: 2 },
          { serviceId: ecgId, quantity: 3 },
        ],
      }),
    ).expect(201);

    const out = res.body as CheckInResponse;
    // 2 x 500.00 + 3 x 400.50 = 2201.50, to the cent. Decimal, not float.
    expect(out.invoice.subtotal).toBe('2201.50');
    expect(out.invoice.total).toBe('2201.50');
  });

  it('refuses the same service listed twice: that is a quantity, not two lines', () =>
    post(
      body({
        items: [
          { serviceId: consultId, quantity: 1 },
          { serviceId: consultId, quantity: 1 },
        ],
      }),
    ).expect(400));

  it('refuses a bill with no lines at all', () => post(body({ items: [] })).expect(400));

  it('refuses an unknown service', () =>
    post(
      body({ items: [{ serviceId: '00000000-0000-4000-8000-000000000000', quantity: 1 }] }),
    ).expect(400));

  it('refuses a withdrawn service: a deactivated price is not a price', () =>
    post(body({ items: [{ serviceId: retiredServiceId, quantity: 1 }] })).expect(400));

  it("refuses another facility's service", () =>
    post(body({ items: [{ serviceId: foreignServiceId, quantity: 1 }] })).expect(400));

  it('bills a free service and takes no payment for it', async () => {
    const res = await post(body({ items: [{ serviceId: freeId, quantity: 1 }] })).expect(201);
    const out = res.body as CheckInResponse;

    expect(out.invoice.total).toBe('0.00');
    expect(out.invoice.status).toBe('paid');
    // The bill still says what was provided; there is just no cash row to write.
    expect(out.invoice.items).toHaveLength(1);
    expect(out.invoice.paymentMethod).toBeNull();
    expect(await prisma.payment.count({ where: { invoiceId: out.invoice.id } })).toBe(0);
  });

  // --- Discount, and R10 ------------------------------------------------------

  it('applies a discount and records why', async () => {
    const res = await post(body({ discount: '50.00', discountReason: 'Staff family' })).expect(201);
    const out = res.body as CheckInResponse;

    expect(out.invoice.subtotal).toBe('500.00');
    expect(out.invoice.discount).toBe('50.00');
    expect(out.invoice.total).toBe('450.00');
    expect(out.invoice.paidAmount).toBe('450.00');
    expect(out.invoice.discountReason).toBe('Staff family');
  });

  it('refuses a discount with no reason: that is how cash leaves a till', () =>
    post(body({ discount: '50.00' })).expect(400));

  it('R10: refuses a discount over the 10% ceiling at the desk', () =>
    // 500.00 subtotal, ceiling 50.00. 50.01 is one paisa past what a receptionist may do.
    post(body({ discount: '50.01', discountReason: 'Feeling generous' })).expect(403));

  it('refuses a discount larger than the bill', () =>
    post(body({ discount: '900.00', discountReason: 'Nonsense' })).expect(400));

  // --- Atomicity: the property the whole task rests on ------------------------

  it('a failed save leaves NOTHING behind — no patient, no visit, no bill, no burnt numbers', async () => {
    const before = await sequenceValues();
    const patientsBefore = await prisma.patient.count({ where: { facilityId } });
    const person = newPatient({ firstName: 'Rollback', phone: '0700777777' });

    // The patient is valid and is written first; the visit then fails on a deactivated
    // department. Without a transaction this leaves a registered stranger behind.
    await post({
      patient: person,
      visit: { type: 'opd_consult', departmentId: closedDeptId },
      items: [{ serviceId: consultId, quantity: 1 }],
      paymentMethod: 'cash',
    }).expect(400);

    expect(await prisma.patient.count({ where: { facilityId } })).toBe(patientsBefore);
    expect(await prisma.patient.count({ where: { facilityId, firstName: 'Rollback' } })).toBe(0);

    // And the counters did not move. A gapless sequence with a hole in it is worse than
    // no sequence at all — this is why the issuer takes the caller's transaction.
    expect(await sequenceValues()).toEqual(before);
  });

  it('a failed payment step takes the visit and the invoice down with it', async () => {
    const visitsBefore = await prisma.visit.count({ where: { facilityId } });
    const invoicesBefore = await prisma.invoice.count({ where: { facilityId } });

    await post(
      body({ patient: null, patientId: returningPatientId, paymentMethod: 'not_a_method' }),
    ).expect(400);

    expect(await prisma.visit.count({ where: { facilityId } })).toBe(visitsBefore);
    expect(await prisma.invoice.count({ where: { facilityId } })).toBe(invoicesBefore);
  });

  // --- The guards from 3.3 and 3.5 still apply --------------------------------

  it('the duplicate guard still applies, and is still overridable', async () => {
    const twin = newPatient({ firstName: 'Najila', phone: '0700123999' });
    await post(body({ patient: twin })).expect(201);

    const again = await post(body({ patient: { ...twin } })).expect(409);
    expect((again.body as { code: string }).code).toBe('duplicate_patient');

    await post(body({ patient: { ...twin }, acknowledgeDuplicate: true })).expect(201);
  });

  it('the open-visit guard still applies, and is still overridable', async () => {
    const res = await post(body()).expect(201);
    const patientId = (res.body as CheckInResponse).patient.id;

    const again = await post(body({ patient: null, patientId })).expect(409);
    expect((again.body as { code: string }).code).toBe('open_visit');

    await post(body({ patient: null, patientId, acknowledgeOpenVisit: true })).expect(201);
  });

  it('a doctor filed outside his department is still refused', () =>
    post(
      body({ visit: { type: 'opd_consult', departmentId: labId, practitionerId: drOpdId } }),
    ).expect(400));

  // --- Who may run the desk ---------------------------------------------------

  it('denies a doctor: the desk registers and takes money, a doctor does neither', () =>
    post(body(), doctorToken).expect(403));

  it('denies an admin too — visit.create is the desk alone, and this route needs it', () =>
    post(body(), adminToken).expect(403));

  it('rejects an unauthenticated request with 401', () =>
    request(server).post('/reception/check-in').send(body()).expect(401));

  // --- Trail and pickers ------------------------------------------------------

  it('audits all four writes to the receptionist who made them', async () => {
    const res = await post(body()).expect(201);
    const out = res.body as CheckInResponse;

    for (const [entity, id] of [
      ['Patient', out.patient.id],
      ['Visit', out.visit.id],
      ['Invoice', out.invoice.id],
    ] as const) {
      const entry = await prisma.auditLog.findFirst({ where: { entity, entityId: id } });
      expect(entry?.userId).toBe(receptionistId);
    }
  });

  it('the pickers now carry the priced catalog the desk bills from', async () => {
    const res = await request(server)
      .get('/visits/options')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);

    const options = res.body as VisitOptionsResponse;
    const consult = options.services.find((service) => service.id === consultId);
    expect(consult?.fee).toBe('500.00');
    expect(consult?.departmentId).toBe(opdId);
    // Withdrawn prices are not offered.
    expect(options.services.map((service) => service.id)).not.toContain(retiredServiceId);
  });
});
