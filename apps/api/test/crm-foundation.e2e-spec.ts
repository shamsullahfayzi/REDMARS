import { createHash, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  CRM_DEFAULT_SETTINGS,
  crmWorkspaceSchema,
  crmSettingsResponseSchema,
  meResponseSchema,
  type LoginResponse,
} from '@redmars/shared';
import { AppModule } from '../src/app.module';
import { RateLimitService } from '../src/common/rate-limit.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('CRM foundation', () => {
  jest.setTimeout(60000);
  const db = new PrismaClient();
  const prefix = `e2e_crm_${randomUUID()}`;
  const password = 'CRM-test-password-not-a-secret';
  let app: INestApplication<App>, server: App;
  let facilityId: string, otherFacilityId: string;
  const tokens: Record<string, string> = {};
  const users: Record<string, string> = {};
  const bucketKey = (facility: string, user: string, scope: string) =>
    createHash('sha256')
      .update(JSON.stringify([facility, user, scope]))
      .digest('hex');
  const read = (actor = 'admin') =>
    request(server).get('/crm/workspace').set('Authorization', `Bearer ${tokens[actor]}`);
  const save = (body: unknown, actor = 'admin') =>
    request(server).put('/crm/settings').set('Authorization', `Bearer ${tokens[actor]}`).send(body);
  const input = (version = 0, name = 'Hospital contact centre') => ({
    ...CRM_DEFAULT_SETTINGS,
    workspaceName: name,
    serviceAreas: ['Outpatient enquiries'],
    expectedVersion: version,
  });
  const toggle = (enabled: boolean) =>
    request(server)
      .patch('/facility-modules/crm')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ enabled });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    facilityId = (
      await db.facility.create({ data: { code: `${prefix}_a`, name: 'CRM fixture A' } })
    ).id;
    otherFacilityId = (
      await db.facility.create({ data: { code: `${prefix}_b`, name: 'CRM fixture B' } })
    ).id;
    const passwordHash = await hash(password);
    for (const [name, role, facility] of [
      ['admin', 'admin', facilityId],
      ['agent', 'call_center', facilityId],
      ['doctor', 'doctor', facilityId],
      ['other', 'admin', otherFacilityId],
    ]) {
      const user = await db.appUser.create({
        data: {
          facilityId: facility,
          username: `${prefix}_${name}`,
          fullName: `CRM fixture ${name}`,
          passwordHash,
        },
      });
      users[name] = user.id;
      const roleRow = await db.role.findUniqueOrThrow({ where: { code: role } });
      await db.userRole.create({ data: { userId: user.id, roleId: roleRow.id } });
      const login = await request(server)
        .post('/auth/login')
        .send({ username: user.username, password })
        .expect(200);
      tokens[name] = (login.body as LoginResponse).accessToken;
    }
  });

  beforeEach(async () => {
    await db.setting.deleteMany({
      where: { facilityId: { in: [facilityId, otherFacilityId] }, key: 'crm.settings' },
    });
    const keys = Object.entries(users).flatMap(([name, id]) =>
      ['crm.read', 'crm.write', 'crm.concurrency'].map((scope) =>
        bucketKey(name === 'other' ? otherFacilityId : facilityId, id, scope),
      ),
    );
    await db.rateLimitBucket.deleteMany({ where: { key: { in: keys } } });
    await toggle(true).expect(200);
  });

  afterAll(async () => {
    const facilities = [facilityId, otherFacilityId].filter(Boolean);
    await db.setting.deleteMany({ where: { facilityId: { in: facilities } } });
    await db.auditLog.deleteMany({ where: { facilityId: { in: facilities } } });
    await db.integrationEvent.deleteMany({ where: { facilityId: { in: facilities } } });
    await db.errorLog.deleteMany({ where: { facilityId: { in: facilities } } });
    await db.appUser.deleteMany({ where: { facilityId: { in: facilities } } });
    await db.facilityModule.deleteMany({ where: { facilityId: { in: facilities } } });
    await db.facility.deleteMany({ where: { id: { in: facilities } } });
    await app?.close();
    await db.$disconnect();
  });

  it('denies unauthenticated access and roles without CRM grants', async () => {
    await request(server).get('/crm/workspace').expect(401);
    await read('doctor').expect(403);
    await save(input(), 'agent').expect(403);
    await request(server)
      .patch('/facility-modules/crm')
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ enabled: true })
      .expect(403);
  });

  it('enforces the feature flag on direct reads and writes, and retains settings when disabled', async () => {
    await save(input()).expect(200);
    await toggle(false).expect(200);
    await read().expect(403);
    await save(input(1)).expect(403);
    const me = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);
    expect(meResponseSchema.parse(me.body).enabledModules).not.toContain('crm');
    await toggle(true).expect(200);
    expect(crmWorkspaceSchema.parse((await read().expect(200)).body).settings.workspaceName).toBe(
      'Hospital contact centre',
    );
  });

  it('gives call-centre users a working identity and minimal workspace without clinical data', async () => {
    const me = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokens.agent}`)
      .expect(200);
    expect(meResponseSchema.parse(me.body).enabledModules).toContain('crm');
    const result = await read('agent').expect(200);
    expect(crmWorkspaceSchema.safeParse(result.body).success).toBe(true);
    expect(crmWorkspaceSchema.parse(result.body).canConfigure).toBe(false);
    expect(Object.keys(result.body as Record<string, unknown>).sort()).toEqual([
      'canConfigure',
      'facilityName',
      'settings',
      'timezone',
    ]);
    expect(crmWorkspaceSchema.parse(result.body).settings.version).toBe(0);
    await request(server)
      .get('/patients')
      .set('Authorization', `Bearer ${tokens.agent}`)
      .expect(403);
  });

  it('does not enable CRM in another facility and rejects a supplied facility identifier', async () => {
    await read('other').expect(403);
    await save({ ...input(), facilityId: otherFacilityId }).expect(400);
    await db.facilityModule.create({
      data: { facilityId: otherFacilityId, module: 'crm', enabled: true },
    });
    await save(input()).expect(200);
    const other = await read('other').expect(200);
    expect(crmWorkspaceSchema.parse(other.body).facilityName).toBe('CRM fixture B');
    expect(crmWorkspaceSchema.parse(other.body).settings).toEqual({
      ...CRM_DEFAULT_SETTINGS,
      version: 0,
    });
  });

  it('validates settings and logs reads and transactional edits under the right actor', async () => {
    await save({ ...input(), workspaceName: ' ' }).expect(400);
    await save({ ...input(), serviceAreas: ['OPD', 'opd'] }).expect(400);
    await save({ ...input(), safeContactInstructions: 'x'.repeat(501) }).expect(400);
    await save({ ...input(), expectedVersion: -1 }).expect(400);
    const saved = await save(input()).expect(200);
    expect(crmSettingsResponseSchema.parse(saved.body).version).toBe(1);
    await read('agent').expect(200);
    const setting = await db.setting.findUniqueOrThrow({
      where: { facilityId_key: { facilityId, key: 'crm.settings' } },
    });
    expect(
      await db.auditLog.findFirst({
        where: {
          facilityId,
          userId: users.admin,
          entity: 'Setting',
          entityId: setting.id,
          action: 'create',
        },
      }),
    ).not.toBeNull();
    const readAudit = await db.auditLog.findFirst({
      where: { facilityId, userId: users.agent, entity: 'CrmWorkspace', action: 'read' },
    });
    expect(readAudit).not.toBeNull();
    expect(readAudit?.after).toBeNull();
  });

  it('rejects stale saves and allows only one concurrent edit', async () => {
    await save(input()).expect(200);
    await save(input(0, 'Stale overwrite')).expect(409);
    const results = await Promise.all([save(input(1, 'Editor one')), save(input(1, 'Editor two'))]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(crmWorkspaceSchema.parse((await read().expect(200)).body).settings.version).toBe(2);
  });

  it('limits reads independently of writes and users, sends retry guidance and resets expired counters', async () => {
    const key = bucketKey(facilityId, users.admin, 'crm.read');
    await db.rateLimitBucket.create({
      data: { key, count: 60, expiresAt: new Date(Date.now() + 60000) },
    });
    const denied = await read().expect(429);
    expect(Number(denied.headers['retry-after'])).toBeGreaterThan(0);
    await read('agent').expect(200);
    await save(input()).expect(200);
    await db.rateLimitBucket.update({
      where: { key },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await read().expect(200);
  });

  it('keeps one atomic rate counter across service instances', async () => {
    const limits = app.get(RateLimitService);
    const results = await Promise.all(
      Array.from({ length: 15 }, () =>
        limits.consume(facilityId, users.admin, 'crm.concurrency', 10),
      ),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    // A new client/service sees the same persisted limit; not process-local state.
    const secondDb = new PrismaService();
    try {
      expect(
        (
          await new RateLimitService(secondDb).consume(
            facilityId,
            users.admin,
            'crm.concurrency',
            10,
          )
        ).allowed,
      ).toBe(false);
    } finally {
      await secondDb.$disconnect();
    }
  });
});
