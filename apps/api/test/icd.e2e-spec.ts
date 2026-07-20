import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { IcdSearchResponse, LoginResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 2.9 — ICD-10 diagnosis lookup. Needs a seeded database (roles, a facility).
 *
 * The done-when: typing "depress" surfaces the F32.x codes. The rest guards the
 * search — a code prefix matches ("F32" -> F32.x), a too-short query is refused, the
 * limit is honoured, and only a diagnosis-reader (doctor/admin) may search at all.
 *
 * The catalog rows asserted on are REAL ICD-10 codes, upserted idempotently exactly
 * as the seed would create them. They are canonical reference data shared across the
 * deployment, so afterAll does NOT delete them — removing F32.1 from a seeded dev
 * database would be corrupting real data, not cleaning up a fixture.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_icd_';
const PASSWORD = 'e2e-test-password-not-a-secret';

// Canonical codes the search asserts against.
const CANONICAL = [
  {
    code: 'F32.0',
    title: 'Mild depressive episode',
    chapter: 'Mental and behavioural',
    isBillable: true,
  },
  {
    code: 'F32.1',
    title: 'Moderate depressive episode',
    chapter: 'Mental and behavioural',
    isBillable: true,
  },
  {
    code: 'F41.1',
    title: 'Generalized anxiety disorder',
    chapter: 'Mental and behavioural',
    isBillable: true,
  },
  {
    code: 'I10',
    title: 'Essential (primary) hypertension',
    chapter: 'Circulatory',
    isBillable: true,
  },
];

describe('ICD lookup (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let doctorToken: string;
  let adminToken: string;
  let receptionistToken: string;

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<void> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E ICD ${suffix}`,
        passwordHash: await hash(PASSWORD),
      },
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }

  async function login(username: string): Promise<string> {
    const res = await request(server)
      .post('/auth/login')
      .send({ username, password: PASSWORD })
      .expect(200);
    return (res.body as LoginResponse).accessToken;
  }

  function search(q: string, token: string, limit?: number) {
    const req = request(server).get('/icd').set('Authorization', `Bearer ${token}`).query({ q });
    return limit === undefined ? req : req.query({ limit });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    facilityId = (await prisma.facility.findFirstOrThrow()).id;
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });

    for (const row of CANONICAL) {
      await prisma.icdCode.upsert({ where: { code: row.code }, update: row, create: row });
    }

    await seedActor('doctor', 'doctor');
    await seedActor('admin', 'admin');
    await seedActor('receptionist', 'receptionist');
    doctorToken = await login(`${PREFIX}doctor`);
    adminToken = await login(`${PREFIX}admin`);
    receptionistToken = await login(`${PREFIX}receptionist`);
  });

  afterAll(async () => {
    // Canonical ICD rows are left in place on purpose — see the file header.
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('the done-when: typing "depress" surfaces the F32.x codes', async () => {
    const res = await search('depress', doctorToken).expect(200);
    const { results } = res.body as IcdSearchResponse;

    expect(results.some((r) => r.code === 'F32.1')).toBe(true);
    expect(results.every((r) => /depress/i.test(r.title))).toBe(true);
    const f32 = results.find((r) => r.code === 'F32.1');
    expect(f32?.title).toBe('Moderate depressive episode');
  });

  it('matches a code prefix: "F32" returns only F32.x', async () => {
    const res = await search('F32', doctorToken).expect(200);
    const { results } = res.body as IcdSearchResponse;
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.code.startsWith('F32'))).toBe(true);
  });

  it('is case-insensitive on the code prefix: lowercase "f32" still matches', async () => {
    const res = await search('f32', doctorToken).expect(200);
    const { results } = res.body as IcdSearchResponse;
    expect(results.some((r) => r.code === 'F32.0')).toBe(true);
  });

  it('caps results at the requested limit', async () => {
    const res = await search('F3', doctorToken, 1).expect(200);
    const { results } = res.body as IcdSearchResponse;
    expect(results).toHaveLength(1);
  });

  it('rejects a one-character query with 400', () => search('d', doctorToken).expect(400));

  it('an admin may search (diagnosis.read, R2)', () => search('anxiety', adminToken).expect(200));

  it('denies a receptionist the lookup', () => search('depress', receptionistToken).expect(403));

  it('returns an empty list for a query that matches nothing', async () => {
    const res = await search('zzzznotacode', doctorToken).expect(200);
    expect((res.body as IcdSearchResponse).results).toHaveLength(0);
  });
});
