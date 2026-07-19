import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse, ServiceListResponse, ServiceSummary } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 2.3 — service catalogue + fees. Needs a seeded database.
 *
 * The headline test is the done-when: an admin sets the OPD consultation fee. The
 * rest guards what makes it safe — only admin, the fee keeps exact two-decimal
 * precision (never a float), a foreign department is a 404, a duplicate code a 409,
 * a bad fee a 400, and deactivation is reversible.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_svc_';
const PASSWORD = 'e2e-test-password-not-a-secret';
const SVC_CODE = `${PREFIX}OPDCONSULT`;

describe('Service catalogue (e2e)', () => {
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
        fullName: `E2E Svc ${suffix}`,
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
    await prisma.service.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.department.deleteMany({ where: { code: { startsWith: PREFIX } } });
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
    await cleanup();

    adminId = await seedActor('admin', 'admin');
    receptionistId = await seedActor('receptionist', 'receptionist');
    adminToken = await login(`${PREFIX}admin`, PASSWORD);
    receptionistToken = await login(`${PREFIX}receptionist`, PASSWORD);

    const department = await prisma.department.create({
      data: { facilityId, code: `${PREFIX}OPD`, name: 'E2E OPD', type: 'opd' },
    });
    departmentId = department.id;
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: createdIds } } });
    }
    await prisma.auditLog.deleteMany({ where: { userId: { in: [adminId, receptionistId] } } });
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  it('the done-when: an admin sets the OPD consultation fee, kept to exact 2dp', async () => {
    const res = await request(server)
      .post('/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ departmentId, code: SVC_CODE, name: 'OPD Consultation', fee: '150.5' })
      .expect(201);

    const created = res.body as ServiceSummary;
    createdIds.push(created.id);
    expect(created.code).toBe(SVC_CODE);
    // 150.5 in, "150.50" out — exact two-decimal money, formatted by the server.
    expect(created.fee).toBe('150.50');
    expect(created.isActive).toBe(true);
  });

  it('a fee is stored as a string, never a JSON number', async () => {
    const res = await request(server)
      .get('/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const raw = JSON.stringify(res.body);
    // The fee value must appear quoted ("150.50"), not bare (150.5) — proof it never
    // round-trips through a float.
    expect(raw).toContain('"150.50"');
  });

  it('rejects a service on a department not in this facility with 404', () =>
    request(server)
      .post('/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        departmentId: '00000000-0000-0000-0000-000000000000',
        code: `${PREFIX}orphan`,
        name: 'Orphan',
        fee: '10.00',
      })
      .expect(404));

  it('rejects a duplicate code with 409', () =>
    request(server)
      .post('/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ departmentId, code: SVC_CODE, name: 'Clash', fee: '1.00' })
      .expect(409));

  it('rejects a bad fee with 400', () =>
    request(server)
      .post('/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ departmentId, code: `${PREFIX}badfee`, name: 'Bad Fee', fee: '10.999' })
      .expect(400));

  it('denies a non-admin the create endpoint', () =>
    request(server)
      .post('/services')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ departmentId, code: `${PREFIX}nope`, name: 'Nope', fee: '1.00' })
      .expect(403));

  it('updates the fee (the price change), keeping 2dp', async () => {
    const res = await request(server)
      .patch(`/services/${createdIds[0]}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'OPD Consultation', fee: '200' })
      .expect(200);
    expect((res.body as ServiceSummary).fee).toBe('200.00');
  });

  it('deactivation is reversible: a deactivated service is still listed', async () => {
    const id = createdIds[0];
    await request(server)
      .patch(`/services/${id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    const list = await request(server)
      .get('/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const found = (list.body as ServiceListResponse).services.find((s) => s.id === id);
    expect(found).toBeDefined();
    expect(found?.isActive).toBe(false);

    await request(server)
      .patch(`/services/${id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true })
      .expect(200);
  });

  it('audits the service creation, attributable to the admin', async () => {
    const rows = await prisma.auditLog.findMany({
      where: { entity: 'Service', entityId: createdIds[0], action: AuditAction.create },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(adminId);
  });
});
