import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse, RoomListResponse, RoomSummary } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 2.1 — rooms, the child of Department. Needs a seeded database.
 *
 * The headline test is the done-when: an admin adds a room to a department and it
 * appears in the list. The rest guards what makes it safe — only admin, a room
 * cannot be hung off a department in another facility (404), a duplicate code is a
 * 409, a bad body is a 400, and deactivation is reversible.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_room_';
const PASSWORD = 'e2e-test-password-not-a-secret';
const ROOM_CODE = `${PREFIX}101`;

describe('Room master data (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let adminId: string;
  let receptionistId: string;
  let adminToken: string;
  let receptionistToken: string;
  let departmentId: string;
  const createdIds: string[] = [];

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Room ${suffix}`,
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

    facilityId = (await prisma.facility.findFirstOrThrow()).id;

    await prisma.room.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.department.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });

    adminId = await seedActor('admin', 'admin');
    receptionistId = await seedActor('receptionist', 'receptionist');
    adminToken = await login(`${PREFIX}admin`, PASSWORD);
    receptionistToken = await login(`${PREFIX}receptionist`, PASSWORD);

    const department = await prisma.department.create({
      data: { facilityId, code: `${PREFIX}DEPT`, name: 'E2E Room Dept', type: 'opd' },
    });
    departmentId = department.id;
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: createdIds } } });
    }
    await prisma.room.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.department.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: [adminId, receptionistId] } } });
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('the done-when: an admin adds a room to a department, and it appears in the list', async () => {
    const res = await request(server)
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ departmentId, code: ROOM_CODE, name: 'Consult 1' })
      .expect(201);

    const created = res.body as RoomSummary;
    createdIds.push(created.id);
    expect(created.code).toBe(ROOM_CODE);
    expect(created.departmentId).toBe(departmentId);
    expect(created.isActive).toBe(true);

    const list = await request(server)
      .get('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = list.body as RoomListResponse;
    expect(body.rooms.some((r) => r.id === created.id)).toBe(true);
  });

  it('rejects a room on a department that is not in this facility with 404', () =>
    request(server)
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      // A random uuid — no such department in this facility.
      .send({
        departmentId: '00000000-0000-0000-0000-000000000000',
        code: `${PREFIX}orphan`,
        name: 'Orphan',
      })
      .expect(404));

  it('rejects a duplicate code with 409', () =>
    request(server)
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ departmentId, code: ROOM_CODE, name: 'Clash' })
      .expect(409));

  it('rejects a bad body (missing name) with 400', () =>
    request(server)
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ departmentId, code: `${PREFIX}noname` })
      .expect(400));

  it('denies a non-admin (receptionist) the create endpoint', () =>
    request(server)
      .post('/rooms')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ departmentId, code: `${PREFIX}nope`, name: 'Nope' })
      .expect(403));

  it('denies a non-admin the room list', () =>
    request(server).get('/rooms').set('Authorization', `Bearer ${receptionistToken}`).expect(403));

  it('deactivation is reversible: a deactivated room is still listed', async () => {
    const id = createdIds[0];

    await request(server)
      .patch(`/rooms/${id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    const afterDeactivate = await request(server)
      .get('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const deactivated = (afterDeactivate.body as RoomListResponse).rooms.find((r) => r.id === id);
    expect(deactivated).toBeDefined();
    expect(deactivated?.isActive).toBe(false);

    await request(server)
      .patch(`/rooms/${id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true })
      .expect(200);
  });

  it('audits the room creation, attributable to the admin', async () => {
    const rows = await prisma.auditLog.findMany({
      where: { entity: 'Room', entityId: createdIds[0], action: AuditAction.create },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(adminId);
  });
});
