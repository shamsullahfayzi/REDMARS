import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, ModuleKey, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  LabPanelSummary,
  LabTestListResponse,
  LabTestSummary,
  LoginResponse,
} from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 2.7 — lab test catalog + panels + prices. Needs a seeded database.
 *
 * The headline test is the done-when: an "LFT" panel expands to its five member
 * tests (the many-to-many, LabPanelTest). The rest guards what makes it safe — a
 * price rides the wire as an exact decimal string, a test from another facility
 * cannot be pulled into a panel, membership is replaceable, codes are unique, and
 * the two permissions differ: labtest.manage reaches the lab_tech (R9), panel.manage
 * is admin-only.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_lab_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Lab catalog (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let adminId: string;
  let labTechId: string;
  let receptionistId: string;
  let adminToken: string;
  let labTechToken: string;
  let receptionistToken: string;
  // The five liver-function tests an LFT panel expands to.
  let lftTestIds: string[] = [];
  const createdPanelIds: string[] = [];

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Lab ${suffix}`,
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
    await prisma.labPanelTest.deleteMany({ where: { panel: { code: { startsWith: PREFIX } } } });
    await prisma.labPanel.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.labTest.deleteMany({ where: { code: { startsWith: PREFIX } } });
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

    // The five member tests of an LFT panel — seeded directly as fixtures.
    const members = ['ALT', 'AST', 'ALP', 'BILI', 'GGT'];
    const created = await Promise.all(
      members.map((m) =>
        prisma.labTest.create({
          data: { facilityId, code: `${PREFIX}${m}`, name: `E2E ${m}`, specimen: 'blood' },
        }),
      ),
    );
    lftTestIds = created.map((t) => t.id);
  });

  afterAll(async () => {
    if (createdPanelIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: createdPanelIds } } });
    }
    await prisma.auditLog.deleteMany({
      where: { userId: { in: [adminId, labTechId, receptionistId] } },
    });
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  // --- Lab tests -------------------------------------------------------------

  it('creates a priced lab test; the price rides the wire as an exact decimal string', async () => {
    const res = await request(server)
      .post('/lab-tests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `${PREFIX}CBC`,
        name: 'Complete Blood Count',
        unit: 'cells/µL',
        price: '150.5',
      })
      .expect(201);

    const test = res.body as LabTestSummary;
    expect(test.price).toBe('150.50'); // string, two places — not a float
    expect(typeof test.price).toBe('string');
    // Proof it is quoted in the raw JSON, never a bare number.
    expect(res.text).toContain('"price":"150.50"');
  });

  it('a lab test may be unpriced — price is null, not zero', async () => {
    const res = await request(server)
      .post('/lab-tests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `${PREFIX}FREE`, name: 'Bundled Only Test' })
      .expect(201);
    expect((res.body as LabTestSummary).price).toBeNull();
  });

  it('rejects a duplicate lab test code with 409', () =>
    request(server)
      .post('/lab-tests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `${PREFIX}CBC`, name: 'Dup' })
      .expect(409));

  it('rejects a bad body (name too short) with 400', () =>
    request(server)
      .post('/lab-tests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `${PREFIX}BAD`, name: 'X' })
      .expect(400));

  it('the lab technician may manage the test catalog (R9 passes the guard)', () =>
    request(server).get('/lab-tests').set('Authorization', `Bearer ${labTechToken}`).expect(200));

  it('denies a receptionist the test catalog', () =>
    request(server)
      .get('/lab-tests')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(403));

  it('deactivation is reversible: a deactivated test is still listed', async () => {
    const test = (await request(server)
      .post('/lab-tests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `${PREFIX}TOGGLE`, name: 'Toggle Test' })
      .expect(201)) as { body: LabTestSummary };
    const id = test.body.id;

    await request(server)
      .patch(`/lab-tests/${id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    const list = await request(server)
      .get('/lab-tests')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const found = (list.body as LabTestListResponse).tests.find((t) => t.id === id);
    expect(found?.isActive).toBe(false);
  });

  // --- Lab panels ------------------------------------------------------------

  it('the done-when: an LFT panel expands to its five member tests', async () => {
    const res = await request(server)
      .post('/lab-panels')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `${PREFIX}LFT`,
        name: 'Liver Function Tests',
        price: '600',
        testIds: lftTestIds,
      })
      .expect(201);

    const panel = res.body as LabPanelSummary;
    createdPanelIds.push(panel.id);
    expect(panel.testIds).toHaveLength(5);
    expect(panel.testIds).toEqual(expect.arrayContaining(lftTestIds));
    expect(panel.price).toBe('600.00');
  });

  it('rejects a panel referencing a test from outside the facility with 400', () =>
    request(server)
      .post('/lab-panels')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `${PREFIX}BADPANEL`,
        name: 'Bad Panel',
        testIds: ['00000000-0000-0000-0000-000000000000'],
      })
      .expect(400));

  it('replaces the test set: an LFT trimmed to three tests keeps only those', async () => {
    const id = createdPanelIds[0];
    const res = await request(server)
      .put(`/lab-panels/${id}/tests`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ testIds: lftTestIds.slice(0, 3) })
      .expect(200);

    const panel = res.body as LabPanelSummary;
    expect(panel.testIds).toHaveLength(3);
    expect(panel.testIds).toEqual(expect.arrayContaining(lftTestIds.slice(0, 3)));
  });

  it('rejects a duplicate panel code with 409', () =>
    request(server)
      .post('/lab-panels')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `${PREFIX}LFT`, name: 'Dup', testIds: [] })
      .expect(409));

  it('denies a lab technician the panel catalog (panel.manage is admin-only)', () =>
    request(server).get('/lab-panels').set('Authorization', `Bearer ${labTechToken}`).expect(403));

  it('audits the panel creation, attributable to the admin', async () => {
    const rows = await prisma.auditLog.findMany({
      where: { entity: 'LabPanel', entityId: createdPanelIds[0], action: AuditAction.create },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(adminId);
  });
});
