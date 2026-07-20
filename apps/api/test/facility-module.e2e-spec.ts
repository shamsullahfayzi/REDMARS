import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  MODULE_KEYS,
  type FacilityModuleListResponse,
  type FacilityModuleSummary,
  type LoginResponse,
} from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 2.12 — facility module toggles. Needs a seeded database (roles).
 *
 * The done-when: an admin flips "lab" on and off and the state persists. The rest
 * guards the edges — the list is always the full set of switches, only an admin may
 * touch them, and OPD (or any non-module) cannot be toggled.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_facmod_';
const FACILITY_CODE = 'e2e_facmod_FAC';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Facility modules (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let adminToken: string;
  let receptionistToken: string;

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E FacMod ${suffix}`,
        passwordHash: await hash(PASSWORD),
      },
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const res = await request(server)
      .post('/auth/login')
      .send({ username: `${PREFIX}${suffix}`, password: PASSWORD })
      .expect(200);
    return (res.body as LoginResponse).accessToken;
  }

  function setLab(enabled: boolean, token: string) {
    return request(server)
      .patch('/facility-modules/lab')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled });
  }

  async function cleanup(): Promise<void> {
    // Logins and the toggle writes leave audit_log rows on the facility; clear them
    // before the facility (which cascades its module rows) and users.
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
      data: { code: FACILITY_CODE, name: 'E2E FacMod Facility' },
    });
    facilityId = facility.id;

    adminToken = await seedActor('admin', 'admin');
    receptionistToken = await seedActor('receptionist', 'receptionist');
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  it('lists the full set of toggleable modules (all off for a fresh facility)', async () => {
    const res = await request(server)
      .get('/facility-modules')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const { modules } = res.body as FacilityModuleListResponse;
    expect(modules.map((m) => m.module).sort()).toEqual([...MODULE_KEYS].sort());
    expect(modules.every((m) => m.enabled === false)).toBe(true);
  });

  it('the done-when: an admin flips lab on, then off, and it persists', async () => {
    const on = await setLab(true, adminToken).expect(200);
    const onBody = on.body as FacilityModuleSummary;
    expect(onBody.enabled).toBe(true);
    expect(onBody.enabledAt).not.toBeNull();

    // Persisted: a fresh list reflects it.
    const afterOn = await request(server)
      .get('/facility-modules')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const lab = (afterOn.body as FacilityModuleListResponse).modules.find(
      (m) => m.module === 'lab',
    );
    expect(lab?.enabled).toBe(true);

    const off = await setLab(false, adminToken).expect(200);
    const offBody = off.body as FacilityModuleSummary;
    expect(offBody.enabled).toBe(false);
    expect(offBody.enabledAt).toBeNull();
  });

  it('denies a non-admin the list', () =>
    request(server)
      .get('/facility-modules')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(403));

  it('denies a non-admin the toggle', () => setLab(true, receptionistToken).expect(403));

  it('rejects toggling OPD — it is the core, not a module', () =>
    request(server)
      .patch('/facility-modules/opd')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: false })
      .expect(400));

  it('rejects an unknown module', () =>
    request(server)
      .patch('/facility-modules/nonsense')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true })
      .expect(400));

  it('rejects a body without enabled', () =>
    request(server)
      .patch('/facility-modules/lab')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400));
});
