import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { ConsultContext, LoginResponse, VisitSummary } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 4.1 — the consult screen's context. "Doctor opens a patient from the queue."
 *
 * Two things are being proved. The first is the done-when: one request returns who the
 * patient is, which occasion this is, and how long they have been waiting, so the header
 * of the consulting-room screen is right before anything else renders.
 *
 * The second is who may ask. `patient.read_clinical` is the confidentiality core, and
 * three of its five grants are conditional. R2 (admin) and R7 (nurse) are satisfied by a
 * read of a header. R6 and R8 are not: R6 is written as "drugs and allergies — nothing
 * else", and R8 scopes the lab tech to the order in front of them, while this screen is
 * the patient's wider record. Those two are refused, and the refusal is tested, because a
 * conditional grant nobody narrows is an unconditional one wearing a rule code.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_consult_';
const PASSWORD = 'e2e-test-password-not-a-secret';

/**
 * The R1 read row is written FIRE-AND-FORGET by the audit interceptor, because R1 says a
 * clinical read is never blocked — including by its own logging. So a test that asserts it
 * has to wait for it rather than assume it has landed, or it passes alone and fails under
 * load, which is the worst kind of test.
 */
async function eventually<T>(read: () => Promise<T[]>, tries = 40): Promise<T[]> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const rows = await read();
    if (rows.length > 0) return rows;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return read();
}

