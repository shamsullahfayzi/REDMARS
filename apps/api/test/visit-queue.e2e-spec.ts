import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse, QueueResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 3.7 — the doctor's queue.
 *
 * The done-when: a doctor sees TODAY'S arrived patients. Both halves are load-bearing.
 *
 * "Today" is a fact about Kabul, not about the server. At UTC+04:30 a visit started at
 * 01:00 local is still the previous day in UTC, and a naive boundary silently drops it
 * off the night shift's queue — the shift with the fewest people to notice. There is a
 * test for exactly that instant.
 *
 * "Arrived" means still in the building. A completed visit is history and belongs on the
 * record, not on the screen a doctor is deciding from.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_queue_';
const PASSWORD = 'e2e-test-password-not-a-secret';
const KABUL_OFFSET_MS = 4.5 * 60 * 60 * 1000;

describe('Doctor queue (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let receptionistToken: string;
  let doctorToken: string;
  let otherDoctorToken: string;
  let nurseToken: string;

  let opdId: string;
  let labId: string;
  let drOpdId: string;
  let drOtherId: string;

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Queue ${suffix}`,
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

  function getQueue(query = '', token = doctorToken) {
    return request(server).get(`/visits/queue${query}`).set('Authorization', `Bearer ${token}`);
  }

  /** Midnight today in Kabul, as the UTC instant it actually is. */
  function kabulMidnightUtc(): Date {
    const nowWall = new Date(Date.now() + KABUL_OFFSET_MS);
    const midnightWall = Date.UTC(
      nowWall.getUTCFullYear(),
      nowWall.getUTCMonth(),
      nowWall.getUTCDate(),
    );
    return new Date(midnightWall - KABUL_OFFSET_MS);
  }

  let patientCounter = 0;
  /** A visit written straight to the database, so its startedAt can be placed exactly. */
  async function seedVisit(options: {
    startedAt: Date;
    status?: 'arrived' | 'in_progress' | 'on_hold' | 'completed';
    practitionerId?: string | null;
    departmentId?: string;
    name?: string;
  }): Promise<string> {
    patientCounter += 1;
    const patient = await prisma.patient.create({
      data: {
        facilityId,
        mrn: `${PREFIX}MRN-${patientCounter}`,
        firstName: options.name ?? `Waiting${patientCounter}`,
        lastName: 'Patient',
        gender: 'female',
        estimatedAgeYears: 30,
        ageRecordedAt: new Date(),
      },
    });
    const visit = await prisma.visit.create({
      data: {
        facilityId,
        patientId: patient.id,
        departmentId: options.departmentId ?? opdId,
        practitionerId: options.practitionerId === undefined ? drOpdId : options.practitionerId,
        visitNo: `${PREFIX}V-${patientCounter}`,
        type: 'opd_consult',
        status: options.status ?? 'arrived',
        startedAt: options.startedAt,
        chiefComplaint: 'insomnia',
      },
    });
    return visit.id;
  }

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.visitStatusHistory.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visit.deleteMany({ where: facilityFilter });
    await prisma.patient.deleteMany({ where: facilityFilter });
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
      await prisma.facility.create({
        data: { code: `${PREFIX}fac`, name: 'E2E Queue Facility' },
      })
    ).id;

    const doctorUserId = await seedActor('doctor', 'doctor');
    const otherDoctorUserId = await seedActor('doctor2', 'doctor');
    await seedActor('receptionist', 'receptionist');
    await seedActor('nurse', 'nurse');
    doctorToken = await login(`${PREFIX}doctor`);
    otherDoctorToken = await login(`${PREFIX}doctor2`);
    receptionistToken = await login(`${PREFIX}receptionist`);
    nurseToken = await login(`${PREFIX}nurse`);

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

    // Linked to the logged-in doctor. This link is what makes "my queue" mean anything.
    drOpdId = (
      await prisma.practitioner.create({
        data: {
          facilityId,
          userId: doctorUserId,
          code: `${PREFIX}DR1`,
          firstName: 'Hafizullah',
          lastName: 'Sherzai',
          departments: { create: { departmentId: opdId } },
        },
      })
    ).id;
    drOtherId = (
      await prisma.practitioner.create({
        data: {
          facilityId,
          userId: otherDoctorUserId,
          code: `${PREFIX}DR2`,
          firstName: 'Wazhma',
          lastName: 'Karimi',
          departments: { create: { departmentId: opdId } },
        },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.visitStatusHistory.deleteMany({
      where: { visit: { facility: { code: { startsWith: PREFIX } } } },
    });
    await prisma.visit.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.patient.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
  });

  // --- The done-when ---------------------------------------------------------

  it("the done-when: a doctor sees today's arrived patients, and only their own", async () => {
    const now = new Date();
    await seedVisit({ startedAt: now, name: 'Mine' });
    await seedVisit({ startedAt: now, practitionerId: drOtherId, name: 'Hers' });

    const res = await getQueue().expect(200);
    const queue = res.body as QueueResponse;

    expect(queue.entries).toHaveLength(1);
    expect(queue.entries[0].patientName).toContain('Mine');
    expect(queue.entries[0].status).toBe('arrived');
    // The server resolved the scope from the logged-in doctor's practitioner record.
    expect(queue.scope.mine).toBe(true);
    expect(queue.scope.practitionerId).toBe(drOpdId);
  });

  it('carries what decides who to call next: name, age, complaint and the wait', async () => {
    const fortyMinutesAgo = new Date(Date.now() - 40 * 60 * 1000);
    await seedVisit({ startedAt: fortyMinutesAgo });

    const queue = (await getQueue().expect(200)).body as QueueResponse;
    const entry = queue.entries[0];

    expect(entry.patientMrn).toContain('MRN');
    expect(entry.ageYears).toBe(30);
    expect(entry.gender).toBe('female');
    expect(entry.chiefComplaint).toBe('insomnia');
    // Computed by the SERVER — a shared workstation's clock is frequently wrong, and
    // this is the number that decides who is seen next.
    expect(entry.waitedMinutes).toBeGreaterThanOrEqual(39);
    expect(entry.waitedMinutes).toBeLessThanOrEqual(41);
  });

  it('orders by arrival, longest wait first', async () => {
    const now = Date.now();
    await seedVisit({ startedAt: new Date(now - 5 * 60 * 1000), name: 'Recent' });
    await seedVisit({ startedAt: new Date(now - 90 * 60 * 1000), name: 'Longest' });
    await seedVisit({ startedAt: new Date(now - 30 * 60 * 1000), name: 'Middle' });

    const queue = (await getQueue().expect(200)).body as QueueResponse;
    // A queue that is not ordered by arrival is a list, and someone waits all morning.
    expect(queue.entries.map((entry) => entry.patientName.split(' ')[0])).toEqual([
      'Longest',
      'Middle',
      'Recent',
    ]);
  });

  // --- "Today" is a fact about Kabul ------------------------------------------

  it('a visit just after local midnight is on TODAY, not yesterday', async () => {
    // 00:30 Kabul today. In UTC that is 20:00 YESTERDAY — the exact instant a naive
    // boundary loses a patient on the night shift.
    const justAfterMidnight = new Date(kabulMidnightUtc().getTime() + 30 * 60 * 1000);
    if (justAfterMidnight.getTime() > Date.now()) {
      // The run is itself before 00:30 Kabul; the case cannot be staged today.
      return;
    }
    await seedVisit({ startedAt: justAfterMidnight, name: 'Midnight' });

    const queue = (await getQueue().expect(200)).body as QueueResponse;
    expect(queue.entries.map((entry) => entry.patientName)).toContainEqual(
      expect.stringContaining('Midnight'),
    );
  });

  it('a visit just before local midnight belongs to yesterday, not today', async () => {
    const justBeforeMidnight = new Date(kabulMidnightUtc().getTime() - 30 * 60 * 1000);
    await seedVisit({ startedAt: justBeforeMidnight, name: 'Yesterday' });

    const today = (await getQueue().expect(200)).body as QueueResponse;
    expect(today.entries).toHaveLength(0);

    // And it is findable on the day it actually happened.
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kabul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(justBeforeMidnight);
    const yesterday = (await getQueue(`?date=${date}`).expect(200)).body as QueueResponse;
    expect(yesterday.entries).toHaveLength(1);
    expect(yesterday.date).toBe(date);
  });

  it('rejects a malformed date with 400', () => getQueue('?date=21-07-2026').expect(400));

  // --- What counts as still waiting -------------------------------------------

  it('hides a completed visit: that is history, not a queue', async () => {
    const now = new Date();
    await seedVisit({ startedAt: now, status: 'arrived', name: 'Waiting' });
    await seedVisit({ startedAt: now, status: 'completed', name: 'Done' });
    await seedVisit({ startedAt: now, status: 'in_progress', name: 'Inside' });
    await seedVisit({ startedAt: now, status: 'on_hold', name: 'Held' });

    const queue = (await getQueue().expect(200)).body as QueueResponse;
    const names = queue.entries.map((entry) => entry.patientName.split(' ')[0]);
    expect(names).toEqual(expect.arrayContaining(['Waiting', 'Inside', 'Held']));
    expect(names).not.toContain('Done');
  });

  it('counts the whole day regardless of the filter, so the header says what is hidden', async () => {
    const now = new Date();
    await seedVisit({ startedAt: now, status: 'arrived' });
    await seedVisit({ startedAt: now, status: 'arrived' });
    await seedVisit({ startedAt: now, status: 'completed' });

    const queue = (await getQueue().expect(200)).body as QueueResponse;
    expect(queue.entries).toHaveLength(2);
    expect(queue.counts.arrived).toBe(2);
    expect(queue.counts.completed).toBe(1);
  });

  it('shows the closed ones when asked', async () => {
    const now = new Date();
    await seedVisit({ startedAt: now, status: 'arrived' });
    await seedVisit({ startedAt: now, status: 'completed' });

    const queue = (await getQueue('?includeClosed=true').expect(200)).body as QueueResponse;
    expect(queue.entries).toHaveLength(2);
  });

  it('filters to one status when asked', async () => {
    const now = new Date();
    await seedVisit({ startedAt: now, status: 'arrived' });
    await seedVisit({ startedAt: now, status: 'in_progress' });

    const queue = (await getQueue('?status=in_progress').expect(200)).body as QueueResponse;
    expect(queue.entries).toHaveLength(1);
    expect(queue.entries[0].status).toBe('in_progress');
  });

  // --- Whose queue ------------------------------------------------------------

  it("a doctor may look at a colleague's queue — that is how a clinic covers", async () => {
    await seedVisit({ startedAt: new Date(), practitionerId: drOtherId, name: 'Hers' });

    const queue = (await getQueue(`?practitionerId=${drOtherId}`).expect(200))
      .body as QueueResponse;
    expect(queue.entries).toHaveLength(1);
    // Explicitly asked for, so not "mine" — the screen should not claim otherwise.
    expect(queue.scope.mine).toBe(false);
  });

  it('a receptionist with no practitioner record sees the whole facility', async () => {
    const now = new Date();
    await seedVisit({ startedAt: now, practitionerId: drOpdId });
    await seedVisit({ startedAt: now, practitionerId: drOtherId });
    await seedVisit({ startedAt: now, practitionerId: null, departmentId: labId });

    const queue = (await getQueue('', receptionistToken).expect(200)).body as QueueResponse;
    expect(queue.entries).toHaveLength(3);
    expect(queue.scope.mine).toBe(false);
    expect(queue.scope.practitionerId).toBeNull();
  });

  it('narrows to a department when asked', async () => {
    const now = new Date();
    await seedVisit({ startedAt: now, departmentId: opdId, practitionerId: null });
    await seedVisit({ startedAt: now, departmentId: labId, practitionerId: null });

    const queue = (await getQueue(`?departmentId=${labId}`, receptionistToken).expect(200))
      .body as QueueResponse;
    expect(queue.entries).toHaveLength(1);
    expect(queue.entries[0].departmentName).toBe('E2E Lab');
  });

  it('a walk-in with no doctor still reaches the department queue', async () => {
    await seedVisit({ startedAt: new Date(), practitionerId: null, departmentId: labId });

    const queue = (await getQueue('', nurseToken).expect(200)).body as QueueResponse;
    expect(queue.entries).toHaveLength(1);
    expect(queue.entries[0].practitionerName).toBeNull();
  });

  it('the second doctor sees their own list, not the first doctor’s', async () => {
    const now = new Date();
    await seedVisit({ startedAt: now, practitionerId: drOpdId, name: 'His' });
    await seedVisit({ startedAt: now, practitionerId: drOtherId, name: 'Hers' });

    const queue = (await getQueue('', otherDoctorToken).expect(200)).body as QueueResponse;
    expect(queue.entries).toHaveLength(1);
    expect(queue.entries[0].patientName).toContain('Hers');
  });

  // --- Access -----------------------------------------------------------------

  it('a nurse may read the queue: knowing who is waiting is not clinical detail', async () => {
    await seedVisit({ startedAt: new Date(), practitionerId: null });
    await getQueue('', nurseToken).expect(200);
  });

  it('rejects an unauthenticated request with 401', () =>
    request(server).get('/visits/queue').expect(401));

  it('does not swallow /visits/:id — route order still holds', async () => {
    const visitId = await seedVisit({ startedAt: new Date() });
    const res = await request(server)
      .get(`/visits/${visitId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);
    expect((res.body as { id: string }).id).toBe(visitId);
  });
});
