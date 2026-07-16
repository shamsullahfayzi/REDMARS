import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse, MeResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 1.6 — GET /auth/me, the "who am I" the web app calls on every load to
 * rehydrate a session and learn which menu to render. Needs a seeded database.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_me_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('GET /auth/me (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let userId: string;

  jest.setTimeout(60_000);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });

    const facility = await prisma.facility.findFirstOrThrow();
    const user = await prisma.appUser.create({
      data: {
        facilityId: facility.id,
        username: `${PREFIX}doctor`,
        fullName: 'E2E Me Doctor',
        passwordHash: await hash(PASSWORD),
      },
    });
    userId = user.id;
    const doctorRole = await prisma.role.findUniqueOrThrow({ where: { code: 'doctor' } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: doctorRole.id } });

    const res = await request(server)
      .post('/auth/login')
      .send({ username: `${PREFIX}doctor`, password: PASSWORD })
      .expect(200);
    token = (res.body as LoginResponse).accessToken;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: userId } });
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('returns the identity and roles behind the token', async () => {
    const res = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = res.body as MeResponse;
    expect(body.user.id).toBe(userId);
    expect(body.user.username).toBe(`${PREFIX}doctor`);
    expect(body.user.fullName).toBe('E2E Me Doctor');
    expect(body.roles).toContain('doctor');
  });

  it('never leaks the password hash', async () => {
    const res = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('$argon2');
  });

  it('401s without a token — "who am I" is meaningless unauthenticated', () =>
    request(server).get('/auth/me').expect(401));
});
