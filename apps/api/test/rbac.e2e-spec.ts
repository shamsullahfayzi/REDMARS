import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';
import type { AccessTokenPayload } from './../src/auth/auth.service';
import { Public } from './../src/auth/decorators/public.decorator';
import { RequirePermission } from './../src/auth/decorators/require-permission.decorator';

/**
 * Task 1.3 — the guards.
 *
 * Needs a reachable, seeded database: `pnpm db:up && pnpm db:seed`. The roles
 * and grants under test are the real ones from roles-and-permissions.md, not
 * fixtures, which is the point — a test against invented grants proves the guard
 * can read a map, not that a doctor cannot register a patient.
 *
 * The users are made and destroyed here. They are prefixed e2e_rbac_ so that a
 * crashed run leaves something obviously disposable behind rather than
 * something that looks like staff.
 */

/**
 * Routes that exist only for this file. There are no real permissioned
 * endpoints yet — 1.3 deliberately lands before them, so that RBAC is not
 * bolted onto a finished app — so the thing under test needs something to
 * guard. These carry real PermissionCodes; a typo here is a compile error.
 */
@Controller('probe')
class ProbeController {
  /** receptionist ✅, and nobody else at all — not even admin. */
  @RequirePermission('patient.create')
  @Get('register-patient')
  registerPatient() {
    return { ok: true };
  }

  /** doctor ✅, and nobody else. */
  @RequirePermission('prescription.write')
  @Get('prescribe')
  prescribe() {
    return { ok: true };
  }

  /** doctor ✅, nurse ⚠️ R7, admin ⚠️ R2, receptionist absent. */
  @RequirePermission('patient.read_clinical')
  @Get('read-clinical')
  readClinical() {
    return { ok: true };
  }

  /** R4 — granted to no role, deliberately. */
  @RequirePermission('patient.delete')
  @Get('delete-patient')
  deletePatient() {
    return { ok: true };
  }

  /** The forgotten-decorator case. Not @Public, declares nothing. Must fail closed. */
  @Get('forgotten')
  forgotten() {
    return { ok: true };
  }

  @Public()
  @Get('open')
  open() {
    return { ok: true };
  }
}

