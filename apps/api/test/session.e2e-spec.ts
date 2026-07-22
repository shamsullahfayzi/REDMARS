import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse, RefreshResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';
import { hashRefreshToken } from './../src/auth/auth.service';

/**
 * Task 1.8 — session lifecycle. Needs a seeded database.
 *
 * The done-when is "token expiry doesn't dump the user mid-consult": a refresh
 * token buys a fresh access token that actually works. Around that: single-session
 * ("logged in elsewhere"), logout revocation, expiry and deactivation each failing
 * with the right reason, and the login/logout audit actions deferred here from 1.4.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_sess_';
const PASSWORD = 'e2e-test-password-not-a-secret';

interface Reason {
  reason?: string;
}

describe('Session lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  const userIds: string[] = [];

  jest.setTimeout(60_000);

  async function makeUser(suffix: string): Promise<string> {
    const facility = await prisma.facility.findFirstOrThrow();
    const user = await prisma.appUser.create({
      data: {
        facilityId: facility.id,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Session ${suffix}`,
        passwordHash: await hash(PASSWORD),
      },
    });
    const doctor = await prisma.role.findUniqueOrThrow({ where: { code: 'doctor' } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: doctor.id } });
    userIds.push(user.id);
    return user.id;
  }

  async function login(suffix: string): Promise<LoginResponse> {
    const res = await request(server)
      .post('/auth/login')
      .send({ username: `${PREFIX}${suffix}`, password: PASSWORD })
      .expect(200);
    return res.body as LoginResponse;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    // Again, and deliberately. The R1 read row is written fire-and-forget, so one can
    // land AFTER the sweep above and before the facility goes — and then the facility
    // delete fails on a foreign key, inside afterAll, which Jest reports as a failed suite
    // with no failed tests. Cheap to repeat, miserable to debug.
    await prisma.auditLog.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });
    for (const suffix of ['refresh', 'elsewhere', 'logout', 'expired', 'deactivated']) {
      await makeUser(suffix);
    }
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: userIds } } });
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('the done-when: a refresh token buys a fresh access token that works', async () => {
    const { refreshToken } = await login('refresh');

    const res = await request(server).post('/auth/refresh').send({ refreshToken }).expect(200);
    const body = res.body as RefreshResponse;
    expect(body.accessToken.length).toBeGreaterThan(0);
    expect(body.expiresIn).toBeGreaterThan(0);

    // The new access token authenticates a protected route — it is really valid.
    await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);
  });

  it('single session: signing in again supersedes the first — "logged in elsewhere"', async () => {
    const first = await login('elsewhere');
    const second = await login('elsewhere');

    // The first device's refresh now fails, and says why.
    const res = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(401);
    expect((res.body as Reason).reason).toBe('superseded');

    // The second, current session still refreshes fine.
    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: second.refreshToken })
      .expect(200);
  });

  it('logout revokes the session, and is idempotent', async () => {
    const { refreshToken } = await login('logout');

    await request(server).post('/auth/logout').send({ refreshToken }).expect(200);
    // Revoked: the token no longer refreshes.
    await request(server).post('/auth/refresh').send({ refreshToken }).expect(401);
    // Logging out an already-dead session is still a clean 200.
    await request(server).post('/auth/logout').send({ refreshToken }).expect(200);
  });

  it('an expired session refresh fails with reason "expired"', async () => {
    const rawToken = `expired-${randomUUID()}`;
    await prisma.session.create({
      data: {
        userId: userIds[3], // 'expired' user
        refreshTokenHash: hashRefreshToken(rawToken),
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const res = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: rawToken })
      .expect(401);
    expect((res.body as Reason).reason).toBe('expired');
  });

  it('a deactivated user cannot refresh, with reason "deactivated"', async () => {
    const { refreshToken } = await login('deactivated');
    await prisma.appUser.update({ where: { id: userIds[4] }, data: { isActive: false } });

    const res = await request(server).post('/auth/refresh').send({ refreshToken }).expect(401);
    expect((res.body as Reason).reason).toBe('deactivated');
  });

  it('an unknown refresh token is rejected as "invalid"', async () => {
    const res = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: 'not-a-real-token' })
      .expect(401);
    expect((res.body as Reason).reason).toBe('invalid');
  });

  it('records a login audit action, and a logout audit action', async () => {
    const { refreshToken } = await login('logout');
    await request(server).post('/auth/logout').send({ refreshToken }).expect(200);

    const logins = await prisma.auditLog.count({
      where: { entityId: userIds[2], action: AuditAction.login },
    });
    const logouts = await prisma.auditLog.count({
      where: { entityId: userIds[2], action: AuditAction.logout },
    });
    expect(logins).toBeGreaterThanOrEqual(1);
    expect(logouts).toBeGreaterThanOrEqual(1);
  });
});
