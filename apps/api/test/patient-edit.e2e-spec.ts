import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse, PatientDetail, PatientSummary } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 3.4 — patient edit + PatientIdentifier. Needs a seeded database (roles).
 *
 * The done-when: an old Medi-Pro number is preserved on the patient, which is what makes
 * the Phase 7 migration possible — an existing patient stays findable by the number the
 * staff already know rather than being re-registered as a stranger.
 *
 * The edit half guards the things that are silently destructive: a cleared field really
 * clears, a re-stated estimate is RE-anchored (or the age it implies is wrong from the
 * moment it is saved), a real date of birth drops the anchor, and the duplicate guard
 * cannot be side-stepped by registering clean and editing into a collision afterwards.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_pedit_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Patient edit and identifiers (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let adminId: string;
  let adminToken: string;
  let doctorToken: string;
  let patientId: string;
  let otherPatientId: string;

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Edit ${suffix}`,
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

  /** A full valid body — update replaces wholesale, so every send is a complete record. */
  function body(overrides: Record<string, unknown> = {}) {
    return {
      firstName: 'Najila',
      lastName: 'Ahmadi',
      gender: 'female',
      phone: '0700888001',
      estimatedAgeYears: 30,
      ...overrides,
    };
  }

  function patch(id: string, payload: unknown, token = adminToken) {
    return request(server)
      .patch(`/patients/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
  }

  async function cleanup(): Promise<void> {
    await prisma.auditLog.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.patientIdentifier.deleteMany({
      where: { patient: { facility: { code: { startsWith: PREFIX } } } },
    });
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
      data: { code: `${PREFIX}fac`, name: 'E2E Edit Facility' },
    });
    facilityId = facility.id;

    adminId = await seedActor('admin', 'admin');
    await seedActor('receptionist', 'receptionist');
    await seedActor('doctor', 'doctor');
    adminToken = await login(`${PREFIX}admin`);
    const receptionistToken = await login(`${PREFIX}receptionist`);
    doctorToken = await login(`${PREFIX}doctor`);

    const created = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send(body({ address: 'Kabul', occupation: 'Teacher' }))
      .expect(201);
    patientId = (created.body as PatientSummary).id;

    const other = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send(body({ firstName: 'Zahra', phone: '0700888002' }))
      .expect(201);
    otherPatientId = (other.body as PatientSummary).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  // --- Identifiers: the migration hook ---------------------------------------

  it('the done-when: an old Medi-Pro number is preserved on the patient', async () => {
    const res = await request(server)
      .post(`/patients/${patientId}/identifiers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ system: 'medipro_legacy', value: 'MP-4471' })
      .expect(201);

    const detail = res.body as PatientDetail;
    const legacy = detail.identifiers.find((i) => i.system === 'medipro_legacy');
    expect(legacy?.value).toBe('MP-4471');

    // And it survives a re-read — the number is on the record, not just the response.
    const read = await request(server)
      .get(`/patients/${patientId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((read.body as PatientDetail).identifiers).toHaveLength(1);
  });

  it('holds several numbers for one human', async () => {
    const res = await request(server)
      .post(`/patients/${patientId}/identifiers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ system: 'tazkira', value: '1401-2233-4455' })
      .expect(201);
    expect((res.body as PatientDetail).identifiers).toHaveLength(2);
  });

  it('refuses to point one legacy number at two patients (409)', () =>
    request(server)
      .post(`/patients/${otherPatientId}/identifiers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ system: 'medipro_legacy', value: 'MP-4471' })
      .expect(409));

  it('rejects an unknown identifier system (400)', () =>
    request(server)
      .post(`/patients/${patientId}/identifiers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ system: 'made_up', value: 'X1' })
      .expect(400));

  it('removes an identifier and returns the shortened list', async () => {
    const added = await request(server)
      .post(`/patients/${patientId}/identifiers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ system: 'insurance', value: 'INS-9' })
      .expect(201);
    const detail = added.body as PatientDetail;
    const target = detail.identifiers.find((i) => i.system === 'insurance')!;

    const res = await request(server)
      .delete(`/patients/${patientId}/identifiers/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const after = res.body as PatientDetail;
    expect(after.identifiers.find((i) => i.id === target.id)).toBeUndefined();
  });

  // --- Edit -------------------------------------------------------------------

  it('edits demographics', async () => {
    const res = await patch(patientId, body({ firstName: 'Najiba', address: 'Herat' })).expect(200);
    const detail = res.body as PatientDetail;
    expect(detail.firstName).toBe('Najiba');
    expect(detail.address).toBe('Herat');
  });

  it('a field left out is CLEARED, not quietly kept', async () => {
    // `occupation` was set at registration and is absent from this body.
    const res = await patch(patientId, body({ firstName: 'Najiba' })).expect(200);
    expect((res.body as PatientDetail).occupation).toBeNull();
  });

  it('re-anchors a restated estimate, so the age it implies is true today', async () => {
    // Backdate the anchor to prove the update moves it forward rather than leaving it.
    await prisma.patient.update({
      where: { id: patientId },
      data: { ageRecordedAt: new Date('2020-01-01T00:00:00Z') },
    });

    await patch(patientId, body({ firstName: 'Najiba', estimatedAgeYears: 31 })).expect(200);
    const row = await prisma.patient.findUniqueOrThrow({ where: { id: patientId } });
    expect(row.estimatedAgeYears).toBe(31);
    expect(row.ageRecordedAt!.getFullYear()).toBeGreaterThan(2020);
  });

  it('drops the anchor when a real date of birth replaces an estimate', async () => {
    await patch(
      patientId,
      body({ firstName: 'Najiba', estimatedAgeYears: null, dateOfBirth: '1994-03-02' }),
    ).expect(200);
    const row = await prisma.patient.findUniqueOrThrow({ where: { id: patientId } });
    expect(row.ageRecordedAt).toBeNull();
    expect(row.estimatedAgeYears).toBeNull();
  });

  it('cannot be edited into a duplicate of another patient (409)', () =>
    // Zahra's number. Registering clean and editing into a collision must not be a way
    // around the task 3.3 guard.
    patch(patientId, body({ firstName: 'Najiba', phone: '0700888002' })).expect(409));

  it('allows the collision once acknowledged', () =>
    patch(
      patientId,
      body({ firstName: 'Najiba', phone: '0700888002', acknowledgeDuplicate: true }),
    ).expect(200));

  it('rejects an edit that leaves no age and no date of birth (400)', () =>
    patch(patientId, body({ firstName: 'Najiba', estimatedAgeYears: null })).expect(400));

  it('rejects a bad body — empty first name (400)', () =>
    patch(patientId, body({ firstName: '' })).expect(400));

  // --- Access -----------------------------------------------------------------

  it('lets a doctor read a patient but not edit one (403)', async () => {
    await request(server)
      .get(`/patients/${patientId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);
    await patch(patientId, body({ firstName: 'Nope' }), doctorToken).expect(403);
  });

  it('treats a patient in another facility as non-existent (404)', async () => {
    const other = await prisma.facility.create({
      data: { code: `${PREFIX}other`, name: 'E2E Edit Other' },
    });
    const foreign = await prisma.patient.create({
      data: {
        facilityId: other.id,
        mrn: `${PREFIX}FOREIGN`,
        firstName: 'Foreign',
        gender: 'female',
        phone: '0700888999',
        estimatedAgeYears: 30,
        ageRecordedAt: new Date(),
      },
    });

    await request(server)
      .get(`/patients/${foreign.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await patch(foreign.id, body({ firstName: 'Hijack' })).expect(404);
  });

  it('rejects a non-uuid id (400)', () =>
    request(server)
      .get('/patients/not-a-uuid')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400));

  it('rejects an unauthenticated edit (401)', () =>
    request(server).patch(`/patients/${patientId}`).send(body()).expect(401));

  it('audits the edit, attributable to the admin', async () => {
    await patch(patientId, body({ firstName: 'Audited', acknowledgeDuplicate: true })).expect(200);
    const rows = await prisma.auditLog.findMany({
      where: { entity: 'Patient', entityId: patientId, action: AuditAction.update },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[rows.length - 1].userId).toBe(adminId);
  });
});
