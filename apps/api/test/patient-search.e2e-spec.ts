import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse, PatientSearchResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 3.2 — patient search. Needs a seeded database (roles).
 *
 * The done-when, stated exactly as the build order does: find "Najila" among twelve
 * Najilas by phone. Twelve patients share a first name and are indistinguishable by it;
 * the number is what separates them, and searching it must return exactly one.
 *
 * The rest guards what makes the box usable at a reception desk: one field matches all
 * three of name, MRN and phone; spacing in a phone number never decides a match; the
 * search cannot see another facility's register; and a role that may search but not
 * register still gets results.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_psearch_';
const PASSWORD = 'e2e-test-password-not-a-secret';
const NAJILA_COUNT = 12;

describe('Patient search (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let otherFacilityId: string;
  let receptionistToken: string;
  let doctorToken: string;
  let managementToken: string;
  /** The one Najila we will go looking for. */
  const TARGET_PHONE = '0700555111';
  let targetId: string;

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Search ${suffix}`,
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

  function search(q: string, token = receptionistToken) {
    return request(server).get('/patients').query({ q }).set('Authorization', `Bearer ${token}`);
  }

  async function cleanup(): Promise<void> {
    await prisma.auditLog.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.patient.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.numberSequence.deleteMany({
      where: { facility: { code: { startsWith: PREFIX } } },
    });
    // Again, and deliberately. The R1 read row is written fire-and-forget, so one can
    // land AFTER the sweep above and before the facility goes — and then the facility
    // delete fails on a foreign key, inside afterAll, which Jest reports as a failed suite
    // with no failed tests. Cheap to repeat, miserable to debug.
    await prisma.auditLog.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
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
      data: { code: `${PREFIX}fac`, name: 'E2E Search Facility' },
    });
    facilityId = facility.id;
    const other = await prisma.facility.create({
      data: { code: `${PREFIX}other`, name: 'E2E Search Other Facility' },
    });
    otherFacilityId = other.id;

    await seedActor('receptionist', 'receptionist');
    await seedActor('doctor', 'doctor');
    await seedActor('management', 'management');
    receptionistToken = await login(`${PREFIX}receptionist`);
    doctorToken = await login(`${PREFIX}doctor`);
    managementToken = await login(`${PREFIX}management`);

    // Twelve Najilas. Same first name, different numbers — exactly the situation the
    // desk faces, and the reason searching by name alone is not enough.
    for (let i = 0; i < NAJILA_COUNT; i += 1) {
      const isTarget = i === 7;
      const created = await prisma.patient.create({
        data: {
          facilityId,
          mrn: `${PREFIX}MRN-${String(i).padStart(4, '0')}`,
          firstName: 'Najila',
          lastName: `Family${i}`,
          gender: 'female',
          // Stored as digits, the way PatientService.normalisePhone writes them.
          phone: isTarget ? TARGET_PHONE : `070000${String(i).padStart(4, '0')}`,
          estimatedAgeYears: 30,
          ageRecordedAt: new Date(),
        },
      });
      if (isTarget) targetId = created.id;
    }

    // A patient in a DIFFERENT facility who would otherwise match every search.
    await prisma.patient.create({
      data: {
        facilityId: otherFacilityId,
        mrn: `${PREFIX}FOREIGN`,
        firstName: 'Najila',
        lastName: 'Foreign',
        gender: 'female',
        phone: TARGET_PHONE,
        estimatedAgeYears: 30,
        ageRecordedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  it('the done-when: finds one Najila among twelve, by phone', async () => {
    // The name alone is useless here — it matches all twelve.
    const byName = await search('Najila').expect(200);
    expect((byName.body as PatientSearchResponse).total).toBe(NAJILA_COUNT);

    // The number is what tells them apart.
    const byPhone = await search(TARGET_PHONE).expect(200);
    const found = byPhone.body as PatientSearchResponse;
    expect(found.total).toBe(1);
    expect(found.patients).toHaveLength(1);
    expect(found.patients[0].id).toBe(targetId);
    expect(found.patients[0].firstName).toBe('Najila');
  });

  it('ignores spacing in a typed phone number', async () => {
    // She types it the way it is written on the card; the register stores digits.
    const res = await search('0700 555 111').expect(200);
    const found = res.body as PatientSearchResponse;
    expect(found.total).toBe(1);
    expect(found.patients[0].id).toBe(targetId);
  });

  it('finds a patient by MRN', async () => {
    const res = await search(`${PREFIX}MRN-0007`).expect(200);
    const found = res.body as PatientSearchResponse;
    expect(found.total).toBe(1);
    expect(found.patients[0].id).toBe(targetId);
  });

  it('finds a patient by family name', async () => {
    const res = await search('Family3').expect(200);
    expect((res.body as PatientSearchResponse).total).toBe(1);
  });

  it('matches a name regardless of case', async () => {
    const res = await search('najila').expect(200);
    expect((res.body as PatientSearchResponse).total).toBe(NAJILA_COUNT);
  });

  it('never reaches another facility’s register', async () => {
    // The foreign patient shares this exact phone number and would match on it.
    const res = await search(TARGET_PHONE).expect(200);
    const found = res.body as PatientSearchResponse;
    expect(found.total).toBe(1);
    expect(found.patients[0].id).toBe(targetId);
  });

  it('returns the anchor so a stored age can be aged forward', async () => {
    const res = await search(TARGET_PHONE).expect(200);
    expect((res.body as PatientSearchResponse).patients[0].ageRecordedAt).not.toBeNull();
  });

  it('caps the page but reports the true total', async () => {
    const res = await request(server)
      .get('/patients')
      .query({ q: 'Najila', limit: 5 })
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);
    const found = res.body as PatientSearchResponse;
    expect(found.patients).toHaveLength(5);
    expect(found.total).toBe(NAJILA_COUNT);
  });

  it('returns nothing for a term that matches no one', async () => {
    const res = await search('Zzzznobody').expect(200);
    const found = res.body as PatientSearchResponse;
    expect(found.total).toBe(0);
    expect(found.patients).toEqual([]);
  });

  it('rejects a one-character search (400)', () => search('N').expect(400));

  it('lists the register when no term is given, rather than showing nothing', async () => {
    const res = await request(server)
      .get('/patients')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);
    const found = res.body as PatientSearchResponse;
    // Twelve Najilas in this facility; the foreign patient is not among them.
    expect(found.total).toBe(NAJILA_COUNT);
    expect(found.patients).toHaveLength(NAJILA_COUNT);
    expect(found.page).toBe(1);
  });

  it('pages the unfiltered list without overlapping', async () => {
    const first = await request(server)
      .get('/patients')
      .query({ page: 1, limit: 5 })
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);
    const second = await request(server)
      .get('/patients')
      .query({ page: 2, limit: 5 })
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);
    const third = await request(server)
      .get('/patients')
      .query({ page: 3, limit: 5 })
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);

    const a = first.body as PatientSearchResponse;
    const b = second.body as PatientSearchResponse;
    const c = third.body as PatientSearchResponse;
    expect(a.patients).toHaveLength(5);
    expect(b.patients).toHaveLength(5);
    expect(c.patients).toHaveLength(2); // 12 = 5 + 5 + 2
    expect(a.total).toBe(NAJILA_COUNT);
    expect(b.page).toBe(2);

    // No row appears on two pages — the ordering is stable enough to page on.
    const ids = [...a.patients, ...b.patients, ...c.patients].map((p) => p.id);
    expect(new Set(ids).size).toBe(NAJILA_COUNT);
  });

  it('rejects a page below one (400)', () =>
    request(server)
      .get('/patients')
      .query({ page: 0 })
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(400));

  it('lets a doctor search — finding a patient is not registering one', () =>
    search('Najila', doctorToken).expect(200));

  it('denies management, who holds no patient.search', () =>
    search('Najila', managementToken).expect(403));

  it('rejects an unauthenticated search (401)', () =>
    request(server).get('/patients').query({ q: 'Najila' }).expect(401));
});
