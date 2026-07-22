import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  LoginResponse,
  PatientSummary,
  VisitOptionsResponse,
  VisitSummary,
} from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 3.5 — visit create. Needs a seeded database (roles).
 *
 * The done-when: a visit exists with status `arrived`. That status is the whole point —
 * it is what the doctor's queue (task 3.7) reads, so a visit that lands in any other
 * state is a patient nobody is waiting for.
 *
 * The rest guards what is silently wrong rather than loudly broken: a doctor filed under
 * a department he does not work in (the queue index would hide him), a second visit for
 * one arrival (two queue rows, and at task 3.6 two invoices), and a visit number burnt
 * on a request that was always going to fail — a gapless sequence with a hole in it is
 * worse than no sequence at all.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_visit_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Visit create (e2e)', () => {
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
  let drLabOnlyId: string;
  let drRetiredId: string;

  let patientId: string;
  let otherPatientId: string;
  let foreignPatientId: string;

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Visit ${suffix}`,
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

  /** A complete, valid visit body. Overrides make each case say only what it is testing. */
  function body(overrides: Record<string, unknown> = {}) {
    return {
      patientId,
      type: 'opd_consult',
      departmentId: opdId,
      practitionerId: drOpdId,
      ...overrides,
    };
  }

  function post(payload: unknown, token = receptionistToken) {
    return request(server).post('/visits').set('Authorization', `Bearer ${token}`).send(payload);
  }

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.visitStatusHistory.deleteMany({
      where: { visit: facilityFilter },
    });
    await prisma.visit.deleteMany({ where: facilityFilter });
    await prisma.patientIdentifier.deleteMany({ where: { patient: facilityFilter } });
    await prisma.patient.deleteMany({ where: facilityFilter });
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

    const facility = await prisma.facility.create({
      data: { code: `${PREFIX}fac`, name: 'E2E Visit Facility' },
    });
    facilityId = facility.id;
    const other = await prisma.facility.create({
      data: { code: `${PREFIX}other`, name: 'E2E Visit Other Facility' },
    });
    otherFacilityId = other.id;

    receptionistId = await seedActor('receptionist', 'receptionist');
    await seedActor('doctor', 'doctor');
    await seedActor('admin', 'admin');
    receptionistToken = await login(`${PREFIX}receptionist`);
    doctorToken = await login(`${PREFIX}doctor`);
    adminToken = await login(`${PREFIX}admin`);

    const opd = await prisma.department.create({
      data: { facilityId, code: `${PREFIX}OPD`, name: 'E2E OPD', type: 'opd' },
    });
    const lab = await prisma.department.create({
      data: { facilityId, code: `${PREFIX}LAB`, name: 'E2E Laboratory', type: 'laboratory' },
    });
    const closed = await prisma.department.create({
      data: {
        facilityId,
        code: `${PREFIX}OLD`,
        name: 'E2E Closed Clinic',
        type: 'opd',
        isActive: false,
      },
    });
    opdId = opd.id;
    labId = lab.id;
    closedDeptId = closed.id;

    // Works OPD only. Booking him into the laboratory must fail.
    const drOpd = await prisma.practitioner.create({
      data: {
        facilityId,
        code: `${PREFIX}DR1`,
        firstName: 'Hafizullah',
        lastName: 'Sherzai',
        departments: { create: { departmentId: opdId } },
      },
    });
    const drLabOnly = await prisma.practitioner.create({
      data: {
        facilityId,
        code: `${PREFIX}DR2`,
        firstName: 'Wazhma',
        lastName: 'Karimi',
        departments: { create: { departmentId: labId } },
      },
    });
    const drRetired = await prisma.practitioner.create({
      data: {
        facilityId,
        code: `${PREFIX}DR3`,
        firstName: 'Retired',
        lastName: 'Consultant',
        isActive: false,
        departments: { create: { departmentId: opdId } },
      },
    });
    drOpdId = drOpd.id;
    drLabOnlyId = drLabOnly.id;
    drRetiredId = drRetired.id;

    const created = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        firstName: 'Najila',
        lastName: 'Ahmadi',
        gender: 'female',
        phone: '0700990001',
        estimatedAgeYears: 30,
      })
      .expect(201);
    patientId = (created.body as PatientSummary).id;

    const second = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        firstName: 'Zahra',
        lastName: 'Noori',
        gender: 'female',
        phone: '0700990002',
        estimatedAgeYears: 24,
      })
      .expect(201);
    otherPatientId = (second.body as PatientSummary).id;

    // Belongs to the other facility. Seeded directly — the API has no way to create one
    // outside the caller's own facility, which is the point.
    const foreign = await prisma.patient.create({
      data: {
        facilityId: otherFacilityId,
        mrn: `${PREFIX}MRN-1`,
        firstName: 'Elsewhere',
        gender: 'male',
        estimatedAgeYears: 41,
      },
    });
    foreignPatientId = foreign.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  // --- The done-when ---------------------------------------------------------

  it('the done-when: a receptionist starts a visit and it exists with status arrived', async () => {
    const res = await post(body({ chiefComplaint: 'insomnia, low mood' })).expect(201);

    const visit = res.body as VisitSummary;
    expect(visit.status).toBe('arrived');
    expect(visit.visitNo).toMatch(/^V-\d{4}-\d{4}$/);
    expect(visit.patientId).toBe(patientId);
    expect(visit.departmentName).toBe('E2E OPD');
    expect(visit.practitionerName).toBe('Hafizullah Sherzai');
    expect(visit.chiefComplaint).toBe('insomnia, low mood');

    // And it is on the record, not just in the response.
    const read = await request(server)
      .get(`/visits/${visit.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);
    expect((read.body as VisitSummary).status).toBe('arrived');
  });

  it('writes the opening status history row, signed by whoever started the visit', async () => {
    const res = await post(body({ patientId: otherPatientId, acknowledgeOpenVisit: true })).expect(
      201,
    );

    const history = await prisma.visitStatusHistory.findMany({
      where: { visitId: (res.body as VisitSummary).id },
    });
    // The first status a visit ever held has a named author, same as every later one.
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('arrived');
    expect(history[0].changedBy).toBe(receptionistId);
  });

  it('issues visit numbers in sequence', async () => {
    const first = await post(body({ acknowledgeOpenVisit: true })).expect(201);
    const second = await post(body({ acknowledgeOpenVisit: true })).expect(201);

    const a = Number((first.body as VisitSummary).visitNo.split('-')[2]);
    const b = Number((second.body as VisitSummary).visitNo.split('-')[2]);
    expect(b).toBe(a + 1);
  });

  it('records the referral, which is who sends this hospital patients', async () => {
    const res = await post(
      body({
        acknowledgeOpenVisit: true,
        referredBy: 'Dr. Ahmad Zia',
        referralSource: 'Kabul Mental Health Clinic',
      }),
    ).expect(201);

    const visit = res.body as VisitSummary;
    expect(visit.referredBy).toBe('Dr. Ahmad Zia');
    expect(visit.referralSource).toBe('Kabul Mental Health Clinic');
  });

  it('accepts a walk-in lab visit with no doctor at all', async () => {
    const res = await post({
      patientId,
      type: 'walk_in_lab',
      departmentId: labId,
      practitionerId: null,
    }).expect(201);

    const visit = res.body as VisitSummary;
    expect(visit.practitionerId).toBeNull();
    expect(visit.practitionerName).toBeNull();
    expect(visit.status).toBe('arrived');
  });

  // --- What the desk is not allowed to file -----------------------------------

  it('refuses an ipd visit: admission is a ward flow, not a dropdown at the desk', () =>
    post(body({ type: 'ipd', acknowledgeOpenVisit: true })).expect(400));

  it('refuses an unknown visit type with 400', () =>
    post(body({ type: 'astrology', acknowledgeOpenVisit: true })).expect(400));

  it('refuses a visit with no department', () =>
    post({ patientId, type: 'opd_consult' }).expect(400));

  it('refuses a deactivated department: it is history, not a destination', () =>
    post(
      body({ departmentId: closedDeptId, practitionerId: null, acknowledgeOpenVisit: true }),
    ).expect(400));

  it('refuses a doctor who does not work in that department', () =>
    // The queue reads (facility, department, status, startedAt). A doctor filed outside
    // his department would store fine and never appear on anyone's screen.
    post(body({ departmentId: labId, practitionerId: drOpdId, acknowledgeOpenVisit: true })).expect(
      400,
    ));

  it('refuses a deactivated practitioner', () =>
    post(body({ practitionerId: drRetiredId, acknowledgeOpenVisit: true })).expect(400));

  it('refuses an unknown practitioner id', () =>
    post(
      body({ practitionerId: '00000000-0000-4000-8000-000000000000', acknowledgeOpenVisit: true }),
    ).expect(400));

  it("another facility's patient is a 404, never a 403", () =>
    post(body({ patientId: foreignPatientId, acknowledgeOpenVisit: true })).expect(404));

  it('refuses a non-uuid patient id with 400', () =>
    post(body({ patientId: 'not-a-uuid', acknowledgeOpenVisit: true })).expect(400));

  it('does not burn a visit number on a rejected request', async () => {
    const before = await prisma.numberSequence.findFirstOrThrow({
      where: { facilityId, key: 'visit_no' },
    });

    await post(body({ departmentId: closedDeptId, acknowledgeOpenVisit: true })).expect(400);

    const after = await prisma.numberSequence.findFirstOrThrow({
      where: { facilityId, key: 'visit_no' },
    });
    // Gapless means gapless. A hole in the sequence is unexplainable a year later.
    expect(after.current).toBe(before.current);
  });

  // --- The open-visit guard ---------------------------------------------------

  it('refuses a second open visit for the same patient in the same department', async () => {
    const res = await post(body()).expect(409);

    const conflict = res.body as { code: string; visits: VisitSummary[] };
    expect(conflict.code).toBe('open_visit');
    // It names what it found, so the desk can see the visit it already has.
    expect(conflict.visits.length).toBeGreaterThan(0);
    expect(conflict.visits[0].patientId).toBe(patientId);
  });

  it('starts the second visit once the desk acknowledges the open one', () =>
    post(body({ acknowledgeOpenVisit: true })).expect(201));

  it('a different department is not a duplicate: OPD sends patients to the lab', () =>
    // otherPatientId already has an open OPD visit. Sending her to the lab is a second
    // genuinely different visit, not a second registration of the same arrival.
    post({ patientId: otherPatientId, type: 'walk_in_lab', departmentId: labId }).expect(201));

  it('a closed visit does not block a new one', async () => {
    const fresh = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        firstName: 'Sediqa',
        lastName: 'Rahimi',
        gender: 'female',
        phone: '0700990003',
        estimatedAgeYears: 52,
      })
      .expect(201);
    const freshId = (fresh.body as PatientSummary).id;

    const first = await post(body({ patientId: freshId })).expect(201);
    await prisma.visit.update({
      where: { id: (first.body as VisitSummary).id },
      data: { status: 'completed' },
    });

    // She came back next week. Nothing about last time should stand in the way.
    await post(body({ patientId: freshId })).expect(201);
  });

  // --- Who may do what --------------------------------------------------------

  it('denies a doctor the create endpoint: registration is the desk', () =>
    post(body({ acknowledgeOpenVisit: true }), doctorToken).expect(403));

  it('lets a doctor read the pickers — the queue filters by department too', async () => {
    const res = await request(server)
      .get('/visits/options')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    const options = res.body as VisitOptionsResponse;
    expect(options.departments.map((d) => d.name)).toContain('E2E OPD');
  });

  it('the pickers hide deactivated rows and carry each doctor’s departments', async () => {
    const res = await request(server)
      .get('/visits/options')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);

    const options = res.body as VisitOptionsResponse;
    expect(options.departments.map((d) => d.id)).not.toContain(closedDeptId);
    expect(options.practitioners.map((p) => p.id)).not.toContain(drRetiredId);

    const labDoctor = options.practitioners.find((p) => p.id === drLabOnlyId);
    expect(labDoctor?.departmentIds).toEqual([labId]);
    expect(labDoctor?.name).toBe('Wazhma Karimi');
  });

  it("another facility's visit is a 404 on read", async () => {
    const foreignVisit = await prisma.visit.create({
      data: {
        facilityId: otherFacilityId,
        patientId: foreignPatientId,
        departmentId: (
          await prisma.department.create({
            data: {
              facilityId: otherFacilityId,
              code: `${PREFIX}FOR`,
              name: 'E2E Foreign OPD',
              type: 'opd',
            },
          })
        ).id,
        visitNo: `${PREFIX}V-1`,
        type: 'opd_consult',
      },
    });

    await request(server)
      .get(`/visits/${foreignVisit.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('rejects an unauthenticated request with 401', () =>
    request(server).post('/visits').send(body()).expect(401));

  it('audits the visit to whoever started it', async () => {
    const res = await post(body({ patientId: otherPatientId, acknowledgeOpenVisit: true })).expect(
      201,
    );

    const entry = await prisma.auditLog.findFirst({
      where: { entity: 'Visit', entityId: (res.body as VisitSummary).id },
    });
    expect(entry?.action).toBe(AuditAction.create);
    expect(entry?.userId).toBe(receptionistId);
  });
});
