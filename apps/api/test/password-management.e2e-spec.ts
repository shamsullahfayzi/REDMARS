import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash, verify } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { LoginResponse, MeResponse } from '@redmars/shared';
import { AppModule } from '../src/app.module';

const prisma = new PrismaClient();
const TEMP = 'synthetic-temporary-password';
const NEXT = 'synthetic-permanent-passphrase';

describe('Phase 4 password management', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let adminId: string;
  let adminToken: string;
  const ids: string[] = [];
  jest.setTimeout(60_000);

  async function actor(roleCode = 'receptionist', temporary = true, otherFacility = facilityId) {
    const user = await prisma.appUser.create({
      data: {
        facilityId: otherFacility,
        username: `password_test_${randomUUID()}`,
        fullName: 'Synthetic password test',
        passwordHash: await hash(TEMP),
        mustChangePassword: temporary,
      },
    });
    ids.push(user.id);
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return user;
  }
  async function login(username: string, password = TEMP) {
    const result = await request(server)
      .post('/auth/login')
      .send({ username, password })
      .expect(200);
    return result.body as LoginResponse;
  }
  function change(token: string, currentPassword = TEMP, newPassword = NEXT) {
    return request(server)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword, newPassword });
  }
  function reset(id: string, token = adminToken, password = TEMP) {
    return request(server)
      .post(`/users/${id}/reset-password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ password });
  }

  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    await app.init();
    server = app.getHttpServer();
    facilityId = (
      await prisma.facility.create({
        data: { code: `password_test_${randomUUID()}`, name: 'Synthetic test only' },
      })
    ).id;
    const admin = await actor('admin', false);
    adminId = admin.id;
    adminToken = (await login(admin.username)).accessToken;
  });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { OR: [{ facilityId }, { entityId: { in: ids } }] },
    });
    await prisma.appUser.deleteMany({ where: { id: { in: ids } } });
    await prisma.facility.delete({ where: { id: facilityId } });
    await app.close();
    await prisma.$disconnect();
  });

  it('requires authentication for password changes', async () => {
    await request(server)
      .post('/auth/change-password')
      .send({ currentPassword: TEMP, newPassword: NEXT })
      .expect(401);
  });
  it('marks administrator-created accounts as temporary and restricts direct API access', async () => {
    const response = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: `password_test_${randomUUID()}`,
        fullName: 'Synthetic new user',
        password: TEMP,
        roleCodes: ['receptionist'],
      })
      .expect(201);
    const created = response.body as { id: string; username: string };
    ids.push(created.id);
    const session = await login(created.username);
    expect(session.user.mustChangePassword).toBe(true);
    const me = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect((me.body as MeResponse).user.mustChangePassword).toBe(true);
    const blocked = await request(server)
      .get('/patients')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(403);
    expect((blocked.body as { code: string }).code).toBe('password_change_required');
    const refreshed = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(200);
    await request(server)
      .get('/patients')
      .set('Authorization', `Bearer ${(refreshed.body as { accessToken: string }).accessToken}`)
      .expect(403);
    await change(session.accessToken).expect(200);
    const permanent = await login(created.username, NEXT);
    expect(permanent.user.mustChangePassword).toBe(false);
    await request(server)
      .get('/patients')
      .set('Authorization', `Bearer ${permanent.accessToken}`)
      .expect(200);
  });
  it('verifies the current password and preserves credentials on rejection', async () => {
    const user = await actor();
    const session = await login(user.username);
    await change(session.accessToken, 'incorrect-current-password').expect(400);
    expect(
      (await prisma.appUser.findUniqueOrThrow({ where: { id: user.id } })).credentialVersion,
    ).toBe(0);
    await login(user.username);
  });
  it.each(['short', TEMP, 'password123456'])(
    'rejects an unsafe or unchanged new password (%#)',
    async (candidate) => {
      const user = await actor();
      const session = await login(user.username);
      await change(session.accessToken, TEMP, candidate).expect(400);
    },
  );
  it('revokes all refresh sessions and old access tokens on self-service change', async () => {
    const user = await actor('doctor', false);
    const session = await login(user.username);
    await change(session.accessToken).expect(200);
    await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(401);
    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(401);
    await request(server)
      .post('/auth/login')
      .send({ username: user.username, password: TEMP })
      .expect(401);
    const updated = await prisma.appUser.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verify(updated.passwordHash, NEXT)).toBe(true);
    expect(updated.credentialVersion).toBe(1);
    expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  });
  it('administrator reset forces a change and immediately revokes the previous credentials', async () => {
    const user = await actor('doctor', false);
    const session = await login(user.username);
    const issued = 'synthetic-second-temporary-password';
    const response = await reset(user.id, adminToken, issued).expect(200);
    expect(response.body).toEqual({ success: true });
    await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(401);
    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(401);
    await request(server)
      .post('/auth/login')
      .send({ username: user.username, password: TEMP })
      .expect(401);
    const temporary = await login(user.username, issued);
    expect(temporary.user.mustChangePassword).toBe(true);
    await change(temporary.accessToken, issued).expect(200);
    expect((await login(user.username, NEXT)).user.mustChangePassword).toBe(false);
  });
  it('denies reset to non-administrators and denies self-reset', async () => {
    const user = await actor('receptionist', false);
    const session = await login(user.username);
    await reset(adminId, session.accessToken).expect(403);
    await reset(adminId).expect(400);
    await reset(user.id, adminToken, 'too-short').expect(400);
  });
  it('cannot reset accounts in another facility', async () => {
    const other = await prisma.facility.findFirstOrThrow({ where: { id: { not: facilityId } } });
    const user = await actor('doctor', false, other.id);
    await reset(user.id).expect(404);
    expect(
      (await prisma.appUser.findUniqueOrThrow({ where: { id: user.id } })).credentialVersion,
    ).toBe(0);
  });
  it('logs attributable reset and change events without passwords or hashes', async () => {
    const user = await actor('doctor', false);
    await reset(user.id).expect(200);
    const session = await login(user.username);
    await change(session.accessToken).expect(200);
    const events = await prisma.auditLog.findMany({
      where: { entity: 'AppUser', entityId: user.id, action: 'update' },
    });
    expect(events.some((row) => row.userId === adminId)).toBe(true);
    expect(events.some((row) => row.userId === user.id)).toBe(true);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(TEMP);
    expect(serialized).not.toContain(NEXT);
    expect(serialized).not.toContain('$argon2');
  });
  it('limits repeated current-password guesses', async () => {
    const user = await actor();
    const session = await login(user.username);
    for (let attempt = 0; attempt < 5; attempt++)
      await change(session.accessToken, 'incorrect').expect(400);
    await change(session.accessToken, 'incorrect').expect(429);
  });
  it('refuses known development defaults for new accounts', async () => {
    await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: `password_test_${randomUUID()}`,
        fullName: 'Synthetic rejected user',
        password: 'password123456',
        roleCodes: ['receptionist'],
      })
      .expect(400);
  });
});
