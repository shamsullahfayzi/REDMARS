import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse, VitalsListResponse, VitalsReading } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 4.3 — vitals.
 *
 * Optional by design: Farhat has no nurse taking observations, and a psychiatric
 * follow-up where nothing physical is measured is a complete consultation. So the only
 * rule about presence is that a reading holds at least one measurement.
 *
 * The bounds are PHYSIOLOGICALLY POSSIBLE, not normal, and one test exists purely to hold
 * that line: 240/130 is a hypertensive crisis and must go in. A contract that refused it
 * would reject the single reading that most needed recording.
 *
 * And a reading is APPENDED. A re-taken blood pressure is a second reading, not an edit of
 * the first — R4, and the trend inside one visit is clinical information.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_vitals_';
const PASSWORD = 'e2e-test-password-not-a-secret';

/**
 * The R1 read row is written FIRE-AND-FORGET by the audit interceptor, because R1 says a
 * clinical read is never blocked — including by its own logging. So a test that asserts it
 * has to wait for it rather than assume it has landed, or it passes alone and fails under
 * load, which is the worst kind of test.
 */
async function eventually<T>(read: () => Promise<T[]>, tries = 40): Promise<T[]> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const rows = await read();
    if (rows.length > 0) return rows;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return read();
}

describe('Vitals (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let otherFacilityId: string;
  let doctorId: string;
  let opdId: string;

  const tokens: Record<string, string> = {};

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Vitals ${suffix}`,
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
  async function stageVisit(
    options: { status?: 'arrived' | 'in_progress' | 'completed'; facility?: string } = {},
  ): Promise<string> {
    counter += 1;
    const inFacility = options.facility ?? facilityId;
    const patient = await prisma.patient.create({
      data: {
        facilityId: inFacility,
        mrn: `${PREFIX}MRN${counter}`,
        firstName: `Wali${counter}`,
        gender: 'male',
        estimatedAgeYears: 41,
        ageRecordedAt: new Date(),
      },
    });
    const visit = await prisma.visit.create({
      data: {
        facilityId: inFacility,
        patientId: patient.id,
        departmentId: opdId,
        visitNo: `${PREFIX}V${counter}`,
        type: 'opd_consult',
        status: options.status ?? 'in_progress',
        statusHistory: { create: { status: 'arrived', changedBy: doctorId } },
      },
    });
    return visit.id;
  }

  const post = (visitId: string, body: unknown, as = 'doctor') =>
    request(server)
      .post(`/visits/${visitId}/vitals`)
      .set('Authorization', `Bearer ${tokens[as]}`)
      .send(body);

  const get = (visitId: string, as = 'doctor') =>
    request(server).get(`/visits/${visitId}/vitals`).set('Authorization', `Bearer ${tokens[as]}`);

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.vitals.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visitStatusHistory.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visit.deleteMany({ where: facilityFilter });
    await prisma.patient.deleteMany({ where: facilityFilter });
    await prisma.department.deleteMany({ where: { code: { startsWith: PREFIX } } });
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
      await prisma.facility.create({ data: { code: `${PREFIX}fac`, name: 'E2E Vitals Facility' } })
    ).id;
    otherFacilityId = (
      await prisma.facility.create({ data: { code: `${PREFIX}other`, name: 'E2E Vitals Other' } })
    ).id;

    doctorId = await seedActor('doctor', 'doctor');
    await seedActor('nurse', 'nurse');
    await seedActor('admin', 'admin');
    await seedActor('receptionist', 'receptionist');
    await seedActor('pharmacist', 'pharmacist');

    opdId = (
      await prisma.department.create({
        data: { facilityId, code: `${PREFIX}OPD`, name: 'E2E OPD', type: 'opd' },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  // --- The done-when ---------------------------------------------------------

  it('the done-when: BP, pulse and weight saved to the visit', async () => {
    const visitId = await stageVisit();

    const created = await post(visitId, {
      systolicBp: 128,
      diastolicBp: 82,
      pulse: 76,
      weightKg: 71.5,
    }).expect(201);

    const reading = created.body as VitalsReading;
    expect(reading.visitId).toBe(visitId);
    expect(reading.systolicBp).toBe(128);
    expect(reading.diastolicBp).toBe(82);
    expect(reading.pulse).toBe(76);
    expect(reading.weightKg).toBe('71.5');
    expect(reading.recordedBy).toBe(doctorId);

    const listed = await get(visitId).expect(200);
    expect((listed.body as VitalsListResponse).readings).toHaveLength(1);
    expect((listed.body as VitalsListResponse).readings[0].id).toBe(reading.id);
  });

  it('names who took the reading, not just when', async () => {
    const visitId = await stageVisit();
    await post(visitId, { pulse: 66 }).expect(201);

    const listed = await get(visitId).expect(200);
    expect((listed.body as VitalsListResponse).readings[0].recordedByName).toBe(
      'E2E Vitals doctor',
    );
  });

  // --- Appended, never edited -------------------------------------------------

  it('a re-taken blood pressure APPENDS — the first reading is not overwritten', async () => {
    const visitId = await stageVisit();

    await post(visitId, { systolicBp: 168, diastolicBp: 104 }).expect(201);
    await post(visitId, { systolicBp: 142, diastolicBp: 90 }).expect(201);

    const listed = await get(visitId).expect(200);
    const { readings } = listed.body as VitalsListResponse;
    expect(readings).toHaveLength(2);
    // Newest first: what the patient is now, with what they were earlier underneath.
    expect(readings[0].systolicBp).toBe(142);
    expect(readings[1].systolicBp).toBe(168);
  });

  it('offers no way to change or remove a reading', async () => {
    const visitId = await stageVisit();
    const created = await post(visitId, { pulse: 70 }).expect(201);
    const id = (created.body as VitalsReading).id;

    await request(server)
      .patch(`/visits/${visitId}/vitals/${id}`)
      .set('Authorization', `Bearer ${tokens.doctor}`)
      .send({ pulse: 71 })
      .expect(404);
    await request(server)
      .delete(`/visits/${visitId}/vitals/${id}`)
      .set('Authorization', `Bearer ${tokens.doctor}`)
      .expect(404);
  });

  // --- What the numbers actually are ------------------------------------------

  it('reports what was STORED, at the column’s own scale', async () => {
    const visitId = await stageVisit();

    // temperature_c is Decimal(4,1) and weight_kg is Decimal(5,2): the database decides
    // how many places a measurement has, and the response says so rather than echoing
    // back what was sent.
    const created = await post(visitId, { temperatureC: 37.25, weightKg: 68.456 }).expect(201);
    const reading = created.body as VitalsReading;
    expect(reading.temperatureC).toBe('37.3');
    expect(reading.weightKg).toBe('68.46');
  });

  it('an empty box means NOT MEASURED, never zero', async () => {
    const visitId = await stageVisit();

    // Exactly what a form hands back for a field the doctor skipped. A blank that became
    // 0 would record a patient with no pulse.
    const created = await post(visitId, {
      systolicBp: '',
      diastolicBp: '',
      pulse: '80',
      temperatureC: '   ',
      weightKg: null,
    }).expect(201);

    const reading = created.body as VitalsReading;
    expect(reading.pulse).toBe(80);
    expect(reading.systolicBp).toBeNull();
    expect(reading.temperatureC).toBeNull();
    expect(reading.weightKg).toBeNull();
  });

  it('accepts a reading that is alarming but possible — 240/130 is a crisis, not a typo', async () => {
    const visitId = await stageVisit();
    const created = await post(visitId, { systolicBp: 240, diastolicBp: 130 }).expect(201);
    expect((created.body as VitalsReading).systolicBp).toBe(240);
  });

  it('refuses the typo it exists to catch — 1200 over 80', async () => {
    const visitId = await stageVisit();
    await post(visitId, { systolicBp: 1200, diastolicBp: 80 }).expect(400);
  });

  it('refuses an impossible oxygen saturation', async () => {
    const visitId = await stageVisit();
    await post(visitId, { spo2: 140 }).expect(400);
  });

  it('refuses a reading with nothing in it', async () => {
    const visitId = await stageVisit();
    await post(visitId, {}).expect(400);
    await post(visitId, { systolicBp: '', pulse: '' }).expect(400);
  });

  it('refuses half a blood pressure — the missing half gets assumed normal', async () => {
    const visitId = await stageVisit();
    await post(visitId, { systolicBp: 130 }).expect(400);
    await post(visitId, { diastolicBp: 85 }).expect(400);
  });

  it('refuses a blood pressure the wrong way round', async () => {
    const visitId = await stageVisit();
    await post(visitId, { systolicBp: 80, diastolicBp: 120 }).expect(400);
  });

  it('refuses text where a number goes', async () => {
    const visitId = await stageVisit();
    await post(visitId, { pulse: '7o' }).expect(400);
  });

  // --- When --------------------------------------------------------------------

  it('refuses to record against a closed visit — that is backdating an observation', async () => {
    const visitId = await stageVisit({ status: 'completed' });
    const res = await post(visitId, { pulse: 72 }).expect(400);
    expect((res.body as { code?: string }).code).toBe('visit_closed');
  });

  it('records against a visit the patient has only just arrived for', async () => {
    const visitId = await stageVisit({ status: 'arrived' });
    await post(visitId, { pulse: 72 }).expect(201);
  });

  // --- Who ---------------------------------------------------------------------

  it('the nurse may record them — the matrix grants it whether or not Farhat has one', async () => {
    const visitId = await stageVisit();
    await post(visitId, { pulse: 74 }, 'nurse').expect(201);
  });

  it('the admin may READ but never RECORD — R2 in one pair of assertions', async () => {
    const visitId = await stageVisit();
    await post(visitId, { pulse: 74 }).expect(201);

    await get(visitId, 'admin').expect(200);
    await post(visitId, { pulse: 75 }, 'admin').expect(403);
  });

  it('the receptionist sees nothing clinical', async () => {
    const visitId = await stageVisit();
    await get(visitId, 'receptionist').expect(403);
    await post(visitId, { pulse: 74 }, 'receptionist').expect(403);
  });

  it('the pharmacist sees nothing here either — R6 is drugs and allergies', async () => {
    const visitId = await stageVisit();
    await get(visitId, 'pharmacist').expect(403);
  });

  it('rejects an anonymous request', async () => {
    const visitId = await stageVisit();
    await request(server).get(`/visits/${visitId}/vitals`).expect(401);
  });

  // --- Audit and boundaries -----------------------------------------------------

  it('audits the read against the visit, and the write against the row', async () => {
    const visitId = await stageVisit();
    const created = await post(visitId, { pulse: 88 }).expect(201);
    await get(visitId).expect(200);

    const reads = await eventually(() =>
      prisma.auditLog.findMany({
        where: { action: AuditAction.read, entity: 'Vitals', entityId: visitId },
      }),
    );
    expect(reads).toHaveLength(1);
    expect(reads[0].userId).toBe(doctorId);

    // The write is audited by the Prisma extension, not by the interceptor.
    const writes = await prisma.auditLog.findMany({
      where: {
        action: AuditAction.create,
        entity: 'Vitals',
        entityId: (created.body as VitalsReading).id,
      },
    });
    expect(writes).toHaveLength(1);
    expect(writes[0].userId).toBe(doctorId);
  });

  it("404s on another facility's visit", async () => {
    const visitId = await stageVisit({ facility: otherFacilityId });
    await get(visitId).expect(404);
    await post(visitId, { pulse: 70 }).expect(404);
  });

  it('404s on a visit that does not exist', async () => {
    await get(randomUUID()).expect(404);
  });

  it('400s on an id that is not a uuid', async () => {
    await get('not-a-uuid').expect(400);
  });
});
