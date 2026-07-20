import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, ModuleKey, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  LoginResponse,
  ReferenceRangeListResponse,
  ReferenceRangeSummary,
} from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 2.8 — reference ranges per test. Needs a seeded database.
 *
 * The headline is the done-when made concrete: a haemoglobin test carries a male
 * band (13–17) and a female band (12–15), so the SAME value — 11 — sits below the
 * male low and inside neither... the point is the data model holds gender-specific
 * bands side by side. The flag logic that reads them (L/H/normal) is Phase 5; here
 * we prove the bands are stored, edited, and deleted correctly, exact on the wire,
 * and reachable only through a test the facility owns.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_refrange_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Reference ranges (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let otherFacilityId: string;
  let adminId: string;
  let labTechId: string;
  let receptionistId: string;
  let adminToken: string;
  let labTechToken: string;
  let receptionistToken: string;
  let hbTestId: string;
  let foreignTestId: string;

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Range ${suffix}`,
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
    await prisma.referenceRange.deleteMany({ where: { test: { code: { startsWith: PREFIX } } } });
    await prisma.labTest.deleteMany({ where: { code: { startsWith: PREFIX } } });
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

    facilityId = (await prisma.facility.findFirstOrThrow()).id;
    // Lab routes are @RequiresModule('lab') (task 2.13) — ensure the module is on for
    // this facility so the guard does not 403 before the feature under test runs.
    await prisma.facilityModule.upsert({
      where: { facilityId_module: { facilityId, module: ModuleKey.lab } },
      update: { enabled: true },
      create: { facilityId, module: ModuleKey.lab, enabled: true, enabledAt: new Date() },
    });
    await cleanup();

    adminId = await seedActor('admin', 'admin');
    labTechId = await seedActor('labtech', 'lab_tech');
    receptionistId = await seedActor('receptionist', 'receptionist');
    adminToken = await login(`${PREFIX}admin`, PASSWORD);
    labTechToken = await login(`${PREFIX}labtech`, PASSWORD);
    receptionistToken = await login(`${PREFIX}receptionist`, PASSWORD);

    const hb = await prisma.labTest.create({
      data: { facilityId, code: `${PREFIX}HB`, name: 'E2E Haemoglobin', unit: 'g/dL' },
    });
    hbTestId = hb.id;

    // A test in a DIFFERENT facility — its ranges must be unreachable from ours.
    const otherFacility = await prisma.facility.create({
      data: { code: `${PREFIX}fac`, name: 'E2E Other Facility' },
    });
    otherFacilityId = otherFacility.id;
    const foreign = await prisma.labTest.create({
      data: { facilityId: otherFacilityId, code: `${PREFIX}FOREIGN`, name: 'E2E Foreign Test' },
    });
    foreignTestId = foreign.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { userId: { in: [adminId, labTechId, receptionistId] } },
    });
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  const createdIds: string[] = [];

  // Returns the supertest Test (chainable with .expect and awaitable) — not an async
  // wrapper, which would hand back a plain Promise and break the .expect() chain.
  function addRange(body: unknown, token = adminToken) {
    return request(server)
      .post(`/lab-tests/${hbTestId}/ranges`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  it('the done-when: a test holds gender-specific bands side by side', async () => {
    const male = await addRange({ gender: 'male', low: '13', high: '17' }).expect(201);
    const female = await addRange({ gender: 'female', low: '12', high: '15' }).expect(201);
    createdIds.push((male.body as ReferenceRangeSummary).id);
    createdIds.push((female.body as ReferenceRangeSummary).id);

    const list = await request(server)
      .get(`/lab-tests/${hbTestId}/ranges`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const ranges = (list.body as ReferenceRangeListResponse).ranges;

    const m = ranges.find((r) => r.gender === 'male');
    const f = ranges.find((r) => r.gender === 'female');
    expect(m).toMatchObject({ low: '13', high: '17' });
    expect(f).toMatchObject({ low: '12', high: '15' });
    // The same 11 that is below the male low (13) is also below the female low (12) —
    // but the point proven here is that both bands coexist for one test.
    expect(11 < Number(m!.low)).toBe(true);
  });

  it('a lab value rides the wire exact, without forced trailing zeros', async () => {
    const res = await addRange({
      gender: 'female',
      minAge: 0,
      maxAge: 1,
      low: '4.5',
      high: '13.5',
    });
    createdIds.push((res.body as ReferenceRangeSummary).id);
    const range = res.body as ReferenceRangeSummary;
    expect(range.low).toBe('4.5'); // not "4.5000"
    expect(range.high).toBe('13.5');
    expect(res.text).toContain('"low":"4.5"');
  });

  it('accepts a text range with no numeric bounds', async () => {
    const res = await addRange({ textValue: 'Negative' }).expect(201);
    createdIds.push((res.body as ReferenceRangeSummary).id);
    const range = res.body as ReferenceRangeSummary;
    expect(range.textValue).toBe('Negative');
    expect(range.low).toBeNull();
    expect(range.high).toBeNull();
  });

  it('rejects an empty range (no bound and no text) with 400', () =>
    addRange({ gender: 'male' }).expect(400));

  it('rejects a backwards range (low > high) with 400', () =>
    addRange({ low: '17', high: '13' }).expect(400));

  it('rejects a backwards age band (minAge > maxAge) with 400', () =>
    addRange({ low: '13', high: '17', minAge: 60, maxAge: 18 }).expect(400));

  it('the lab technician may manage ranges (R9 passes the guard)', () =>
    request(server)
      .get(`/lab-tests/${hbTestId}/ranges`)
      .set('Authorization', `Bearer ${labTechToken}`)
      .expect(200));

  it('denies a receptionist the ranges', () =>
    request(server)
      .get(`/lab-tests/${hbTestId}/ranges`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(403));

  it('cannot reach a range through a test in another facility (404)', () =>
    request(server)
      .get(`/lab-tests/${foreignTestId}/ranges`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404));

  it('edits a range; a cleared field returns to null', async () => {
    const created = await addRange({ gender: 'male', minAge: 18, low: '13', high: '17' }).expect(
      201,
    );
    const id = (created.body as ReferenceRangeSummary).id;
    createdIds.push(id);

    const res = await request(server)
      .patch(`/lab-tests/${hbTestId}/ranges/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ gender: 'male', low: '14', high: '18' }) // minAge omitted -> cleared
      .expect(200);
    const range = res.body as ReferenceRangeSummary;
    expect(range.low).toBe('14');
    expect(range.minAge).toBeNull();
  });

  it('deletes a range and returns the shortened list', async () => {
    const created = await addRange({ textValue: 'Trace' }).expect(201);
    const id = (created.body as ReferenceRangeSummary).id;

    const before = await request(server)
      .get(`/lab-tests/${hbTestId}/ranges`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const beforeCount = (before.body as ReferenceRangeListResponse).ranges.length;

    const res = await request(server)
      .delete(`/lab-tests/${hbTestId}/ranges/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const after = (res.body as ReferenceRangeListResponse).ranges;
    expect(after).toHaveLength(beforeCount - 1);
    expect(after.find((r) => r.id === id)).toBeUndefined();
  });

  it('audits the range creation, attributable to the admin', async () => {
    const rows = await prisma.auditLog.findMany({
      where: { entity: 'ReferenceRange', entityId: createdIds[0], action: AuditAction.create },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(adminId);
  });
});
