import { randomUUID } from 'node:crypto';
import { Controller, Get, INestApplication, Param } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';
import { AuditRead } from './../src/audit/decorators/audit-read.decorator';
import { RequirePermission } from './../src/auth/decorators/require-permission.decorator';

/**
 * Task 1.5 — Rule R1: every clinical read is audited, none are blocked.
 *
 * Needs a reachable, seeded database. The proof has two halves: a route MARKED
 * @AuditRead leaves an action: read row (and still returns 200 — R1 never blocks),
 * and an unmarked route leaves nothing. The second half is the point of the whole
 * design: reads are opt-in, so the machinery reads every request makes — the
 * JwtAuthGuard loading an AppUser, the guards resolving permissions — must NOT
 * land in the audit trail.
 */
@Controller('audit-read-probe')
class AuditReadProbeController {
  // A clinical read: gated by the permission, logged by the decorator. The two are
  // orthogonal — one decides whether, the other records that it happened.
  @RequirePermission('patient.read_clinical')
  @AuditRead('Patient')
  @Get('patient/:id')
  readPatient(@Param('id') id: string) {
    return { id, chart: 'clinical data the doctor is allowed to see' };
  }

  // Same gate, no @AuditRead. Reading this must leave no read row.
  @RequirePermission('patient.read_clinical')
  @Get('plain/:id')
  readPlain(@Param('id') id: string) {
    return { id };
  }
}

const prisma = new PrismaClient();
const PREFIX = 'e2e_auditread_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('AuditRead / Rule R1 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let actorUserId: string;
  let actorToken: string;
  const patientId = randomUUID();
  const plainId = randomUUID();

  jest.setTimeout(60_000);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [AuditReadProbeController],
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

    const facility = await prisma.facility.findFirstOrThrow();
    const actor = await prisma.appUser.create({
      data: {
        facilityId: facility.id,
        username: `${PREFIX}actor`,
        fullName: 'E2E Read Actor',
        passwordHash: await hash(PASSWORD),
      },
    });
    actorUserId = actor.id;
    const doctorRole = await prisma.role.findUniqueOrThrow({ where: { code: 'doctor' } });
    await prisma.userRole.create({ data: { userId: actor.id, roleId: doctorRole.id } });

    const res = await request(server)
      .post('/auth/login')
      .send({ username: `${PREFIX}actor`, password: PASSWORD })
      .expect(200);
    actorToken = (res.body as LoginResponse).accessToken;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [patientId, plainId] } } });
    await prisma.auditLog.deleteMany({ where: { entityId: actorUserId } });
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.$disconnect();
    await app.close();
  });

  const as = (path: string) =>
    request(server).get(path).set('Authorization', `Bearer ${actorToken}`);

  it('returns the record — a clinical read is NEVER blocked (R1)', () =>
    as(`/audit-read-probe/patient/${patientId}`).expect(200));

  it('logs exactly one action: read row for the marked route', async () => {
    // The read above already happened; re-reading would log a second row, so query
    // for what the first call left.
    const rows = await prisma.auditLog.findMany({
      where: { action: AuditAction.read, entityId: patientId },
    });
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.entity).toBe('Patient');
    expect(row.userId).toBe(actorUserId);
    expect(row.ipAddress).toBeTruthy();
    // A read changed nothing — both sides are null.
    expect(row.before).toBeNull();
    expect(row.after).toBeNull();
  });

  it('logs NOTHING for an unmarked read — reads are opt-in', async () => {
    await as(`/audit-read-probe/plain/${plainId}`).expect(200);
    const rows = await prisma.auditLog.count({ where: { entityId: plainId } });
    expect(rows).toBe(0);
  });

  it('never audits the machinery reads every request makes (no AppUser read rows)', async () => {
    // The JwtAuthGuard loads an AppUser on every request above. None of those are
    // @AuditRead, so none may appear as read rows — this is the flood R1's opt-in
    // design exists to prevent.
    const appUserReads = await prisma.auditLog.count({
      where: { action: AuditAction.read, entity: 'AppUser' },
    });
    expect(appUserReads).toBe(0);
  });
});