describe('Consult context (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let otherFacilityId: string;
  let doctorId: string;

  const tokens: Record<string, string> = {};

  let opdId: string;
  let drOpdId: string;

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Consult ${suffix}`,
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
  /**
   * A patient and a visit, written straight to the database rather than through the desk.
   * This spec is about reading a chart, and staging the row directly is what lets a test
   * put an arrival forty minutes in the past — which no endpoint will do for it.
   */
  async function stageVisit(
    options: {
      arrivedMinutesAgo?: number;
      calledMinutesAgo?: number;
      status?: 'arrived' | 'in_progress' | 'completed';
      ageRecordedYearsAgo?: number;
      estimatedAgeYears?: number;
      facility?: string;
    } = {},
  ): Promise<{ visitId: string; patientId: string }> {
    counter += 1;
    const arrivedAt = new Date(Date.now() - (options.arrivedMinutesAgo ?? 0) * 60_000);
    const inFacility = options.facility ?? facilityId;

    const patient = await prisma.patient.create({
      data: {
        facilityId: inFacility,
        mrn: `${PREFIX}MRN${counter}`,
        firstName: `Zarghuna${counter}`,
        lastName: 'Karimi',
        gender: 'female',
        phone: `07009${String(counter).padStart(5, '0')}`,
        estimatedAgeYears: options.estimatedAgeYears ?? 34,
        // Five days past the anniversary, deliberately: the age helper floors, so a
        // stage set to exactly N years is one float rounding away from asserting N-1.
        ageRecordedAt: new Date(
          Date.now() -
            (options.ageRecordedYearsAgo ?? 0) * 365.2425 * 24 * 60 * 60 * 1000 -
            (options.ageRecordedYearsAgo ? 5 * 24 * 60 * 60 * 1000 : 0),
        ),
      },
    });

    const visit = await prisma.visit.create({
      data: {
        facilityId: inFacility,
        patientId: patient.id,
        departmentId: opdId,
        practitionerId: drOpdId,
        visitNo: `${PREFIX}V${counter}`,
        type: 'opd_consult',
        status: options.status ?? 'arrived',
        chiefComplaint: 'low mood, poor sleep for three weeks',
        startedAt: arrivedAt,
        statusHistory: {
          create: [
            { status: 'arrived', changedAt: arrivedAt, changedBy: doctorId },
            ...(options.calledMinutesAgo != null
              ? [
                  {
                    status: 'in_progress' as const,
                    changedAt: new Date(Date.now() - options.calledMinutesAgo * 60_000),
                    changedBy: doctorId,
                  },
                ]
              : []),
          ],
        },
      },
    });

    return { visitId: visit.id, patientId: patient.id };
  }

  const open = (id: string, as = 'doctor') =>
    request(server).get(`/visits/${id}/consult`).set('Authorization', `Bearer ${tokens[as]}`);

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.visitStatusHistory.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visit.deleteMany({ where: facilityFilter });
    await prisma.patient.deleteMany({ where: facilityFilter });
    await prisma.practitionerDepartment.deleteMany({
      where: { department: { code: { startsWith: PREFIX } } },
    });
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
      await prisma.facility.create({
        data: { code: `${PREFIX}fac`, name: 'E2E Consult Facility' },
      })
    ).id;
    otherFacilityId = (
      await prisma.facility.create({ data: { code: `${PREFIX}other`, name: 'E2E Consult Other' } })
    ).id;

    doctorId = await seedActor('doctor', 'doctor');
    await seedActor('admin', 'admin');
    await seedActor('nurse', 'nurse');
    await seedActor('pharmacist', 'pharmacist');
    await seedActor('labtech', 'lab_tech');
    await seedActor('receptionist', 'receptionist');
    await seedActor('management', 'management');

    opdId = (
      await prisma.department.create({
        data: { facilityId, code: `${PREFIX}OPD`, name: 'E2E OPD', type: 'opd' },
      })
    ).id;
    drOpdId = (
      await prisma.practitioner.create({
        data: {
          facilityId,
          code: `${PREFIX}DR1`,
          firstName: 'Hafizullah',
          lastName: 'Sherzai',
          departments: { create: { departmentId: opdId } },
        },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  // --- The done-when ---------------------------------------------------------

  it('the done-when: a doctor opens a patient from the queue', async () => {
    const { visitId, patientId } = await stageVisit({ arrivedMinutesAgo: 12 });

    const res = await open(visitId).expect(200);
    const body = res.body as ConsultContext;

    // Who is in front of the doctor.
    expect(body.patient.id).toBe(patientId);
    expect(body.patient.name).toContain('Zarghuna');
    expect(body.patient.mrn).toContain('MRN');
    expect(body.patient.gender).toBe('female');
    expect(body.patient.ageYears).toBe(34);
    expect(body.patient.phone).toBeTruthy();

    // Which occasion this is.
    expect(body.visit.id).toBe(visitId);
    expect(body.visit.status).toBe('arrived');
    expect(body.visit.departmentName).toBe('E2E OPD');
    expect(body.visit.practitionerName).toBe('Hafizullah Sherzai');
    expect(body.visit.chiefComplaint).toBe('low mood, poor sleep for three weeks');

    // And how long they have been sitting outside.
    expect(body.waitedMinutes).toBe(12);
  });

  it('carries nothing clinical EXCEPT allergies — everything else has its own permission', async () => {
    const { visitId } = await stageVisit();

    const res = await open(visitId).expect(200);
    const body = res.body as Record<string, unknown>;

    // Allergies joined at task 4.6, and the exception is argued in the contract: every
    // role that can reach this endpoint already holds `allergy.read` UNCONDITIONALLY, so
    // it leaks nothing, and fetching them separately would leave a named patient on screen
    // with no warning banner for a beat.
    expect(Object.keys(body).sort()).toEqual(['allergies', 'patient', 'visit', 'waitedMinutes']);
    // The rest stay out. A context endpoint that quietly returned all of these would hand
    // a nurse the psych note that `clinical_note.read` denies even to the admin.
    for (const leaked of ['vitals', 'diagnoses', 'prescriptions', 'notes']) {
      expect(body[leaked]).toBeUndefined();
    }
  });

  // --- The wait --------------------------------------------------------------

  it('the wait keeps climbing while the patient is still outside', async () => {
    const { visitId } = await stageVisit({ arrivedMinutesAgo: 47 });
    const res = await open(visitId).expect(200);
    expect((res.body as ConsultContext).waitedMinutes).toBe(47);
  });

  it('and stops the moment they are called in — it is a settled fact after that', async () => {
    // Arrived 50 minutes ago, called in 20 minutes ago: they waited 30, and that stays 30
    // however long the consultation runs.
    const { visitId } = await stageVisit({
      arrivedMinutesAgo: 50,
      calledMinutesAgo: 20,
      status: 'in_progress',
    });
    const res = await open(visitId).expect(200);
    expect((res.body as ConsultContext).waitedMinutes).toBe(30);
  });

  it('ages an estimate forward — a patient registered at thirty is not thirty three years later', async () => {
    const { visitId } = await stageVisit({ estimatedAgeYears: 30, ageRecordedYearsAgo: 3 });
    const res = await open(visitId).expect(200);
    expect((res.body as ConsultContext).patient.ageYears).toBe(33);
  });

  it('opens a completed visit too — reviewing what happened is not writing to it', async () => {
    const { visitId } = await stageVisit({ status: 'completed', arrivedMinutesAgo: 90 });
    const res = await open(visitId).expect(200);
    expect((res.body as ConsultContext).visit.status).toBe('completed');
  });

  // --- Rule R1 ---------------------------------------------------------------

  it('leaves an audited read row against the Visit, naming the doctor who opened it', async () => {
    const { visitId } = await stageVisit();
    await open(visitId).expect(200);

    const rows = await eventually(() =>
      prisma.auditLog.findMany({
        where: { action: AuditAction.read, entity: 'Visit', entityId: visitId },
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(doctorId);
    // A read changed nothing.
    expect(rows[0].before).toBeNull();
    expect(rows[0].after).toBeNull();
  });

  it('audits a refused read as nothing at all — the handler never returned a record', async () => {
    const { visitId } = await stageVisit();
    await open(visitId, 'pharmacist').expect(403);

    const rows = await prisma.auditLog.count({
      where: { action: AuditAction.read, entity: 'Visit', entityId: visitId },
    });
    expect(rows).toBe(0);
  });

  // --- Who may open a chart ---------------------------------------------------

  it('admin may read it — R2 is read, never write', async () => {
    const { visitId } = await stageVisit();
    await open(visitId, 'admin').expect(200);
  });

  it('nurse may read it — R7 covers a header', async () => {
    const { visitId } = await stageVisit();
    await open(visitId, 'nurse').expect(200);
  });

  it('pharmacist is refused — R6 is drugs and allergies, nothing else', async () => {
    const { visitId } = await stageVisit();
    const res = await open(visitId, 'pharmacist').expect(403);
    expect((res.body as { code?: string }).code).toBe('clinical_read_scoped');
  });

  it('lab tech is refused — R8 scopes them to their own order, not the wider record', async () => {
    const { visitId } = await stageVisit();
    const res = await open(visitId, 'labtech').expect(403);
    expect((res.body as { code?: string }).code).toBe('clinical_read_scoped');
  });

  it('receptionist is refused — she holds no clinical read at all', async () => {
    const { visitId } = await stageVisit();
    await open(visitId, 'receptionist').expect(403);
  });

  it('management is refused — reports, never a named chart', async () => {
    const { visitId } = await stageVisit();
    await open(visitId, 'management').expect(403);
  });

  it('rejects an anonymous request', async () => {
    const { visitId } = await stageVisit();
    await request(server).get(`/visits/${visitId}/consult`).expect(401);
  });

  // --- Boundaries -------------------------------------------------------------

  it("404s on another facility's visit — not 403, which would confirm it exists", async () => {
    const { visitId } = await stageVisit({ facility: otherFacilityId });
    await open(visitId).expect(404);
  });

  it('404s on a visit that does not exist', async () => {
    await open(randomUUID()).expect(404);
  });

  it('400s on an id that is not a uuid', async () => {
    await open('not-a-uuid').expect(400);
  });

  it('describes the same visit in the same words as the queue', async () => {
    // The consult screen is opened FROM a queue row, so the two must agree — a header
    // that renamed the doctor between one screen and the next is a header nobody trusts.
    const { visitId } = await stageVisit({ arrivedMinutesAgo: 5 });

    const [consult, summary] = await Promise.all([
      open(visitId).expect(200),
      request(server)
        .get(`/visits/${visitId}`)
        .set('Authorization', `Bearer ${tokens.doctor}`)
        .expect(200),
    ]);

    expect((consult.body as ConsultContext).visit).toEqual(summary.body as VisitSummary);
  });
});
