import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  Diagnosis,
  DiagnosisListResponse,
  IcdSearchResponse,
  LoginResponse,
} from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 4.5 — the doctor's conclusion.
 *
 * The done-when is "doctor types depression, picks F32.1", which is two halves: the
 * existing ICD search (task 2.9) surfacing the code, and a Diagnosis row that carries it.
 * Free text is always allowed and the code is optional — a contract that required one
 * would turn the catalog's gaps into gaps in the medical record.
 *
 * Two invariants get their own tests because both are the kind that go wrong quietly:
 * exactly ONE primary per visit, and a code that is not in the catalog is a typo rather
 * than a 500 from a foreign key.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_dx_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Diagnosis (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let otherFacilityId: string;
  let doctorId: string;
  let opdId: string;

  const tokens: Record<string, string> = {};

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Dx ${suffix}`,
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
  async function stageVisit(
    options: { status?: 'in_progress' | 'completed'; facility?: string } = {},
  ): Promise<string> {
    counter += 1;
    const inFacility = options.facility ?? facilityId;
    const patient = await prisma.patient.create({
      data: {
        facilityId: inFacility,
        mrn: `${PREFIX}MRN${counter}`,
        firstName: `Latifa${counter}`,
        gender: 'female',
        estimatedAgeYears: 29,
        ageRecordedAt: new Date(),
      },
    });
    const visit = await prisma.visit.create({
      data: {
        facilityId: inFacility,
        patientId: patient.id,
        departmentId: opdId,
        visitNo: `${PREFIX}V${counter}`,
        type: 'opd_consult',
        status: options.status ?? 'in_progress',
        statusHistory: { create: { status: 'arrived', changedBy: doctorId } },
      },
    });
    return visit.id;
  }

  const listDx = (visitId: string, as = 'doctor') =>
    request(server)
      .get(`/visits/${visitId}/diagnoses`)
      .set('Authorization', `Bearer ${tokens[as]}`);

  const addDx = (visitId: string, body: unknown, as = 'doctor') =>
    request(server)
      .post(`/visits/${visitId}/diagnoses`)
      .set('Authorization', `Bearer ${tokens[as]}`)
      .send(body);

  const patchDx = (visitId: string, id: string, body: unknown, as = 'doctor') =>
    request(server)
      .patch(`/visits/${visitId}/diagnoses/${id}`)
      .set('Authorization', `Bearer ${tokens[as]}`)
      .send(body);

  const deleteDx = (visitId: string, id: string, as = 'doctor') =>
    request(server)
      .delete(`/visits/${visitId}/diagnoses/${id}`)
      .set('Authorization', `Bearer ${tokens[as]}`);

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.diagnosis.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visitStatusHistory.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visit.deleteMany({ where: facilityFilter });
    await prisma.patient.deleteMany({ where: facilityFilter });
    await prisma.practitioner.deleteMany({ where: { code: { startsWith: PREFIX } } });
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
      await prisma.facility.create({ data: { code: `${PREFIX}fac`, name: 'E2E Dx Facility' } })
    ).id;
    otherFacilityId = (
      await prisma.facility.create({ data: { code: `${PREFIX}other`, name: 'E2E Dx Other' } })
    ).id;

    doctorId = await seedActor('doctor', 'doctor');
    await seedActor('admin', 'admin');
    await seedActor('nurse', 'nurse');
    await seedActor('receptionist', 'receptionist');

    opdId = (
      await prisma.department.create({
        data: { facilityId, code: `${PREFIX}OPD`, name: 'E2E OPD', type: 'opd' },
      })
    ).id;
    await prisma.practitioner.create({
      data: {
        facilityId,
        code: `${PREFIX}DR1`,
        firstName: 'Hafizullah',
        lastName: 'Sherzai',
        userId: doctorId,
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  // --- The done-when ----------------------------------------------------------

  it('the done-when: types "depression", picks F32.1', async () => {
    // The half that already existed (task 2.9) — the doctor types and the codes surface.
    const search = await request(server)
      .get('/icd?q=depress')
      .set('Authorization', `Bearer ${tokens.doctor}`)
      .expect(200);
    const codes = (search.body as IcdSearchResponse).results.map((row) => row.code);
    expect(codes).toContain('F32.1');

    // The half this task adds.
    const visitId = await stageVisit();
    const created = await addDx(visitId, {
      text: 'Moderate depressive episode',
      icdCode: 'F32.1',
      certainty: 'confirmed',
      isPrimary: true,
    }).expect(201);

    const dx = created.body as Diagnosis;
    expect(dx.icdCode).toBe('F32.1');
    // Denormalised, so a list reads as "F32.1 — Moderate depressive episode" in one request.
    expect(dx.icdTitle).toBeTruthy();
    expect(dx.certainty).toBe('confirmed');
    expect(dx.isPrimary).toBe(true);
    expect(dx.practitionerName).toBe('Hafizullah Sherzai');
  });

  it('takes free text with no code at all — the catalog’s gaps are not the record’s', async () => {
    const visitId = await stageVisit();
    const created = await addDx(visitId, { text: 'Query grief reaction, not yet codable' }).expect(
      201,
    );
    const dx = created.body as Diagnosis;
    expect(dx.icdCode).toBeNull();
    expect(dx.icdTitle).toBeNull();
    // Unqualified means provisional. Defaulting to confirmed would put a certainty on the
    // record that nobody claimed.
    expect(dx.certainty).toBe('provisional');
    expect(dx.isPrimary).toBe(false);
  });

  it('refuses a code that is not in the catalog, as a 400 and not a 500', async () => {
    const visitId = await stageVisit();
    const res = await addDx(visitId, { text: 'Something', icdCode: 'Z99.9Z' }).expect(400);
    expect((res.body as { code?: string }).code).toBe('unknown_icd');
  });

  it('refuses a diagnosis with no text', async () => {
    const visitId = await stageVisit();
    await addDx(visitId, { text: '' }).expect(400);
    await addDx(visitId, { icdCode: 'F32.1' }).expect(400);
  });

  it('refuses a certainty that is not one of the four', async () => {
    const visitId = await stageVisit();
    await addDx(visitId, { text: 'Anxiety', certainty: 'probably' }).expect(400);
  });

  // --- One primary ---------------------------------------------------------------

  it('keeps exactly ONE primary — naming a second moves the flag rather than duplicating it', async () => {
    const visitId = await stageVisit();
    const first = await addDx(visitId, { text: 'Depression', isPrimary: true }).expect(201);
    await addDx(visitId, { text: 'Hypertension', isPrimary: true }).expect(201);

    const listed = await listDx(visitId).expect(200);
    const { diagnoses } = listed.body as DiagnosisListResponse;
    expect(diagnoses.filter((row) => row.isPrimary)).toHaveLength(1);
    expect(diagnoses.find((row) => row.isPrimary)?.text).toBe('Hypertension');
    expect(diagnoses.find((row) => row.id === (first.body as Diagnosis).id)?.isPrimary).toBe(false);
  });

  it('audits the flag being taken off the other one — no silent change', async () => {
    const visitId = await stageVisit();
    const first = await addDx(visitId, { text: 'Insomnia', isPrimary: true }).expect(201);
    await addDx(visitId, { text: 'Anaemia', isPrimary: true }).expect(201);

    // Single update() rather than updateMany(), because the audit extension deliberately
    // does not cover batch operations.
    const rows = await prisma.auditLog.findMany({
      where: {
        entity: 'Diagnosis',
        entityId: (first.body as Diagnosis).id,
        action: AuditAction.update,
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(doctorId);
  });

  it('lists primary first, then oldest first', async () => {
    const visitId = await stageVisit();
    await addDx(visitId, { text: 'First written' }).expect(201);
    await addDx(visitId, { text: 'Second written' }).expect(201);
    await addDx(visitId, { text: 'The main one', isPrimary: true }).expect(201);

    const listed = await listDx(visitId).expect(200);
    const texts = (listed.body as DiagnosisListResponse).diagnoses.map((row) => row.text);
    expect(texts).toEqual(['The main one', 'First written', 'Second written']);
  });

  // --- Editing and removing --------------------------------------------------------

  it('moves a diagnosis from provisional to confirmed without losing its place', async () => {
    const visitId = await stageVisit();
    const created = await addDx(visitId, { text: 'Bipolar affective disorder' }).expect(201);
    const id = (created.body as Diagnosis).id;

    const updated = await patchDx(visitId, id, {
      text: 'Bipolar affective disorder',
      certainty: 'confirmed',
      isPrimary: true,
    }).expect(200);

    expect((updated.body as Diagnosis).id).toBe(id);
    expect((updated.body as Diagnosis).certainty).toBe('confirmed');
    expect((updated.body as Diagnosis).createdAt).toBe((created.body as Diagnosis).createdAt);
  });

  it('keeps a RULED OUT diagnosis on the record — that is what refuted is for', async () => {
    const visitId = await stageVisit();
    const created = await addDx(visitId, {
      text: 'Hypothyroidism',
      certainty: 'differential',
    }).expect(201);
    await patchDx(visitId, (created.body as Diagnosis).id, {
      text: 'Hypothyroidism',
      certainty: 'refuted',
      notes: 'TSH normal',
    }).expect(200);

    const listed = await listDx(visitId).expect(200);
    const dx = (listed.body as DiagnosisListResponse).diagnoses[0];
    expect(dx.certainty).toBe('refuted');
    expect(dx.notes).toBe('TSH normal');
  });

  it('removes a mis-click while the visit is still being written', async () => {
    const visitId = await stageVisit();
    const created = await addDx(visitId, { text: 'Wrong code entirely' }).expect(201);
    await deleteDx(visitId, (created.body as Diagnosis).id).expect(200);

    const listed = await listDx(visitId).expect(200);
    expect((listed.body as DiagnosisListResponse).diagnoses).toHaveLength(0);
  });

  it('keeps the removed row in the audit trail', async () => {
    const visitId = await stageVisit();
    const created = await addDx(visitId, { text: 'Struck out later' }).expect(201);
    const id = (created.body as Diagnosis).id;
    await deleteDx(visitId, id).expect(200);

    const rows = await prisma.auditLog.findMany({
      where: { entity: 'Diagnosis', entityId: id, action: AuditAction.delete },
    });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0].before)).toContain('Struck out later');
  });

  it("refuses an id from another visit's chart", async () => {
    const mine = await stageVisit();
    const theirs = await stageVisit();
    const created = await addDx(theirs, { text: 'Theirs' }).expect(201);

    await patchDx(mine, (created.body as Diagnosis).id, { text: 'Mine now' }).expect(404);
    await deleteDx(mine, (created.body as Diagnosis).id).expect(404);
  });

  // --- Once the visit is closed ------------------------------------------------------

  it('refuses every write once the visit is closed — that is the record now', async () => {
    const open = await stageVisit();
    const created = await addDx(open, { text: 'Written while open' }).expect(201);
    const id = (created.body as Diagnosis).id;

    await prisma.visit.update({ where: { id: open }, data: { status: 'completed' } });

    const add = await addDx(open, { text: 'Too late' }).expect(400);
    expect((add.body as { code?: string }).code).toBe('visit_closed');
    await patchDx(open, id, { text: 'Changed after the fact' }).expect(400);
    await deleteDx(open, id).expect(400);

    // But it still READS. Reviewing what happened is not writing to it.
    await listDx(open).expect(200);
  });

  // --- Who ------------------------------------------------------------------------

  it('the admin may READ but never RECORD — R2', async () => {
    const visitId = await stageVisit();
    await addDx(visitId, { text: 'Depression' }).expect(201);

    await listDx(visitId, 'admin').expect(200);
    await addDx(visitId, { text: 'Admin wrote this' }, 'admin').expect(403);
  });

  it('the nurse holds vitals, not conclusions', async () => {
    const visitId = await stageVisit();
    await listDx(visitId, 'nurse').expect(403);
    await addDx(visitId, { text: 'Nurse wrote this' }, 'nurse').expect(403);
  });

  it('the receptionist sees nothing clinical', async () => {
    const visitId = await stageVisit();
    await listDx(visitId, 'receptionist').expect(403);
  });

  it('rejects anonymous requests', async () => {
    const visitId = await stageVisit();
    await request(server).get(`/visits/${visitId}/diagnoses`).expect(401);
  });

  // --- Audit and boundaries -----------------------------------------------------------

  it('audits the read against the visit', async () => {
    const visitId = await stageVisit();
    await listDx(visitId).expect(200);

    const rows = await prisma.auditLog.findMany({
      where: { action: AuditAction.read, entity: 'Diagnosis', entityId: visitId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(doctorId);
  });

  it("404s on another facility's visit", async () => {
    const visitId = await stageVisit({ facility: otherFacilityId });
    await listDx(visitId).expect(404);
    await addDx(visitId, { text: 'Depression' }).expect(404);
  });

  it('404s on a visit that does not exist, 400s on an id that is not a uuid', async () => {
    await listDx(randomUUID()).expect(404);
    await listDx('not-a-uuid').expect(400);
  });
});
