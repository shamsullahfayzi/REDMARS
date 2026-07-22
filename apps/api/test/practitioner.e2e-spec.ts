import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  LoginResponse,
  PractitionerListResponse,
  PractitionerSummary,
  SpecialitySummary,
} from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 2.2 — specialities + practitioners + the department many-to-many. Needs a
 * seeded database.
 *
 * The headline test is the done-when: a practitioner belongs to OPD AND IPD both
 * (Shamo's catch). The rest guards what makes it safe — only admin, a code is
 * unique, a foreign department or user is rejected, a user cannot be linked to two
 * practitioners, and deactivation is reversible.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_prac_';
const PASSWORD = 'e2e-test-password-not-a-secret';
const SPEC_CODE = `${PREFIX}PSYCH`;

describe('Practitioner master data (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let adminId: string;
  let receptionistId: string;
  let adminToken: string;
  let receptionistToken: string;
  let opdId: string;
  let ipdId: string;
  let specialityId: string;
  let linkableUserId: string;
  const createdIds: string[] = [];

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Prac ${suffix}`,
        passwordHash: await hash(PASSWORD),
      },
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return user.id;
  }

  async function login(username: string, password: string): Promise<string> {
    const res = await request(server).post('/auth/login').send({ username, password }).expect(200);
    return (res.body as LoginResponse).accessToken;
  }

  async function cleanup(): Promise<void> {
    await prisma.practitionerDepartment.deleteMany({
      where: { department: { code: { startsWith: PREFIX } } },
    });
    await prisma.practitioner.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.department.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.speciality.deleteMany({ where: { code: { startsWith: PREFIX } } });
    // Again, and deliberately. The R1 read row is written fire-and-forget, so one can
    // land AFTER the sweep above and before the facility goes — and then the facility
    // delete fails on a foreign key, inside afterAll, which Jest reports as a failed suite
    // with no failed tests. Cheap to repeat, miserable to debug.
    await prisma.auditLog.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    facilityId = (await prisma.facility.findFirstOrThrow()).id;
    await cleanup();

    adminId = await seedActor('admin', 'admin');
    receptionistId = await seedActor('receptionist', 'receptionist');
    adminToken = await login(`${PREFIX}admin`, PASSWORD);
    receptionistToken = await login(`${PREFIX}receptionist`, PASSWORD);

    const opd = await prisma.department.create({
      data: { facilityId, code: `${PREFIX}OPD`, name: 'E2E OPD', type: 'opd' },
    });
    const ipd = await prisma.department.create({
      data: { facilityId, code: `${PREFIX}IPD`, name: 'E2E IPD', type: 'ipd' },
    });
    opdId = opd.id;
    ipdId = ipd.id;

    // A spare user the practitioner can be linked to.
    linkableUserId = await seedActor('linkable', 'doctor');
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: createdIds } } });
    }
    await prisma.auditLog.deleteMany({
      where: { userId: { in: [adminId, receptionistId] } },
    });
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  it('creates a speciality (admin), and rejects a duplicate code with 409', async () => {
    const res = await request(server)
      .post('/specialities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: SPEC_CODE, name: 'Psychiatry' })
      .expect(201);
    specialityId = (res.body as SpecialitySummary).id;

    await request(server)
      .post('/specialities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: SPEC_CODE, name: 'Dup' })
      .expect(409);
  });

  it('the done-when: a practitioner belongs to OPD and IPD both', async () => {
    const res = await request(server)
      .post('/practitioners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `${PREFIX}DR1`,
        firstName: 'Shamo',
        lastName: 'Doctor',
        specialityId,
        userId: linkableUserId,
        departmentIds: [opdId, ipdId],
      })
      .expect(201);

    const created = res.body as PractitionerSummary;
    createdIds.push(created.id);
    expect(created.departmentIds).toHaveLength(2);
    expect(created.departmentIds).toEqual(expect.arrayContaining([opdId, ipdId]));
    expect(created.specialityName).toBe('Psychiatry');
    expect(created.userId).toBe(linkableUserId);
  });

  it('rejects a department that is not in this facility with 400', () =>
    request(server)
      .post('/practitioners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `${PREFIX}DRX`,
        firstName: 'No',
        lastName: 'Dept',
        departmentIds: ['00000000-0000-0000-0000-000000000000'],
      })
      .expect(400));

  it('rejects linking a user who is already linked to another practitioner with 409', () =>
    request(server)
      .post('/practitioners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `${PREFIX}DR2`,
        firstName: 'Second',
        lastName: 'Claimant',
        userId: linkableUserId,
        departmentIds: [opdId],
      })
      .expect(409));

  it('rejects a duplicate practitioner code with 409', () =>
    request(server)
      .post('/practitioners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `${PREFIX}DR1`, firstName: 'Clash', lastName: 'Code', departmentIds: [] })
      .expect(409));

  it('denies a non-admin the create endpoint', () =>
    request(server)
      .post('/practitioners')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ code: `${PREFIX}nope`, firstName: 'No', lastName: 'Way', departmentIds: [] })
      .expect(403));

  it('replaces the department set: dropping IPD leaves only OPD', async () => {
    const id = createdIds[0];
    const res = await request(server)
      .put(`/practitioners/${id}/departments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ departmentIds: [opdId] })
      .expect(200);

    const updated = res.body as PractitionerSummary;
    expect(updated.departmentIds).toEqual([opdId]);
  });

  it('deactivation is reversible: a deactivated practitioner is still listed', async () => {
    const id = createdIds[0];
    await request(server)
      .patch(`/practitioners/${id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    const list = await request(server)
      .get('/practitioners')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const found = (list.body as PractitionerListResponse).practitioners.find((p) => p.id === id);
    expect(found).toBeDefined();
    expect(found?.isActive).toBe(false);

    await request(server)
      .patch(`/practitioners/${id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true })
      .expect(200);
  });

  it('audits the practitioner creation, attributable to the admin', async () => {
    const rows = await prisma.auditLog.findMany({
      where: { entity: 'Practitioner', entityId: createdIds[0], action: AuditAction.create },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(adminId);
  });
});