const prisma = new PrismaClient();
const PREFIX = 'e2e_rbac_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('RBAC guards (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const tokens: Record<string, string> = {};
  let deactivatedToken: string;
  let deactivatedUserId: string;

  jest.setTimeout(60_000);

  async function createUser(
    facilityId: string,
    passwordHash: string,
    suffix: string,
    roleCode: string | null,
  ) {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E ${suffix}`,
        passwordHash,
      },
    });

    if (roleCode) {
      const role = await prisma.role.findUniqueOrThrow({
        where: { code: roleCode },
      });
      await prisma.userRole.create({
        data: { userId: user.id, roleId: role.id },
      });
    }

    return user;
  }

  async function login(suffix: string): Promise<string> {
    const res = await request(server)
      .post('/auth/login')
      .send({ username: `${PREFIX}${suffix}`, password: PASSWORD })
      .expect(200);
    // supertest types body as any. Asserting the shared contract rather than
    // reaching into `any` means a change to LoginResponse breaks this file at
    // compile time instead of at 3am.
    return (res.body as LoginResponse).accessToken;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    await prisma.appUser.deleteMany({
      where: { username: { startsWith: PREFIX } },
    });

    const facility = await prisma.facility.findFirstOrThrow();
    // Hashed once. argon2 is ~100ms by design and six identical hashes would be
    // 600ms spent proving nothing.
    const passwordHash = await hash(PASSWORD);

    for (const role of ['doctor', 'receptionist', 'nurse', 'admin']) {
      await createUser(facility.id, passwordHash, role, role);
      tokens[role] = await login(role);
    }

    // Holds no role at all — what every user looked like before the 1.3 seed fix.
    await createUser(facility.id, passwordHash, 'noroles', null);
    tokens.noroles = await login('noroles');

    // Logs in while active, then gets deactivated with a live token in hand.
    const victim = await createUser(facility.id, passwordHash, 'deactivated', 'doctor');
    deactivatedUserId = victim.id;
    deactivatedToken = await login('deactivated');
  });

  afterAll(async () => {
    await prisma.appUser.deleteMany({
      where: { username: { startsWith: PREFIX } },
    });
    await prisma.$disconnect();
    await app.close();
  });

  const as = (token: string, path: string) =>
    request(server).get(path).set('Authorization', `Bearer ${token}`);

  describe('the done-when: a doctor calling a receptionist endpoint gets 403', () => {
    it('denies the doctor patient.create', async () => {
      const res = await as(tokens.doctor, '/probe/register-patient').expect(403);
      expect((res.body as { message: string }).message).toContain('patient.create');
    });

    it('allows the receptionist patient.create', () =>
      as(tokens.receptionist, '/probe/register-patient').expect(200));

    it('denies the receptionist prescription.write', () =>
      as(tokens.receptionist, '/probe/prescribe').expect(403));

    it('allows the doctor prescription.write', () =>
      as(tokens.doctor, '/probe/prescribe').expect(200));
  });

  describe('the matrix is actually the thing being read', () => {
    it('lets the doctor read clinical data unconditionally', () =>
      as(tokens.doctor, '/probe/read-clinical').expect(200));

    it('denies the receptionist clinical data — she holds no such grant', () =>
      as(tokens.receptionist, '/probe/read-clinical').expect(403));

    // Documents D2 rather than endorsing it: R7 says a nurse sees vitals,
    // allergies and drugs. The guard cannot enforce that subset, so it passes.
    // The 200 here is the guard saying "she has the grant", NOT "R7 is honoured".
    // Phase 3 owes the filtering. If this test ever reads as reassuring, reread it.
    it('passes a nurse through on a ⚠️ R7 grant WITHOUT enforcing R7', () =>
      as(tokens.nurse, '/probe/read-clinical').expect(200));

    it('denies patient.delete to a doctor — R4 grants it to nobody', () =>
      as(tokens.doctor, '/probe/delete-patient').expect(403));

    it('denies patient.delete to an admin too', () =>
      as(tokens.admin, '/probe/delete-patient').expect(403));

    it('denies everything to a user holding no roles', () =>
      as(tokens.noroles, '/probe/register-patient').expect(403));
  });

  describe('absence is denial', () => {
    it('denies a route that declares no permission, even to an admin', () =>
      as(tokens.admin, '/probe/forgotten').expect(403));

    it('allows a @Public route with no token at all', () =>
      request(server).get('/probe/open').expect(200));

    it('leaves /health public', () => request(server).get('/health').expect(200));
  });

  describe('authentication', () => {
    it('401s with no Authorization header', () =>
      request(server).get('/probe/prescribe').expect(401));

    it('401s on a malformed Authorization header', () =>
      request(server).get('/probe/prescribe').set('Authorization', tokens.doctor).expect(401));

    it('401s on the wrong scheme', () =>
      request(server)
        .get('/probe/prescribe')
        .set('Authorization', `Basic ${tokens.doctor}`)
        .expect(401));

    it('401s on a garbage token', () => as('not.a.jwt', '/probe/prescribe').expect(401));

    it('401s on a token with a tampered payload', async () => {
      const [header, payload, signature] = tokens.receptionist.split('.');
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as AccessTokenPayload;
      claims.username = 'somebody-else';
      const forged = Buffer.from(JSON.stringify(claims)).toString('base64url');
      await as(`${header}.${forged}.${signature}`, '/probe/register-patient').expect(401);
    });

    it('401s on an alg:none token', async () => {
      // The classic: strip the signature and tell the verifier not to expect
      // one. Rejected because JwtAuthGuard pins algorithms: ['HS256'] at verify.
      const [, payload] = tokens.doctor.split('.');
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      await as(`${header}.${payload}.`, '/probe/prescribe').expect(401);
    });

    it('rejects a live token the moment its user is deactivated', async () => {
      // The token is valid, unexpired and correctly signed. It stops working
      // anyway, because standing is read from the database and not from the
      // token. This is the 15-minute hole D1 pays a query per request to close.
      await as(deactivatedToken, '/probe/prescribe').expect(200);
      await prisma.appUser.update({
        where: { id: deactivatedUserId },
        data: { isActive: false },
      });
      await as(deactivatedToken, '/probe/prescribe').expect(401);
    });
  });
});
