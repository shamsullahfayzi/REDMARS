import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  DISCOUNT_MAX_PERCENT_DEFAULT,
  type DiscountCeilingResponse,
  type LoginResponse,
} from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 6b.1 — the R10 ceiling as a facility Setting. The done-when: an admin changes the
 * number, and a receptionist reading it afterwards sees the new one, not the old default.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_settings_';
const FACILITY_CODE = 'e2e_settings_FAC';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Settings — discount ceiling (e2e)', () => {
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
        fullName: `E2E Settings ${suffix}`,
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

  function setCeiling(maxPercent: unknown, token: string) {
    return request(server)
      .patch('/settings/discount-ceiling')
      .set('Authorization', `Bearer ${token}`)
      .send({ maxPercent });
  }

  function getCeiling(token: string) {
    return request(server)
      .get('/settings/discount-ceiling')
      .set('Authorization', `Bearer ${token}`);
  }

  async function cleanup(): Promise<void> {
    await prisma.auditLog.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.auditLog.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.setting.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
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
      data: { code: FACILITY_CODE, name: 'E2E Settings Facility' },
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

  it('reads the default before anyone has ever set it', async () => {
    const res = await getCeiling(adminToken).expect(200);
    expect((res.body as DiscountCeilingResponse).maxPercent).toBe(DISCOUNT_MAX_PERCENT_DEFAULT);
  });

  it('the done-when: an admin changes it, and it persists for a receptionist reading it', async () => {
    const set = await setCeiling(25, adminToken).expect(200);
    expect((set.body as DiscountCeilingResponse).maxPercent).toBe(25);

    const read = await getCeiling(receptionistToken).expect(200);
    expect((read.body as DiscountCeilingResponse).maxPercent).toBe(25);
  });

  it('denies a non-admin the change', () => setCeiling(50, receptionistToken).expect(403));

  it('a receptionist may still read it — they need the number they are held to', () =>
    getCeiling(receptionistToken).expect(200));

  it('rejects a negative percentage', () => setCeiling(-5, adminToken).expect(400));

  it('rejects a percentage over 100', () => setCeiling(101, adminToken).expect(400));

  it('rejects a non-numeric body', () => setCeiling('a lot', adminToken).expect(400));
});
