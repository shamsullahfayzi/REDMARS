import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { ModuleKey, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse, MeResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 2.13 — ModuleGuard. Needs a seeded database (roles).
 *
 * The done-when: with the lab module OFF, a hand-crafted request straight to a lab
 * endpoint 403s even though the caller holds the permission — the guard, not the
 * hidden nav, is the control. The rest proves the inverse (on -> 200), that a
 * non-lab route is untouched, that the guard runs AFTER auth (no token -> 401, not
 * 403), and that /auth/me reports the module set the nav hides on.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_modguard_';
const FACILITY_CODE = 'e2e_modguard_FAC';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('ModuleGuard (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let adminToken: string;

  jest.setTimeout(60_000);

  async function setLabModule(enabled: boolean): Promise<void> {
    await prisma.facilityModule.upsert({
      where: { facilityId_module: { facilityId, module: ModuleKey.lab } },
      update: { enabled, enabledAt: enabled ? new Date() : null },
      create: {
        facilityId,
        module: ModuleKey.lab,
        enabled,
        enabledAt: enabled ? new Date() : null,
      },
    });
  }

  function getLabTests(token: string) {
    return request(server).get('/lab-tests').set('Authorization', `Bearer ${token}`);
  }

  async function cleanup(): Promise<void> {
    await prisma.auditLog.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
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
      data: { code: FACILITY_CODE, name: 'E2E ModGuard Facility' },
    });
    facilityId = facility.id;

    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}admin`,
        fullName: 'E2E ModGuard Admin',
        passwordHash: await hash(PASSWORD),
      },
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'admin' } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: adminRole.id } });
    const res = await request(server)
      .post('/auth/login')
      .send({ username: `${PREFIX}admin`, password: PASSWORD })
      .expect(200);
    adminToken = (res.body as LoginResponse).accessToken;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  it('allows a lab route when the lab module is on', async () => {
    await setLabModule(true);
    await getLabTests(adminToken).expect(200);
  });

  it('the done-when: 403s a lab route when the lab module is off, permission notwithstanding', async () => {
    await setLabModule(false);
    const res = await getLabTests(adminToken).expect(403);
    expect((res.body as { message: string }).message).toMatch(/module not enabled: lab/i);
  });

  it('leaves a non-lab route reachable while lab is off', async () => {
    await setLabModule(false);
    // facility-modules is admin (facility.manage) and carries no @RequiresModule.
    await request(server)
      .get('/facility-modules')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('re-enabling the module restores access', async () => {
    await setLabModule(false);
    await getLabTests(adminToken).expect(403);
    await setLabModule(true);
    await getLabTests(adminToken).expect(200);
  });

  it('runs after auth — an unauthenticated request is 401, not a module 403', async () => {
    await setLabModule(false);
    // No token: JwtAuthGuard denies first, before the module is ever consulted.
    await request(server).get('/lab-tests').expect(401);
  });

  it('reports enabled modules on /auth/me for the nav to hide on', async () => {
    await setLabModule(true);
    const on = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((on.body as MeResponse).enabledModules).toContain('lab');

    await setLabModule(false);
    const off = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((off.body as MeResponse).enabledModules).not.toContain('lab');
  });
});
