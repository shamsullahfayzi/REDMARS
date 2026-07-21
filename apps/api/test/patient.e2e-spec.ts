import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse, PatientSummary } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 3.1 — patient registration. Needs a seeded database (roles).
 *
 * The done-when: a receptionist registers a walk-in and the server hands back an MRN she
 * never typed. This spec runs in its own facility so the NumberSequence counter starts
 * clean and the first patient is provably MRN-000001.
 *
 * The rest guards the decisions that are easy to get wrong and invisible when they are:
 * an estimated age is anchored (or it silently rots), a real date of birth is NOT, a
 * patient with no family name is registerable, and the age rule is cross-field — neither
 * path required alone, one of them required together.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_patient_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Patient registration (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let receptionistId: string;
  let receptionistToken: string;
  let doctorToken: string;
  let adminToken: string;

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Patient ${suffix}`,
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

  /** A valid walk-in: the four fields the desk actually asks. */
  function walkIn(overrides: Record<string, unknown> = {}) {
    return {
      firstName: 'Najila',
      lastName: 'Ahmadi',
      gender: 'female',
      phone: '0700123456',
      estimatedAgeYears: 30,
      ...overrides,
    };
  }

  function post(body: unknown, token = receptionistToken) {
    return request(server).post('/patients').set('Authorization', `Bearer ${token}`).send(body);
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
      data: { code: `${PREFIX}fac`, name: 'E2E Patient Facility' },
    });
    facilityId = facility.id;

    receptionistId = await seedActor('receptionist', 'receptionist');
    await seedActor('doctor', 'doctor');
    await seedActor('admin', 'admin');
    receptionistToken = await login(`${PREFIX}receptionist`);
    doctorToken = await login(`${PREFIX}doctor`);
    adminToken = await login(`${PREFIX}admin`);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  it('the done-when: a receptionist registers a walk-in and gets an MRN back', async () => {
    const res = await post(walkIn()).expect(201);
    const patient = res.body as PatientSummary;

    // She never typed this — the NumberSequence issuer minted it. First patient in a
    // fresh facility, and the sequence is lifelong (not per-year), so it is 000001.
    expect(patient.mrn).toBe('MRN-000001');
    expect(patient.firstName).toBe('Najila');
    expect(patient.id).toEqual(expect.any(String));
  });

  it('issues gapless MRNs — the next registration is 000002', async () => {
    const res = await post(walkIn({ firstName: 'Zahra', phone: '0700222333' })).expect(201);
    expect((res.body as PatientSummary).mrn).toBe('MRN-000002');
  });

  it('anchors an estimated age, so the number cannot silently rot', async () => {
    const res = await post(walkIn({ firstName: 'Anchored', estimatedAgeYears: 42 })).expect(201);
    const row = await prisma.patient.findUniqueOrThrow({
      where: { id: (res.body as PatientSummary).id },
    });
    expect(row.estimatedAgeYears).toBe(42);
    // Without this, "42" means nothing three years from now.
    expect(row.ageRecordedAt).not.toBeNull();
  });

  it('does NOT anchor a real date of birth — a birthday never rots', async () => {
    const res = await post(
      walkIn({ firstName: 'Dated', estimatedAgeYears: null, dateOfBirth: '1990-05-14' }),
    ).expect(201);
    const row = await prisma.patient.findUniqueOrThrow({
      where: { id: (res.body as PatientSummary).id },
    });
    expect(row.ageRecordedAt).toBeNull();
    expect(row.dateOfBirth?.toISOString().slice(0, 10)).toBe('1990-05-14');
  });

  it('registers an infant by months rather than years', async () => {
    const res = await post(
      walkIn({ firstName: 'Baby', estimatedAgeYears: null, estimatedAgeMonths: 6 }),
    ).expect(201);
    const row = await prisma.patient.findUniqueOrThrow({
      where: { id: (res.body as PatientSummary).id },
    });
    expect(row.estimatedAgeMonths).toBe(6);
    expect(row.estimatedAgeYears).toBeNull();
  });

  it('registers a patient with no family name — blank beats invented', async () => {
    const res = await post(walkIn({ firstName: 'Najila', lastName: null })).expect(201);
    expect((res.body as PatientSummary).lastName).toBeNull();
  });

  it('rejects a registration with neither an age nor a date of birth (400)', () =>
    post(walkIn({ estimatedAgeYears: null })).expect(400));

  it('rejects a registration with no phone (400) — the desk always asks', () =>
    post(walkIn({ phone: '' })).expect(400));

  it('rejects a bad body — empty first name (400)', () =>
    post(walkIn({ firstName: '' })).expect(400));

  it('denies a doctor: registration is the desk’s job (403)', () =>
    post(walkIn({ phone: '0700999888' }), doctorToken).expect(403));

  it('denies an admin too — patient.create sits on receptionist alone (403)', () =>
    post(walkIn({ phone: '0700999777' }), adminToken).expect(403));

  it('rejects an unauthenticated registration (401)', () =>
    request(server).post('/patients').send(walkIn()).expect(401));

  it('scopes the patient to the caller’s facility', async () => {
    const res = await post(walkIn({ firstName: 'Scoped', phone: '0700444555' })).expect(201);
    const row = await prisma.patient.findUniqueOrThrow({
      where: { id: (res.body as PatientSummary).id },
    });
    expect(row.facilityId).toBe(facilityId);
    expect(row.createdBy).toBe(receptionistId);
  });

  it('audits the registration, attributable to the receptionist', async () => {
    const res = await post(walkIn({ firstName: 'Audited', phone: '0700666777' })).expect(201);
    const rows = await prisma.auditLog.findMany({
      where: {
        entity: 'Patient',
        entityId: (res.body as PatientSummary).id,
        action: AuditAction.create,
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(receptionistId);
  });
});
