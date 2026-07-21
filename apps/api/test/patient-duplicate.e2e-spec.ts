import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { DuplicateCheckResponse, LoginResponse, PatientSummary } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 3.3 — duplicate detection. Needs a seeded database (roles).
 *
 * The done-when: the desk is warned before it creates a second Najila. The warning is
 * graded, and the grading is the whole design — a repeated PHONE stops the save, a merely
 * similar NAME never does. Twelve Najilas is the normal state of an Afghan register; a
 * check that blocked on the name would be turned off within a week.
 *
 * The Arabic-script cases matter as much as the logic: the same name typed on an Arabic
 * keyboard and a Persian one is different bytes, and a duplicate check that misses that
 * misses most real duplicates.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_pdup_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Patient duplicate detection (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let receptionistToken: string;
  let doctorToken: string;

  const NAJILA_PHONE = '0700777001';

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Dup ${suffix}`,
        passwordHash: await hash(PASSWORD),
      },
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return user.id;
  }

  async function login(username: string): Promise<string> {
    const res = await request(server)
      .post('/auth/login')
      .send({ username, password: PASSWORD })
      .expect(200);
    return (res.body as LoginResponse).accessToken;
  }

  function walkIn(overrides: Record<string, unknown> = {}) {
    return {
      firstName: 'Najila',
      lastName: 'Ahmadi',
      gender: 'female',
      phone: NAJILA_PHONE,
      estimatedAgeYears: 30,
      ...overrides,
    };
  }

  function post(body: unknown, token = receptionistToken) {
    return request(server).post('/patients').set('Authorization', `Bearer ${token}`).send(body);
  }

  function check(query: Record<string, string>, token = receptionistToken) {
    return request(server)
      .get('/patients/duplicates')
      .query(query)
      .set('Authorization', `Bearer ${token}`);
  }

  async function cleanup(): Promise<void> {
    await prisma.auditLog.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.patient.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.numberSequence.deleteMany({
      where: { facility: { code: { startsWith: PREFIX } } },
    });
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
      data: { code: `${PREFIX}fac`, name: 'E2E Dup Facility' },
    });
    facilityId = facility.id;

    await seedActor('receptionist', 'receptionist');
    await seedActor('doctor', 'doctor');
    receptionistToken = await login(`${PREFIX}receptionist`);
    doctorToken = await login(`${PREFIX}doctor`);

    // The original Najila everything else is compared against.
    await post(walkIn()).expect(201);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  it('the done-when: warns before creating a second Najila on the same number', async () => {
    const res = await post(walkIn()).expect(409);
    const body = res.body as { code: string; matches: Array<{ confidence: string }> };
    expect(body.code).toBe('duplicate_patient');
    expect(body.matches.length).toBeGreaterThan(0);
    expect(body.matches[0].confidence).toBe('high');
  });

  it('registers anyway once the desk acknowledges it — a household can share a phone', async () => {
    const res = await post(walkIn({ acknowledgeDuplicate: true })).expect(201);
    expect((res.body as PatientSummary).id).toEqual(expect.any(String));
  });

  it('does NOT block a shared name on a different number — twelve Najilas is normal', () =>
    post(walkIn({ phone: '0700777002' })).expect(201));

  it('still reports the shared name as a possible match, without blocking', async () => {
    const res = await check({
      firstName: 'Najila',
      lastName: 'Ahmadi',
      phone: '0700777099',
    }).expect(200);
    const { matches } = res.body as DuplicateCheckResponse;
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.confidence === 'possible')).toBe(true);
    expect(matches[0].reasons).toContain('name');
  });

  it('grades a repeated phone as high confidence', async () => {
    const res = await check({ firstName: 'Someone', lastName: 'Else', phone: NAJILA_PHONE }).expect(
      200,
    );
    const { matches } = res.body as DuplicateCheckResponse;
    expect(matches[0].confidence).toBe('high');
    expect(matches[0].reasons).toContain('phone');
  });

  it('ignores spacing in the number being checked', async () => {
    const res = await check({ firstName: 'Someone', phone: '0700 777 001' }).expect(200);
    expect((res.body as DuplicateCheckResponse).matches[0].confidence).toBe('high');
  });

  it('catches a one-letter slip in the name', async () => {
    // "Najilla" — the kind of typo that creates a second record for one person.
    const res = await check({ firstName: 'Najilla', lastName: 'Ahmadi' }).expect(200);
    const { matches } = res.body as DuplicateCheckResponse;
    expect(matches.some((m) => m.reasons.includes('name'))).toBe(true);
  });

  it('matches the same Arabic-script name typed with different letterforms', async () => {
    await post(walkIn({ firstName: 'نجیلا', lastName: 'احمدی', phone: '0700777010' })).expect(201);

    // Arabic yeh (ي) and kaf where the register holds the Persian forms (ی).
    const res = await check({ firstName: 'نجيلا', lastName: 'احمدي' }).expect(200);
    const { matches } = res.body as DuplicateCheckResponse;
    expect(matches.some((m) => m.reasons.includes('name'))).toBe(true);
  });

  it('does not flag a genuinely different patient', async () => {
    const res = await check({
      firstName: 'Abdulrahman',
      lastName: 'Karimi',
      phone: '0788999888',
    }).expect(200);
    expect((res.body as DuplicateCheckResponse).matches).toEqual([]);
  });

  it('never reaches another facility’s register', async () => {
    const other = await prisma.facility.create({
      data: { code: `${PREFIX}other`, name: 'E2E Dup Other' },
    });
    await prisma.patient.create({
      data: {
        facilityId: other.id,
        mrn: `${PREFIX}FOREIGN`,
        // A name that exists ONLY in the other facility, so any match proves a leak
        // rather than a legitimate local hit on a common name.
        firstName: 'Wazhma',
        lastName: 'Sherzai',
        gender: 'female',
        phone: '0700777500',
        estimatedAgeYears: 30,
        ageRecordedAt: new Date(),
      },
    });

    const res = await check({
      firstName: 'Wazhma',
      lastName: 'Sherzai',
      phone: '0700777500',
    }).expect(200);
    expect((res.body as DuplicateCheckResponse).matches).toEqual([]);
  });

  it('lets a doctor run the check — it reveals nothing search would not', () =>
    check({ firstName: 'Najila' }, doctorToken).expect(200));

  it('rejects a check with no name (400)', () =>
    request(server)
      .get('/patients/duplicates')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(400));

  it('rejects an unauthenticated check (401)', () =>
    request(server).get('/patients/duplicates').query({ firstName: 'Najila' }).expect(401));
});
