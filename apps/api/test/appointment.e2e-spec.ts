import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  AppointmentListResponse,
  AppointmentSummary,
  CheckInResponse,
  LoginResponse,
} from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 3.10 — the appointment book.
 *
 * It exists for one sentence: "come back on the fifth." So the doctor holds
 * appointment.create alongside the desk — the only moment a follow-up is certain to be
 * recorded is while the patient is still sitting in the room.
 *
 * The half worth guarding is fulfilment. An appointment auto-matches to the visit raised
 * when the patient turns up, and it does so ONLY when the match is unambiguous: two open
 * bookings for one patient on one day means the server links neither. A wrong link is far
 * harder to notice than a missing one, because it silently marks somebody as seen.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_appt_';
const PASSWORD = 'e2e-test-password-not-a-secret';

/** YYYY-MM-DD as the hospital reads it, offset by whole days. */
function kabulDate(daysAhead = 0): string {
  const at = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kabul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

describe('Appointments (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let otherFacilityId: string;
  let doctorToken: string;
  let receptionistToken: string;
  let nurseToken: string;
  let pharmacistToken: string;

  let opdId: string;
  let labId: string;
  let closedDeptId: string;
  let drOpdId: string;
  let drRetiredId: string;
  let consultId: string;

  let patientId: string;
  let foreignPatientId: string;

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Appt ${suffix}`,
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
  async function seedPatient(inFacility = facilityId): Promise<string> {
    counter += 1;
    const patient = await prisma.patient.create({
      data: {
        facilityId: inFacility,
        mrn: `${PREFIX}MRN-${counter}`,
        firstName: `Booked${counter}`,
        lastName: 'Patient',
        gender: 'female',
        phone: `07007${String(counter).padStart(5, '0')}`,
        estimatedAgeYears: 30,
      },
    });
    return patient.id;
  }

  function book(body: unknown, token = doctorToken) {
    return request(server).post('/appointments').set('Authorization', `Bearer ${token}`).send(body);
  }

  function body(overrides: Record<string, unknown> = {}) {
    return {
      patientId,
      departmentId: opdId,
      practitionerId: drOpdId,
      scheduledOn: kabulDate(14),
      reason: 'Review medication',
      ...overrides,
    };
  }

  function list(query = '', token = doctorToken) {
    return request(server).get(`/appointments${query}`).set('Authorization', `Bearer ${token}`);
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
      await prisma.facility.create({ data: { code: `${PREFIX}fac`, name: 'E2E Appt Facility' } })
    ).id;
    otherFacilityId = (
      await prisma.facility.create({ data: { code: `${PREFIX}other`, name: 'E2E Appt Other' } })
    ).id;

    await seedActor('doctor', 'doctor');
    await seedActor('receptionist', 'receptionist');
    await seedActor('nurse', 'nurse');
    await seedActor('pharmacist', 'pharmacist');
    doctorToken = await login(`${PREFIX}doctor`);
    receptionistToken = await login(`${PREFIX}receptionist`);
    nurseToken = await login(`${PREFIX}nurse`);
    pharmacistToken = await login(`${PREFIX}pharmacist`);

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
    drRetiredId = (
      await prisma.practitioner.create({
        data: {
          facilityId,
          code: `${PREFIX}DR2`,
          firstName: 'Retired',
          lastName: 'Consultant',
          isActive: false,
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

    patientId = await seedPatient();
    foreignPatientId = await seedPatient(otherFacilityId);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  // --- The done-when ---------------------------------------------------------

  it('the done-when: the DOCTOR books the follow-up, from the consulting room', async () => {
    const on = kabulDate(14);
    const res = await book(body({ scheduledOn: on })).expect(201);

    const appointment = res.body as AppointmentSummary;
    expect(appointment.status).toBe('booked');
    expect(appointment.scheduledOn).toBe(on);
    expect(appointment.patientMrn).toContain('MRN');
    expect(appointment.practitionerName).toBe('Hafizullah Sherzai');
    expect(appointment.reason).toBe('Review medication');
    // Nothing has happened yet; a booking is a note about the future.
    expect(appointment.visitId).toBeNull();
  });

  it('the desk books one too', () =>
    book(body({ scheduledOn: kabulDate(7) }), receptionistToken).expect(201));

  it('books without naming a doctor: come back and see whoever is on', async () => {
    const res = await book(body({ practitionerId: null, scheduledOn: kabulDate(9) })).expect(201);
    expect((res.body as AppointmentSummary).practitionerName).toBeNull();
  });

  // --- Listing ----------------------------------------------------------------

  it("lists a chosen day, and does not leak the next day's bookings into it", async () => {
    const dayA = kabulDate(21);
    const dayB = kabulDate(22);
    const patient = await seedPatient();
    await book(body({ patientId: patient, scheduledOn: dayA })).expect(201);
    await book(body({ patientId: patient, scheduledOn: dayB })).expect(201);

    const onA = (await list(`?date=${dayA}&patientId=${patient}`).expect(200))
      .body as AppointmentListResponse;
    expect(onA.appointments).toHaveLength(1);
    expect(onA.appointments[0].scheduledOn).toBe(dayA);
    expect(onA.date).toBe(dayA);
  });

  it('lists everything upcoming rather than one day', async () => {
    const patient = await seedPatient();
    await book(body({ patientId: patient, scheduledOn: kabulDate(3) })).expect(201);
    await book(body({ patientId: patient, scheduledOn: kabulDate(30) })).expect(201);

    const upcoming = (await list(`?upcoming=true&patientId=${patient}`).expect(200))
      .body as AppointmentListResponse;
    expect(upcoming.appointments).toHaveLength(2);
    // Soonest first — a book read in any other order is not a book.
    expect(upcoming.appointments[0].scheduledOn).toBe(kabulDate(3));
  });

  it('filters by practitioner and by status', async () => {
    const patient = await seedPatient();
    await book(body({ patientId: patient, scheduledOn: kabulDate(5) })).expect(201);

    const mine = (await list(`?upcoming=true&practitionerId=${drOpdId}&status=booked`).expect(200))
      .body as AppointmentListResponse;
    expect(mine.appointments.every((a) => a.practitionerId === drOpdId)).toBe(true);
    expect(mine.appointments.every((a) => a.status === 'booked')).toBe(true);
  });

  it('a nurse may read the book', () => list('?upcoming=true', nurseToken).expect(200));

  it('a pharmacist may not: they hold no appointment.read', () =>
    list('?upcoming=true', pharmacistToken).expect(403));

  it('rejects a malformed date with 400', () => list('?date=05-08-2026').expect(400));

  // --- What cannot be booked --------------------------------------------------

  it('refuses a date that has already passed', () =>
    book(body({ scheduledOn: kabulDate(-1) })).expect(400));

  it('books for today: a patient told to come back this afternoon', () =>
    seedPatient().then((p) => book(body({ patientId: p, scheduledOn: kabulDate(0) })).expect(201)));

  it('refuses a deactivated department', () =>
    book(body({ departmentId: closedDeptId, practitionerId: null })).expect(400));

  it('refuses a doctor who does not work in that department', () =>
    // Same check the visit makes (3.5): a booking with the wrong doctor is one nobody
    // will ever be there for.
    book(body({ departmentId: labId, practitionerId: drOpdId })).expect(400));

  it('refuses a deactivated practitioner', () =>
    book(body({ practitionerId: drRetiredId })).expect(400));

  it("another facility's patient is a 404, never a 403", () =>
    book(body({ patientId: foreignPatientId })).expect(404));

  it('a pharmacist may not book', () => book(body(), pharmacistToken).expect(403));

  it('rejects an unauthenticated request with 401', () =>
    request(server).post('/appointments').send(body()).expect(401));

  // --- Cancel and no-show are different facts ---------------------------------

  it('marks a no-show, and keeps why the booking existed', async () => {
    const patient = await seedPatient();
    const created = (
      await book(body({ patientId: patient, scheduledOn: kabulDate(2) })).expect(201)
    ).body as AppointmentSummary;

    const res = await request(server)
      .patch(`/appointments/${created.id}/close`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ status: 'no_show', reason: 'Did not attend' })
      .expect(200);

    const closed = res.body as AppointmentSummary;
    expect(closed.status).toBe('no_show');
    // The clinical reason survives: it is the more valuable of the two facts.
    expect(closed.reason).toBe('Review medication — Did not attend');
  });

  it('cancels a booking', async () => {
    const patient = await seedPatient();
    const created = (
      await book(body({ patientId: patient, scheduledOn: kabulDate(2) })).expect(201)
    ).body as AppointmentSummary;

    const res = await request(server)
      .patch(`/appointments/${created.id}/close`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ status: 'cancelled', reason: 'Patient called ahead' })
      .expect(200);
    expect((res.body as AppointmentSummary).status).toBe('cancelled');
  });

  it('a doctor may book but may not mark a no-show: the desk knows who came in', async () => {
    const patient = await seedPatient();
    const created = (
      await book(body({ patientId: patient, scheduledOn: kabulDate(2) })).expect(201)
    ).body as AppointmentSummary;

    await request(server)
      .patch(`/appointments/${created.id}/close`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ status: 'no_show' })
      .expect(403);
  });

  it('refuses to close an already-closed booking', async () => {
    const patient = await seedPatient();
    const created = (
      await book(body({ patientId: patient, scheduledOn: kabulDate(2) })).expect(201)
    ).body as AppointmentSummary;

    const close = () =>
      request(server)
        .patch(`/appointments/${created.id}/close`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ status: 'cancelled' });

    await close().expect(200);
    await close().expect(400);
  });

  it('refuses `fulfilled` through the close route: that is not a decision to make', () =>
    seedPatient()
      .then((p) => book(body({ patientId: p, scheduledOn: kabulDate(2) })).expect(201))
      .then((res) =>
        request(server)
          .patch(`/appointments/${(res.body as AppointmentSummary).id}/close`)
          .set('Authorization', `Bearer ${receptionistToken}`)
          .send({ status: 'fulfilled' })
          .expect(400),
      ));

  // --- Fulfilment: the patient actually turned up -----------------------------

  it('a check-in fulfils the booking and links it to the visit', async () => {
    const patient = await seedPatient();
    const created = (
      await book(body({ patientId: patient, scheduledOn: kabulDate(0) })).expect(201)
    ).body as AppointmentSummary;

    const checkIn = (
      await request(server)
        .post('/reception/check-in')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          patientId: patient,
          visit: { type: 'follow_up', departmentId: opdId, practitionerId: drOpdId },
          items: [{ serviceId: consultId, quantity: 1 }],
          paymentMethod: 'cash',
        })
        .expect(201)
    ).body as CheckInResponse;

    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.status).toBe('fulfilled');

    const visit = await prisma.visit.findUniqueOrThrow({ where: { id: checkIn.visit.id } });
    expect(visit.appointmentId).toBe(created.id);
  });

  it('links NEITHER when the day is ambiguous: two bookings, one patient', async () => {
    const patient = await seedPatient();
    await book(body({ patientId: patient, scheduledOn: kabulDate(0) })).expect(201);
    await book(
      body({
        patientId: patient,
        scheduledOn: kabulDate(0),
        departmentId: labId,
        practitionerId: null,
      }),
    ).expect(201);

    const checkIn = (
      await request(server)
        .post('/reception/check-in')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          patientId: patient,
          visit: { type: 'follow_up', departmentId: opdId, practitionerId: drOpdId },
          items: [{ serviceId: consultId, quantity: 1 }],
          paymentMethod: 'cash',
        })
        .expect(201)
    ).body as CheckInResponse;

    // Guessing would silently mark the wrong booking as seen, which is far harder to
    // notice than a booking left open in the list.
    const visit = await prisma.visit.findUniqueOrThrow({ where: { id: checkIn.visit.id } });
    expect(visit.appointmentId).toBeNull();
    const still = await prisma.appointment.count({
      where: { patientId: patient, status: 'booked' },
    });
    expect(still).toBe(2);
  });

  it('does not touch a booking for another day', async () => {
    const patient = await seedPatient();
    const future = (
      await book(body({ patientId: patient, scheduledOn: kabulDate(10) })).expect(201)
    ).body as AppointmentSummary;

    await request(server)
      .post('/reception/check-in')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        patientId: patient,
        visit: { type: 'opd_consult', departmentId: opdId, practitionerId: drOpdId },
        items: [{ serviceId: consultId, quantity: 1 }],
        paymentMethod: 'cash',
      })
      .expect(201);

    // Walking in today does not consume next month's appointment.
    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: future.id } });
    expect(after.status).toBe('booked');
  });

  it('a fulfilled booking reports the visit it became', async () => {
    const patient = await seedPatient();
    await book(body({ patientId: patient, scheduledOn: kabulDate(0) })).expect(201);

    await request(server)
      .post('/reception/check-in')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        patientId: patient,
        visit: { type: 'follow_up', departmentId: opdId, practitionerId: drOpdId },
        items: [{ serviceId: consultId, quantity: 1 }],
        paymentMethod: 'cash',
      })
      .expect(201);

    const found = (await list(`?date=${kabulDate(0)}&patientId=${patient}`).expect(200))
      .body as AppointmentListResponse;
    expect(found.appointments[0].status).toBe('fulfilled');
    expect(found.appointments[0].visitNo).toMatch(/^V-\d{4}-\d{4}$/);
  });
});
