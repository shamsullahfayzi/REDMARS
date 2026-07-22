import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { Allergy, AllergyListResponse, ConsultContext, LoginResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 4.6 — the safety table, and the banner it feeds.
 *
 * "Penicillin allergy is impossible to miss." Three things make that true and each is
 * tested here rather than left to the screen:
 *
 *  - The allergy hangs off the PATIENT, so it survives into the next visit and the one
 *    after. Filed against an encounter, March's reaction would be invisible in September.
 *  - It travels IN the consult context, so the banner paints with the header rather than
 *    one round trip later.
 *  - It is never deleted. Retracting sets isActive false, which keeps "penicillin was on
 *    this chart and someone took it off" answerable — a delete would leave a record
 *    indistinguishable from a patient nobody ever asked.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_allergy_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Allergy (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let otherFacilityId: string;
  let doctorId: string;
  let opdId: string;
  let penicillinId: string;

  const tokens: Record<string, string> = {};

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Allergy ${suffix}`,
        passwordHash: await hash(PASSWORD),
      },
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const res = await request(server)
      .post('/auth/login')
      .send({ username: `${PREFIX}${suffix}`, password: PASSWORD })
      .expect(200);
    tokens[suffix] = (res.body as LoginResponse).accessToken;
    return user.id;
  }

  let counter = 0;
  async function stagePatient(facility = facilityId): Promise<string> {
    counter += 1;
    const patient = await prisma.patient.create({
      data: {
        facilityId: facility,
        mrn: `${PREFIX}MRN${counter}`,
        firstName: `Gulalai${counter}`,
        gender: 'female',
        estimatedAgeYears: 33,
        ageRecordedAt: new Date(),
      },
    });
    return patient.id;
  }

  async function stageVisit(patientId: string): Promise<string> {
    counter += 1;
    const visit = await prisma.visit.create({
      data: {
        facilityId,
        patientId,
        departmentId: opdId,
        visitNo: `${PREFIX}V${counter}`,
        type: 'opd_consult',
        status: 'in_progress',
        statusHistory: { create: { status: 'arrived', changedBy: doctorId } },
      },
    });
    return visit.id;
  }

  const listAllergies = (patientId: string, as = 'doctor') =>
    request(server)
      .get(`/patients/${patientId}/allergies`)
      .set('Authorization', `Bearer ${tokens[as]}`);

  const addAllergy = (patientId: string, body: unknown, as = 'doctor') =>
    request(server)
      .post(`/patients/${patientId}/allergies`)
      .set('Authorization', `Bearer ${tokens[as]}`)
      .send(body);

  const patchAllergy = (patientId: string, id: string, body: unknown, as = 'doctor') =>
    request(server)
      .patch(`/patients/${patientId}/allergies/${id}`)
      .set('Authorization', `Bearer ${tokens[as]}`)
      .send(body);

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.allergy.deleteMany({ where: { patient: facilityFilter } });
    await prisma.visitStatusHistory.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visit.deleteMany({ where: facilityFilter });
    await prisma.patient.deleteMany({ where: facilityFilter });
    await prisma.drug.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.department.deleteMany({ where: { code: { startsWith: PREFIX } } });
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

    facilityId = (
      await prisma.facility.create({ data: { code: `${PREFIX}fac`, name: 'E2E Allergy Facility' } })
    ).id;
    otherFacilityId = (
      await prisma.facility.create({ data: { code: `${PREFIX}other`, name: 'E2E Allergy Other' } })
    ).id;

    doctorId = await seedActor('doctor', 'doctor');
    await seedActor('nurse', 'nurse');
    await seedActor('pharmacist', 'pharmacist');
    await seedActor('admin', 'admin');
    await seedActor('receptionist', 'receptionist');
    await seedActor('labtech', 'lab_tech');

    opdId = (
      await prisma.department.create({
        data: { facilityId, code: `${PREFIX}OPD`, name: 'E2E OPD', type: 'opd' },
      })
    ).id;
    penicillinId = (
      await prisma.drug.create({
        data: {
          facilityId,
          code: `${PREFIX}PEN`,
          genericName: 'Benzylpenicillin',
          strength: '600mg',
          form: 'injection',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  // --- The done-when ------------------------------------------------------------

  it('the done-when: a penicillin allergy reaches the consult screen with the header', async () => {
    const patientId = await stagePatient();
    await addAllergy(patientId, {
      substance: 'Penicillin',
      drugId: penicillinId,
      reaction: 'Anaphylaxis',
      severity: 'severe',
    }).expect(201);

    const visitId = await stageVisit(patientId);
    const consult = await request(server)
      .get(`/visits/${visitId}/consult`)
      .set('Authorization', `Bearer ${tokens.doctor}`)
      .expect(200);

    // In the SAME request as the patient header — not one round trip later, which would
    // leave a named patient on screen with no warning for a beat.
    const { allergies } = consult.body as ConsultContext;
    expect(allergies).toHaveLength(1);
    expect(allergies[0].substance).toBe('Penicillin');
    expect(allergies[0].severity).toBe('severe');
    expect(allergies[0].reaction).toBe('Anaphylaxis');
    expect(allergies[0].drugName).toContain('Benzylpenicillin');
  });

  it('follows the patient into the NEXT visit — it is not filed against an encounter', async () => {
    const patientId = await stagePatient();
    await addAllergy(patientId, { substance: 'Sulfa', severity: 'moderate' }).expect(201);

    // Recorded during one visit, read during a different one months later.
    await stageVisit(patientId);
    const second = await stageVisit(patientId);

    const consult = await request(server)
      .get(`/visits/${second}/consult`)
      .set('Authorization', `Bearer ${tokens.doctor}`)
      .expect(200);
    expect((consult.body as ConsultContext).allergies[0].substance).toBe('Sulfa');
  });

  it('puts the worst one first — the banner is read top-down and in a hurry', async () => {
    const patientId = await stagePatient();
    await addAllergy(patientId, { substance: 'Dust', severity: 'mild' }).expect(201);
    await addAllergy(patientId, { substance: 'Peanuts', severity: 'severe' }).expect(201);
    await addAllergy(patientId, { substance: 'Aspirin', severity: 'moderate' }).expect(201);

    const listed = await listAllergies(patientId).expect(200);
    expect((listed.body as AllergyListResponse).allergies.map((row) => row.substance)).toEqual([
      'Peanuts',
      'Aspirin',
      'Dust',
    ]);
  });

  it('takes free text with no formulary drug — the formulary has no peanuts in it', async () => {
    const patientId = await stagePatient();
    const created = await addAllergy(patientId, {
      substance: 'Peanuts',
      reaction: 'Swelling',
      severity: 'severe',
    }).expect(201);

    expect((created.body as Allergy).drugId).toBeNull();
    expect((created.body as Allergy).drugName).toBeNull();
  });

  it('REFUSES an allergy with no severity — the dangerous default is the unstated one', async () => {
    const patientId = await stagePatient();
    // Every other enum in this phase defaults to its least alarming value. This one must
    // not: it would read as `mild` on the screen that decides whether to prescribe.
    await addAllergy(patientId, { substance: 'Codeine' }).expect(400);
    await addAllergy(patientId, { substance: 'Codeine', severity: 'unknown' }).expect(400);
  });

  it('refuses an allergy with no substance, and an unknown drug', async () => {
    const patientId = await stagePatient();
    await addAllergy(patientId, { substance: '', severity: 'mild' }).expect(400);
    const res = await addAllergy(patientId, {
      substance: 'Something',
      severity: 'mild',
      drugId: randomUUID(),
    }).expect(400);
    expect((res.body as { code?: string }).code).toBe('unknown_drug');
  });

  it('names who recorded it and when', async () => {
    const patientId = await stagePatient();
    await addAllergy(patientId, { substance: 'Iodine', severity: 'moderate' }).expect(201);

    const listed = await listAllergies(patientId).expect(200);
    const allergy = (listed.body as AllergyListResponse).allergies[0];
    expect(allergy.notedBy).toBe(doctorId);
    expect(allergy.notedByName).toBe('E2E Allergy doctor');
    expect(allergy.notedAt).toBeTruthy();
  });

  // --- Retracting ------------------------------------------------------------------

  it('retracts without deleting — the row stays and drops out of the banner', async () => {
    const patientId = await stagePatient();
    const created = await addAllergy(patientId, {
      substance: 'Penicillin',
      severity: 'severe',
    }).expect(201);
    const id = (created.body as Allergy).id;

    await patchAllergy(patientId, id, {
      substance: 'Penicillin',
      severity: 'severe',
      isActive: false,
    }).expect(200);

    // Still on the record, so "it was here and someone took it off" is answerable.
    const listed = await listAllergies(patientId).expect(200);
    const { allergies } = listed.body as AllergyListResponse;
    expect(allergies).toHaveLength(1);
    expect(allergies[0].isActive).toBe(false);

    // But out of the banner, because a banner is a warning and this is now history.
    const visitId = await stageVisit(patientId);
    const consult = await request(server)
      .get(`/visits/${visitId}/consult`)
      .set('Authorization', `Bearer ${tokens.doctor}`)
      .expect(200);
    expect((consult.body as ConsultContext).allergies).toHaveLength(0);
  });

  it('audits the retraction to the person who made it', async () => {
    const patientId = await stagePatient();
    const created = await addAllergy(patientId, { substance: 'Latex', severity: 'mild' }).expect(
      201,
    );
    const id = (created.body as Allergy).id;
    await patchAllergy(patientId, id, {
      substance: 'Latex',
      severity: 'mild',
      isActive: false,
    }).expect(200);

    const rows = await prisma.auditLog.findMany({
      where: { entity: 'Allergy', entityId: id, action: AuditAction.update },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(doctorId);
    expect(JSON.stringify(rows[0].before)).toContain('true');
  });

  it('offers no way to delete one', async () => {
    const patientId = await stagePatient();
    const created = await addAllergy(patientId, {
      substance: 'Shellfish',
      severity: 'severe',
    }).expect(201);
    await request(server)
      .delete(`/patients/${patientId}/allergies/${(created.body as Allergy).id}`)
      .set('Authorization', `Bearer ${tokens.doctor}`)
      .expect(404);
  });

  it("refuses an id from another patient's chart", async () => {
    const mine = await stagePatient();
    const theirs = await stagePatient();
    const created = await addAllergy(theirs, { substance: 'Morphine', severity: 'severe' }).expect(
      201,
    );
    await patchAllergy(mine, (created.body as Allergy).id, {
      substance: 'Morphine',
      severity: 'mild',
    }).expect(404);
  });

  it('corrects a mistyped substance in place', async () => {
    const patientId = await stagePatient();
    const created = await addAllergy(patientId, {
      substance: 'Penicilin',
      severity: 'severe',
    }).expect(201);
    const fixed = await patchAllergy(patientId, (created.body as Allergy).id, {
      substance: 'Penicillin',
      severity: 'severe',
      reaction: 'Rash',
    }).expect(200);
    expect((fixed.body as Allergy).substance).toBe('Penicillin');
    expect((fixed.body as Allergy).isActive).toBe(true);
  });

  // --- Who ---------------------------------------------------------------------------

  it('THE PHARMACIST READS IT — R6 exists for exactly this', async () => {
    const patientId = await stagePatient();
    await addAllergy(patientId, { substance: 'Penicillin', severity: 'severe' }).expect(201);

    // "The pharmacist MUST see this. Dispensing without allergies is unsafe." The widest
    // clinical grant in the matrix, on purpose.
    const listed = await listAllergies(patientId, 'pharmacist').expect(200);
    expect((listed.body as AllergyListResponse).allergies[0].substance).toBe('Penicillin');

    // Reading is not recording, though.
    await addAllergy(patientId, { substance: 'X', severity: 'mild' }, 'pharmacist').expect(403);
  });

  it('the nurse may record them — triage is where most allergies are captured', async () => {
    const patientId = await stagePatient();
    await addAllergy(patientId, { substance: 'Ibuprofen', severity: 'moderate' }, 'nurse').expect(
      201,
    );
  });

  it('the admin may read but never record — R2', async () => {
    const patientId = await stagePatient();
    await addAllergy(patientId, { substance: 'Aspirin', severity: 'mild' }).expect(201);
    await listAllergies(patientId, 'admin').expect(200);
    await addAllergy(patientId, { substance: 'X', severity: 'mild' }, 'admin').expect(403);
  });

  it('the lab tech and the receptionist see none of it', async () => {
    const patientId = await stagePatient();
    await listAllergies(patientId, 'labtech').expect(403);
    await listAllergies(patientId, 'receptionist').expect(403);
  });

  it('rejects anonymous requests', async () => {
    const patientId = await stagePatient();
    await request(server).get(`/patients/${patientId}/allergies`).expect(401);
  });

  // --- Audit and boundaries -------------------------------------------------------------

  it('audits the read against the patient — R1', async () => {
    const patientId = await stagePatient();
    await listAllergies(patientId).expect(200);

    const rows = await prisma.auditLog.findMany({
      where: { action: AuditAction.read, entity: 'Allergy', entityId: patientId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(doctorId);
  });

  it("404s on another facility's patient", async () => {
    const patientId = await stagePatient(otherFacilityId);
    await listAllergies(patientId).expect(404);
    await addAllergy(patientId, { substance: 'Penicillin', severity: 'severe' }).expect(404);
  });

  it('404s on a patient that does not exist, 400s on an id that is not a uuid', async () => {
    await listAllergies(randomUUID()).expect(404);
    await listAllergies('not-a-uuid').expect(400);
  });
});
