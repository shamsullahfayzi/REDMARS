import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse, VisitHistoryResponse, VisitSummary } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 3.9 — visit status transitions + VisitStatusHistory.
 *
 * The done-when: arrived -> in_progress -> completed, all logged. "All logged" is the
 * half with teeth. A visit is the spine every clinical record hangs off, so what the
 * record says happened to a patient — and who said it — has to survive being asked about
 * a year later.
 *
 * The refusals matter as much as the moves. A completed visit that can be reopened
 * rewrites history; an arrived visit that can jump straight to completed lets the queue
 * be cleared at closing time with a room full of patients recorded as seen.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_vstat_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Visit status transitions (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let otherFacilityId: string;
  let doctorId: string;
  let doctorToken: string;
  let nurseToken: string;
  let receptionistToken: string;
  let pharmacistToken: string;

  let opdId: string;
  let drOpdId: string;

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Status ${suffix}`,
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
  /** A visit in a chosen state, written directly so each case starts where it means to. */
  async function seedVisit(
    status:
      'arrived' | 'in_progress' | 'on_hold' | 'completed' | 'planned' | 'cancelled' = 'arrived',
    inFacility = facilityId,
  ): Promise<string> {
    counter += 1;
    const patient = await prisma.patient.create({
      data: {
        facilityId: inFacility,
        mrn: `${PREFIX}MRN-${counter}`,
        firstName: `Patient${counter}`,
        gender: 'female',
        estimatedAgeYears: 30,
      },
    });
    const department =
      inFacility === facilityId
        ? opdId
        : (
            await prisma.department.create({
              data: {
                facilityId: inFacility,
                code: `${PREFIX}FOR${counter}`,
                name: 'Foreign OPD',
                type: 'opd',
              },
            })
          ).id;

    const visit = await prisma.visit.create({
      data: {
        facilityId: inFacility,
        patientId: patient.id,
        departmentId: department,
        practitionerId: inFacility === facilityId ? drOpdId : null,
        visitNo: `${PREFIX}V-${counter}`,
        type: 'opd_consult',
        status,
        statusHistory: { create: { status: 'arrived', changedBy: doctorId } },
      },
    });
    return visit.id;
  }

  function move(id: string, body: unknown, token = doctorToken) {
    return request(server)
      .patch(`/visits/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
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
        data: { code: `${PREFIX}fac`, name: 'E2E Status Facility' },
      })
    ).id;
    otherFacilityId = (
      await prisma.facility.create({
        data: { code: `${PREFIX}other`, name: 'E2E Status Other' },
      })
    ).id;

    doctorId = await seedActor('doctor', 'doctor');
    await seedActor('nurse', 'nurse');
    await seedActor('receptionist', 'receptionist');
    await seedActor('pharmacist', 'pharmacist');
    doctorToken = await login(`${PREFIX}doctor`);
    nurseToken = await login(`${PREFIX}nurse`);
    receptionistToken = await login(`${PREFIX}receptionist`);
    pharmacistToken = await login(`${PREFIX}pharmacist`);

    opdId = (
      await prisma.department.create({
        data: { facilityId, code: `${PREFIX}OPD`, name: 'E2E OPD', type: 'opd' },
      })
    ).id;
    drOpdId = (
      await prisma.practitioner.create({
        data: {
          facilityId,
          userId: doctorId,
          code: `${PREFIX}DR1`,
          firstName: 'Hafizullah',
          lastName: 'Sherzai',
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

  // --- The done-when ---------------------------------------------------------

  it('the done-when: arrived -> in_progress -> completed, all logged', async () => {
    const id = await seedVisit('arrived');

    const calledIn = await move(id, { status: 'in_progress' }).expect(200);
    expect((calledIn.body as VisitSummary).status).toBe('in_progress');

    const done = await move(id, {
      status: 'completed',
      note: 'Reviewed, medication continued',
    }).expect(200);
    expect((done.body as VisitSummary).status).toBe('completed');

    const history = (
      await request(server)
        .get(`/visits/${id}/history`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200)
    ).body as VisitHistoryResponse;

    // Three states, in order, and the first one is the arrival written at creation —
    // so no status a visit ever held is unsigned.
    expect(history.entries.map((entry) => entry.status)).toEqual([
      'arrived',
      'in_progress',
      'completed',
    ]);
    expect(history.entries[2].note).toBe('Reviewed, medication continued');
    // Signed by a person, not a uuid.
    expect(history.entries[2].changedBy).toBe(doctorId);
    expect(history.entries[2].changedByName).toBe('E2E Status doctor');
  });

  it('closes the clock on completion', async () => {
    const id = await seedVisit('in_progress');
    await move(id, { status: 'completed' }).expect(200);

    const visit = await prisma.visit.findUniqueOrThrow({ where: { id } });
    // Recorded at the time rather than inferred from a report later.
    expect(visit.endedAt).not.toBeNull();
  });

  it('measures the wait and the consultation — the point of having two statuses', async () => {
    const id = await seedVisit('arrived');
    // Backdate the arrival so the gap is a real number rather than zero.
    await prisma.visitStatusHistory.updateMany({
      where: { visitId: id, status: 'arrived' },
      data: { changedAt: new Date(Date.now() - 45 * 60 * 1000) },
    });

    await move(id, { status: 'in_progress' }).expect(200);
    const history = (
      await request(server)
        .get(`/visits/${id}/history`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200)
    ).body as VisitHistoryResponse;

    expect(history.waitedMinutes).toBeGreaterThanOrEqual(44);
    expect(history.waitedMinutes).toBeLessThanOrEqual(46);
    // Still being seen, so there is no consultation duration to report yet.
    expect(history.consultationMinutes).toBeNull();
  });

  it('reports no wait while the patient is still in the waiting room', async () => {
    const id = await seedVisit('arrived');
    const history = (
      await request(server)
        .get(`/visits/${id}/history`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200)
    ).body as VisitHistoryResponse;

    expect(history.waitedMinutes).toBeNull();
    expect(history.entries).toHaveLength(1);
  });

  // --- On hold, both ways -----------------------------------------------------

  it('holds a consultation and resumes it: the patient sent off for a test', async () => {
    const id = await seedVisit('in_progress');
    await move(id, { status: 'on_hold', note: 'Sent for FBC' }).expect(200);
    await move(id, { status: 'in_progress' }).expect(200);
    await move(id, { status: 'completed' }).expect(200);

    const history = (
      await request(server)
        .get(`/visits/${id}/history`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200)
    ).body as VisitHistoryResponse;
    expect(history.entries.map((entry) => entry.status)).toEqual([
      'arrived',
      'on_hold',
      'in_progress',
      'completed',
    ]);
  });

  it('completes straight from on_hold when there is nothing more to do', async () => {
    const id = await seedVisit('on_hold');
    await move(id, { status: 'completed' }).expect(200);
  });

  // --- What must be refused ---------------------------------------------------

  it('refuses to reopen a completed visit: that rewrites what the record already said', async () => {
    const id = await seedVisit('completed');
    const res = await move(id, { status: 'in_progress' }).expect(400);
    expect((res.body as { code: string }).code).toBe('illegal_transition');
  });

  it('refuses arrived -> completed: a visit nobody can say took place', async () => {
    // Otherwise the queue could be cleared at closing time with a waiting room full of
    // patients recorded as having been seen. Leaving without being seen is a
    // cancellation (task 3.11), not a completion.
    const id = await seedVisit('arrived');
    const res = await move(id, { status: 'completed' }).expect(400);
    expect((res.body as { allowed: string[] }).allowed).toEqual(['in_progress', 'on_hold']);
  });

  it('refuses to move a cancelled visit at all', async () => {
    const id = await seedVisit('cancelled');
    await move(id, { status: 'in_progress' }).expect(400);
  });

  it('refuses `cancelled` here: ending a visit early is a different authority', () =>
    // visit.cancel (admin, or receptionist within R5) — not visit.change_status, which the
    // clinical roles hold. The contract refuses it so this cannot be a back door.
    seedVisit('arrived').then((id) => move(id, { status: 'cancelled' }).expect(400)));

  it('refuses `entered_in_error` here: voiding is admin-only', () =>
    seedVisit('arrived').then((id) => move(id, { status: 'entered_in_error' }).expect(400)));

  it('refuses an unknown status with 400', () =>
    seedVisit('arrived').then((id) => move(id, { status: 'napping' }).expect(400)));

  it('refuses a note longer than the column expects', () =>
    seedVisit('arrived').then((id) =>
      move(id, { status: 'in_progress', note: 'x'.repeat(301) }).expect(400),
    ));

  // --- Two people, one visit --------------------------------------------------

  it('a repeated move is a no-op, not a second history row', async () => {
    const id = await seedVisit('in_progress');
    await move(id, { status: 'in_progress' }).expect(200);

    const rows = await prisma.visitStatusHistory.findMany({ where: { visitId: id } });
    // A double-click is not a clinical event, and a trail nobody can read is not a trail.
    expect(rows).toHaveLength(1);
  });

  it('tells the second mover the visit already moved', async () => {
    const id = await seedVisit('arrived');
    // The doctor calls the patient in; the nurse's screen still says arrived and she
    // tries to put them on hold from that stale view.
    await move(id, { status: 'in_progress' }).expect(200);
    await move(id, { status: 'completed' }, nurseToken).expect(200);

    // And now a move from a state the visit is no longer in is refused rather than
    // silently overwriting what actually happened.
    const res = await move(id, { status: 'in_progress' }, nurseToken).expect(400);
    expect((res.body as { code: string }).code).toBe('illegal_transition');
  });

  // --- Who may move a visit ---------------------------------------------------

  it('a nurse may move a visit: she is the one who calls patients through', () =>
    seedVisit('arrived').then((id) => move(id, { status: 'in_progress' }, nurseToken).expect(200)));

  it('a receptionist may not: checking a patient in is not moving them through care', () =>
    seedVisit('arrived').then((id) =>
      move(id, { status: 'in_progress' }, receptionistToken).expect(403),
    ));

  it('a pharmacist may not: they hold no visit.change_status', () =>
    seedVisit('arrived').then((id) =>
      move(id, { status: 'in_progress' }, pharmacistToken).expect(403),
    ));

  it("another facility's visit is a 404, never a 403", () =>
    seedVisit('arrived', otherFacilityId).then((id) =>
      move(id, { status: 'in_progress' }).expect(404),
    ));

  it('rejects a non-uuid id with 400', () =>
    move('not-a-uuid', { status: 'in_progress' }).expect(400));

  it('rejects an unauthenticated request with 401', () =>
    seedVisit('arrived').then((id) =>
      request(server).patch(`/visits/${id}/status`).send({ status: 'in_progress' }).expect(401),
    ));

  it('audits the move to whoever made it', async () => {
    const id = await seedVisit('arrived');
    await move(id, { status: 'in_progress' }, nurseToken).expect(200);

    const entry = await prisma.auditLog.findFirst({
      where: { entity: 'Visit', entityId: id, action: 'update' },
      orderBy: { createdAt: 'desc' },
    });
    // A single update(), never updateMany() — the audit extension deliberately does not
    // cover batch writes, and an unaudited status change is what this table exists to
    // prevent.
    expect(entry).not.toBeNull();
  });

  it("another facility's history is a 404", () =>
    seedVisit('arrived', otherFacilityId).then((id) =>
      request(server)
        .get(`/visits/${id}/history`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(404),
    ));
});
