import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse, ReassignPractitionerResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Fixing who a visit is booked under, under the same rule R5 as `visit.cancel`.
 *
 * "Allowed same-day, before the next step has occurred. Outside the window → admin
 * only. All logged with a mandatory reason." The next step here is the doctor actually
 * starting the consult — once that has happened, moving the visit to someone else is an
 * administrator's call, not the desk's.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_vreas_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Visit reassign practitioner (e2e)', () => {
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
  let labId: string;
  let drOpdId: string;
  let drOpdSecondId: string;
  let drLabOnlyId: string;
  let drRetiredId: string;

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Reassign ${suffix}`,
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
    status: 'planned' | 'arrived' | 'in_progress' | 'completed' | 'cancelled' = 'arrived',
    inFacility = facilityId,
    departmentId = opdId,
    practitionerId: string | null = drOpdId,
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
    const visit = await prisma.visit.create({
      data: {
        facilityId: inFacility,
        patientId: patient.id,
        departmentId,
        practitionerId,
        visitNo: `${PREFIX}V-${counter}`,
        type: 'opd_consult',
        status,
        statusHistory: { create: { status: 'arrived', changedBy: receptionistId } },
      },
    });
    return visit.id;
  }

  function reassign(id: string, body: unknown, token = receptionistToken) {
    return request(server)
      .post(`/visits/${id}/reassign-practitioner`)
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
        data: { code: `${PREFIX}fac`, name: 'E2E Reassign Facility' },
      })
    ).id;
    otherFacilityId = (
      await prisma.facility.create({ data: { code: `${PREFIX}other`, name: 'E2E Reassign Other' } })
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
    labId = (
      await prisma.department.create({
        data: { facilityId, code: `${PREFIX}LAB`, name: 'E2E Lab', type: 'laboratory' },
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
    drOpdSecondId = (
      await prisma.practitioner.create({
        data: {
          facilityId,
          code: `${PREFIX}DR2`,
          firstName: 'Zahra',
          lastName: 'Noori',
          departments: { create: { departmentId: opdId } },
        },
      })
    ).id;
    drLabOnlyId = (
      await prisma.practitioner.create({
        data: {
          facilityId,
          code: `${PREFIX}DR3`,
          firstName: 'Wazhma',
          lastName: 'Karimi',
          departments: { create: { departmentId: labId } },
        },
      })
    ).id;
    drRetiredId = (
      await prisma.practitioner.create({
        data: {
          facilityId,
          code: `${PREFIX}DR4`,
          firstName: 'Old',
          lastName: 'Timer',
          isActive: false,
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

  it('the done-when: the desk moves a visit to another doctor, and it logs why', async () => {
    const id = await seedVisit('arrived');

    const res = await reassign(id, {
      practitionerId: drOpdSecondId,
      reason: 'Dr. Sherzai called in sick',
    }).expect(200);
    const out = res.body as ReassignPractitionerResponse;

    expect(out.visit.practitionerId).toBe(drOpdSecondId);
    expect(out.visit.status).toBe('arrived');

    const history = await prisma.visitStatusHistory.findFirst({
      where: { visitId: id, changedBy: receptionistId },
      orderBy: { changedAt: 'desc' },
    });
    expect(history?.note).toContain('Zahra Noori');
    expect(history?.note).toContain('Dr. Sherzai called in sick');
  });

  // --- R5, clause by clause ---------------------------------------------------

  it('R5: a reason is mandatory', async () => {
    const id = await seedVisit('arrived');
    await reassign(id, { practitionerId: drOpdSecondId }).expect(400);
    await reassign(id, { practitionerId: drOpdSecondId, reason: '  ' }).expect(400);
    await reassign(id, { practitionerId: drOpdSecondId, reason: 'Covering shift' }).expect(200);
  });

  it('R5: the desk cannot reassign a visit from another day — admin only', async () => {
    const id = await seedVisit('arrived');
    await prisma.visit.update({
      where: { id },
      data: { startedAt: new Date(Date.now() - 36 * 60 * 60 * 1000) },
    });

    const refused = await reassign(id, {
      practitionerId: drOpdSecondId,
      reason: 'Late correction',
    }).expect(403);
    expect((refused.body as { code: string }).code).toBe('outside_r5_window');

    await reassign(
      id,
      { practitionerId: drOpdSecondId, reason: 'Late correction' },
      adminToken,
    ).expect(200);
  });

  it('R5: the desk cannot reassign once the doctor has called the patient in', async () => {
    const id = await seedVisit('arrived');
    await request(server)
      .patch(`/visits/${id}/status`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ status: 'in_progress' })
      .expect(200);

    const refused = await reassign(id, {
      practitionerId: drOpdSecondId,
      reason: 'Too late',
    }).expect(403);
    expect((refused.body as { code: string }).code).toBe('next_step_occurred');

    await reassign(
      id,
      { practitionerId: drOpdSecondId, reason: 'Patient asked for a second opinion mid-consult' },
      adminToken,
    ).expect(200);
  });

  // --- What must be refused ---------------------------------------------------

  it('refuses an unknown practitioner', async () => {
    const id = await seedVisit('arrived');
    await reassign(id, {
      practitionerId: '00000000-0000-0000-0000-000000000000',
      reason: 'Typo',
    }).expect(400);
  });

  it('refuses a deactivated practitioner', async () => {
    const id = await seedVisit('arrived');
    await reassign(id, { practitionerId: drRetiredId, reason: 'Retired' }).expect(400);
  });

  it("refuses a practitioner who does not work in the visit's department", async () => {
    const id = await seedVisit('arrived');
    await reassign(id, {
      practitionerId: drLabOnlyId,
      reason: 'Wrong department entirely',
    }).expect(400);
  });

  it('refuses to reassign a completed visit', async () => {
    const id = await seedVisit('completed');
    const res = await reassign(
      id,
      {
        practitionerId: drOpdSecondId,
        reason: 'Too late',
      },
      adminToken,
    ).expect(400);
    expect((res.body as { code: string }).code).toBe('illegal_transition');
  });

  it('refuses to reassign a cancelled visit', async () => {
    const id = await seedVisit('cancelled');
    await reassign(id, { practitionerId: drOpdSecondId, reason: 'Too late' }, adminToken).expect(
      400,
    );
  });

  // --- Who may do it ----------------------------------------------------------

  it('denies a doctor: reassigning is the desk and the administrator', async () => {
    const id = await seedVisit('arrived');
    await reassign(
      id,
      { practitionerId: drOpdSecondId, reason: 'Not mine to do' },
      doctorToken,
    ).expect(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const id = await seedVisit('arrived');
    await request(server)
      .post(`/visits/${id}/reassign-practitioner`)
      .send({ practitionerId: drOpdSecondId, reason: 'Anonymous' })
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

    await reassign(
      foreign.id,
      { practitionerId: drOpdSecondId, reason: 'Not ours' },
      adminToken,
    ).expect(404);
  });

  it('rejects a non-uuid id with 400', () =>
    reassign('not-a-uuid', { practitionerId: drOpdSecondId, reason: 'x y z' }).expect(400));

  it('audits the reassignment to whoever made it', async () => {
    const id = await seedVisit('arrived');
    await reassign(
      id,
      { practitionerId: drOpdSecondId, reason: 'Patient left' },
      adminToken,
    ).expect(200);

    const entry = await prisma.auditLog.findFirst({
      where: { entity: 'Visit', entityId: id, action: 'update' },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry?.userId).toBe(adminId);
  });
});
