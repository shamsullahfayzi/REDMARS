import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';
import { RequirePermission } from './../src/auth/decorators/require-permission.decorator';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * Task 1.4 — the audit trail.
 *
 * Needs a reachable, seeded database: `pnpm db:up && pnpm db:seed`. Like the 1.3
 * suite, the roles are the real seeded ones and the users are made and destroyed
 * here, prefixed e2e_audit_ so a crashed run leaves something obviously disposable.
 *
 * The whole point is to prove the loop end-to-end: an authenticated request runs a
 * write, the interceptor stamps WHO into the AsyncLocalStorage scope, and the
 * Prisma layer — which only sees WHAT changed — reads that actor back out and
 * lands an audit_log row. Neither half is testable alone; this drives both.
 */

/**
 * Runs a create → update → delete on a throwaway AppUser, through the AUDITED
 * client (`prisma.db`). Three writes in one request means all three audit rows
 * are attributed to the same actor — the caller of this route.
 */
@Controller('audit-probe')
class AuditProbeController {
  constructor(private readonly prisma: PrismaService) {}

  // Guarded, not @Public: we need request.auth populated so the interceptor has an
  // actor to stamp. The doctor holds patient.read_clinical unconditionally; the
  // permission is just a lever to get an authenticated request, the route does not
  // read anything clinical.
  @RequirePermission('patient.read_clinical')
  @Post('lifecycle')
  async lifecycle(@Body() body: { facilityId: string }) {
    const suffix = Math.random().toString(36).slice(2, 10);
    const created = await this.prisma.db.appUser.create({
      data: {
        facilityId: body.facilityId,
        username: `e2e_audit_subject_${suffix}`,
        fullName: 'Before Name',
        // Any string — the point is that it must NOT appear in the audit row.
        passwordHash: 'not-a-real-hash-plaintext-marker',
      },
    });

    await this.prisma.db.appUser.update({
      where: { id: created.id },
      data: { fullName: 'After Name' },
    });

    await this.prisma.db.appUser.delete({ where: { id: created.id } });

    return { id: created.id };
  }
}

const prisma = new PrismaClient();
const PREFIX = 'e2e_audit_';
const PASSWORD = 'e2e-test-password-not-a-secret';

interface AuditRow {
  action: AuditAction;
  entity: string;
  entityId: string | null;
  userId: string | null;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
}

describe('AuditInterceptor + Prisma audit (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let actorUserId: string;
  let actorToken: string;
  let subjectId: string;

  jest.setTimeout(60_000);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [AuditProbeController],
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
    facilityId = facility.id;

    const actor = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}actor`,
        fullName: 'E2E Audit Actor',
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

    // Drive the write loop. Everything under test happens inside this one request.
    const probe = await request(server)
      .post('/audit-probe/lifecycle')
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ facilityId })
      .expect(201);
    subjectId = (probe.body as { id: string }).id;
  });

  afterAll(async () => {
    // The subject user is already deleted by the probe; clean its audit rows and
    // the actor, plus any audit rows we created, so reruns start clean.
    await prisma.auditLog.deleteMany({ where: { entityId: subjectId } });
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });
    // The actor's own login wrote an audit row (lastLoginAt update on AppUser).
    await prisma.auditLog.deleteMany({ where: { entityId: actorUserId } });
    await prisma.$disconnect();
    await app.close();
  });

  async function auditRowsForSubject(): Promise<AuditRow[]> {
    return prisma.auditLog.findMany({
      where: { entity: 'AppUser', entityId: subjectId },
      orderBy: { createdAt: 'asc' },
    });
  }

  it('leaves exactly three rows — one per write — for the subject', async () => {
    const rows = await auditRowsForSubject();
    expect(rows.map((r) => r.action)).toEqual([
      AuditAction.create,
      AuditAction.update,
      AuditAction.delete,
    ]);
  });

  it('attributes every row to the authenticated actor (the ALS bridge works)', async () => {
    const rows = await auditRowsForSubject();
    for (const row of rows) {
      expect(row.userId).toBe(actorUserId);
      expect(row.entityId).toBe(subjectId);
    }
  });

  it('records the create with a null before and a populated after', async () => {
    const [create] = await auditRowsForSubject();
    expect(create.before).toBeNull();
    expect((create.after as { username: string }).username).toContain('e2e_audit_subject_');
  });

  it('records the update with the real before AND after — the hard half of the done-when', async () => {
    const rows = await auditRowsForSubject();
    const update = rows[1];
    expect((update.before as { fullName: string }).fullName).toBe('Before Name');
    expect((update.after as { fullName: string }).fullName).toBe('After Name');
  });

  it('records the delete with a populated before and a null after', async () => {
    const rows = await auditRowsForSubject();
    const del = rows[2];
    expect((del.before as { fullName: string }).fullName).toBe('After Name');
    expect(del.after).toBeNull();
  });

  it('NEVER writes the password hash into the audit trail', async () => {
    const rows = await auditRowsForSubject();
    for (const row of rows) {
      const before = row.before as { passwordHash?: string } | null;
      const after = row.after as { passwordHash?: string } | null;
      // Redacted where present, and the plaintext marker never leaks.
      if (before?.passwordHash !== undefined) expect(before.passwordHash).toBe('[redacted]');
      if (after?.passwordHash !== undefined) expect(after.passwordHash).toBe('[redacted]');
      expect(JSON.stringify(row)).not.toContain('not-a-real-hash-plaintext-marker');
    }
  });

  it('records the caller ip address', async () => {
    const [create] = await auditRowsForSubject();
    expect(create.ipAddress).toBeTruthy();
  });

  it('does not audit its own audit writes (no infinite loop)', async () => {
    const selfAudit = await prisma.auditLog.count({ where: { entity: 'AuditLog' } });
    expect(selfAudit).toBe(0);
  });
});
