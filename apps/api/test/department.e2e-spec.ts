import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { DepartmentListResponse, DepartmentSummary, LoginResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 2.1 — department master data. Needs a seeded database.
 *
 * The headline test is the done-when: an admin adds "OPD-2" and it appears in the
 * list. The rest guards what makes it safe — only admin may manage departments, a
 * duplicate code is a clean 409, a bad body is a 400, and deactivation is
 * reversible (an inactive department is still listed so it can be reactivated).
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_dept_';
const PASSWORD = 'e2e-test-password-not-a-secret';
const NEW_CODE = `${PREFIX}OPD2`;

describe('Department master data (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let adminId: string;
  let receptionistId: string;
  let adminToken: string;
  let receptionistToken: string;
  const createdIds: string[] = [];

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId: (await prisma.facility.findFirstOrThrow()).id,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Dept ${suffix}`,
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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    await prisma.department.deleteMany({ where: { code: { startsWith: PREFIX } } });
    // Again, and deliberately. The R1 read row is written fire-and-forget, so one can
    // land AFTER the sweep above and before the facility goes — and then the facility
    // delete fails on a foreign key, inside afterAll, which Jest reports as a failed suite
    // with no failed tests. Cheap to repeat, miserable to debug.
    await prisma.auditLog.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });

    adminId = await seedActor('admin', 'admin');
    receptionistId = await seedActor('receptionist', 'receptionist');
    adminToken = await login(`${PREFIX}admin`, PASSWORD);
    receptionistToken = await login(`${PREFIX}receptionist`, PASSWORD);
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: createdIds } } });
    }
    await prisma.department.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: [adminId, receptionistId] } } });
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('the done-when: an admin adds "OPD-2" and it appears in the list', async () => {
    const res = await request(server)
      .post('/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: NEW_CODE,
        name: 'Outpatient 2',
        type: 'opd',
        nameLocalPrs: 'سراپا ۲',
      })
      .expect(201);

    const created = res.body as DepartmentSummary;
    createdIds.push(created.id);
    expect(created.code).toBe(NEW_CODE);
    expect(created.type).toBe('opd');
    expect(created.nameLocalPrs).toBe('سراپا ۲');
    expect(created.isActive).toBe(true);

    const list = await request(server)
      .get('/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = list.body as DepartmentListResponse;
    expect(body.departments.some((d) => d.id === created.id)).toBe(true);
  });

  it('a blank local name is stored as null, never an empty string', async () => {
    const res = await request(server)
      .get('/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as DepartmentListResponse;
    const created = body.departments.find((d) => d.code === NEW_CODE);
    expect(created?.nameLocalPs).toBeNull();
  });

  it('rejects a duplicate code with 409', () =>
    request(server)
      .post('/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: NEW_CODE, name: 'Clash', type: 'opd' })
      .expect(409));

  it('rejects a bad body (missing type) with 400', () =>
    request(server)
      .post('/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `${PREFIX}NOTYPE`, name: 'No Type' })
      .expect(400));

  it('denies a non-admin (receptionist) the create endpoint', () =>
    request(server)
      .post('/departments')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ code: `${PREFIX}nope`, name: 'Nope', type: 'opd' })
      .expect(403));

  it('denies a non-admin the department list', () =>
    request(server)
      .get('/departments')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(403));

  it('deactivation is reversible: a deactivated department is still listed', async () => {
    const id = createdIds[0];

    await request(server)
      .patch(`/departments/${id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    const afterDeactivate = await request(server)
      .get('/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const deactivated = (afterDeactivate.body as DepartmentListResponse).departments.find(
      (d) => d.id === id,
    );
    // Still present (so it can be reactivated), and marked inactive.
    expect(deactivated).toBeDefined();
    expect(deactivated?.isActive).toBe(false);

    await request(server)
      .patch(`/departments/${id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true })
      .expect(200);
  });

  it('audits the department creation, attributable to the admin', async () => {
    const rows = await prisma.auditLog.findMany({
      where: {
        entity: 'Department',
        entityId: createdIds[0],
        action: AuditAction.create,
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(adminId);
  });
});
