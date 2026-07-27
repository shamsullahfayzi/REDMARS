import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse, PatientHistoryResponse } from '@redmars/shared';
import { HISTORY_VISIT_LIMIT } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 4.14 — the last twelve months, at a glance.
 *
 * Three things get their own tests because all three are the kind that go wrong quietly:
 * the WINDOW (a month arithmetic bug shows fourteen months and nobody notices), what the
 * panel deliberately does NOT carry (clinical notes, which the admin holds this permission
 * but not `clinical_note.read` for), and the fact that nothing in the response has an id a
 * write endpoint would accept.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_hist_';
const PASSWORD = 'e2e-test-password-not-a-secret';

async function eventually<T>(read: () => Promise<T[]>, tries = 40): Promise<T[]> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const rows = await read();
    if (rows.length > 0) return rows;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return read();
}

/** Months back from now, which is how the window itself is computed. */
function monthsAgo(months: number): Date {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  // A day inside the boundary, so a test about "14 months ago" is not decided by whether
  // the assertion ran a millisecond before or after the server computed `from`.
  date.setDate(date.getDate() + 2);
  return date;
}

describe('Patient history (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let otherFacilityId: string;
  let doctorId: string;
  let practitionerId: string;
  let opdId: string;
  let sertralineId: string;
  let olanzapineId: string;
  let glucoseId: string;
  let cbcId: string;
  let altId: string;
  let malariaId: string;

  const tokens: Record<string, string> = {};

  jest.setTimeout(120_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Hist ${suffix}`,
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
  async function stagePatient(inFacility = facilityId): Promise<string> {
    counter += 1;
    const patient = await prisma.patient.create({
      data: {
        facilityId: inFacility,
        mrn: `${PREFIX}MRN${counter}`,
        firstName: `Nasrin${counter}`,
        gender: 'female',
        estimatedAgeYears: 41,
        ageRecordedAt: new Date(),
      },
    });
    return patient.id;
  }

  async function stageVisit(
    patientId: string,
    options: {
      startedAt?: Date;
      status?: 'in_progress' | 'completed' | 'cancelled' | 'entered_in_error';
      facility?: string;
    } = {},
  ): Promise<string> {
    counter += 1;
    const visit = await prisma.visit.create({
      data: {
        facilityId: options.facility ?? facilityId,
        patientId,
        departmentId: opdId,
        practitionerId,
        visitNo: `${PREFIX}V${counter}`,
        type: 'opd_consult',
        status: options.status ?? 'completed',
        startedAt: options.startedAt ?? new Date(),
        chiefComplaint: 'low mood, poor sleep',
      },
    });
    return visit.id;
  }

  /**
   * One order on the visit, one of each pipeline stage — the same fixture shape
   * `visit-lab-results.e2e-spec.ts` uses for the CURRENT-visit read-back, because history's
   * verified-only rule (task 6b.6) has to hold exactly as well for a visit that closed
   * months ago.
   */
  async function stageLabResults(visitId: string): Promise<void> {
    counter += 1;
    const order = await prisma.labOrder.create({
      data: { facilityId, visitId, orderNo: `${PREFIX}LAB${counter}` },
    });

    const gItem = await prisma.labOrderItem.create({
      data: {
        labOrderId: order.id,
        testId: glucoseId,
        testNameAtTime: 'Fasting Glucose',
        status: 'verified',
      },
    });
    await prisma.labResult.create({
      data: {
        labOrderItemId: gItem.id,
        valueNumeric: '90',
        unit: 'mg/dL',
        isAbnormal: false,
        enteredBy: doctorId,
        verifiedBy: doctorId,
        verifiedAt: new Date(),
      },
    });

    const cItem = await prisma.labOrderItem.create({
      data: {
        labOrderId: order.id,
        testId: cbcId,
        testNameAtTime: 'Complete Blood Count',
        status: 'resulted',
      },
    });
    await prisma.labResult.create({
      data: { labOrderItemId: cItem.id, valueNumeric: '5', isAbnormal: false, enteredBy: doctorId },
    });

    await prisma.labOrderItem.create({
      data: { labOrderId: order.id, testId: altId, testNameAtTime: 'ALT', status: 'ordered' },
    });

    await prisma.labOrderItem.create({
      data: {
        labOrderId: order.id,
        testId: malariaId,
        testNameAtTime: 'Malaria Film',
        status: 'cancelled',
      },
    });
  }

  const getHistory = (patientId: string, query = '', as = 'doctor') =>
    request(server)
      .get(`/patients/${patientId}/history${query}`)
      .set('Authorization', `Bearer ${tokens[as]}`);

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.prescriptionItem.deleteMany({
      where: { prescription: { visit: facilityFilter } },
    });
    await prisma.prescription.deleteMany({ where: { visit: facilityFilter } });
    await prisma.clinicalNote.deleteMany({ where: { visit: facilityFilter } });
    await prisma.diagnosis.deleteMany({ where: { visit: facilityFilter } });
    await prisma.labResult.deleteMany({
      where: { labOrderItem: { labOrder: { visit: facilityFilter } } },
    });
    await prisma.labOrderItem.deleteMany({ where: { labOrder: { visit: facilityFilter } } });
    await prisma.labOrder.deleteMany({ where: { visit: facilityFilter } });
    await prisma.referenceRange.deleteMany({ where: { test: { code: { startsWith: PREFIX } } } });
    await prisma.visitStatusHistory.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visit.deleteMany({ where: facilityFilter });
    await prisma.patient.deleteMany({ where: facilityFilter });
    await prisma.drug.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.labTest.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.practitioner.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.department.deleteMany({ where: { code: { startsWith: PREFIX } } });
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

    facilityId = (
      await prisma.facility.create({ data: { code: `${PREFIX}fac`, name: 'E2E Hist Facility' } })
    ).id;
    otherFacilityId = (
      await prisma.facility.create({ data: { code: `${PREFIX}other`, name: 'E2E Hist Other' } })
    ).id;

    doctorId = await seedActor('doctor', 'doctor');
    await seedActor('admin', 'admin');
    await seedActor('nurse', 'nurse');
    await seedActor('receptionist', 'receptionist');
    await seedActor('pharmacist', 'pharmacist');

    opdId = (
      await prisma.department.create({
        data: { facilityId, code: `${PREFIX}OPD`, name: 'E2E OPD', type: 'opd' },
      })
    ).id;
    practitionerId = (
      await prisma.practitioner.create({
        data: {
          facilityId,
          code: `${PREFIX}DR1`,
          firstName: 'Hafizullah',
          lastName: 'Sherzai',
          userId: doctorId,
        },
      })
    ).id;

    sertralineId = (
      await prisma.drug.create({
        data: {
          facilityId,
          code: `${PREFIX}SER`,
          genericName: 'Sertraline',
          strength: '50mg',
          form: 'tablet',
        },
      })
    ).id;
    olanzapineId = (
      await prisma.drug.create({
        data: {
          facilityId,
          code: `${PREFIX}OLZ`,
          genericName: 'Olanzapine',
          strength: '5mg',
          form: 'tablet',
        },
      })
    ).id;

    glucoseId = (
      await prisma.labTest.create({
        data: { facilityId, code: `${PREFIX}GLU`, name: 'Fasting Glucose', unit: 'mg/dL' },
      })
    ).id;
    await prisma.referenceRange.create({
      data: { testId: glucoseId, lowValue: '70', highValue: '110' },
    });
    cbcId = (
      await prisma.labTest.create({
        data: { facilityId, code: `${PREFIX}CBC`, name: 'Complete Blood Count' },
      })
    ).id;
    altId = (
      await prisma.labTest.create({ data: { facilityId, code: `${PREFIX}ALT`, name: 'ALT' } })
    ).id;
    malariaId = (
      await prisma.labTest.create({
        data: { facilityId, code: `${PREFIX}MP`, name: 'Malaria Film' },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  // --- The done-when ------------------------------------------------------------------

  it('the done-when: the last 12 months, newest first, with what was concluded and prescribed', async () => {
    const patientId = await stagePatient();

    const march = await stageVisit(patientId, { startedAt: monthsAgo(4) });
    await prisma.diagnosis.create({
      data: {
        visitId: march,
        practitionerId,
        text: 'Moderate depressive episode',
        icdCode: 'F32.1',
        certainty: 'confirmed',
        isPrimary: true,
      },
    });
    await prisma.prescription.create({
      data: {
        visitId: march,
        practitionerId,
        advice: 'Take with food.',
        items: {
          create: [
            {
              drugId: sertralineId,
              drugNameAtTime: 'Sertraline 50mg',
              dose: '1 tab',
              frequency: 'OD',
              duration: '1 month',
              route: 'oral',
              quantity: 30,
              sequence: 0,
            },
          ],
        },
      },
    });

    const july = await stageVisit(patientId, { startedAt: monthsAgo(1) });
    await prisma.diagnosis.create({
      data: { visitId: july, practitionerId, text: 'Insomnia', certainty: 'provisional' },
    });

    const res = await getHistory(patientId).expect(200);
    const history = res.body as PatientHistoryResponse;

    // Newest first — "what happened last time" before "what happened first".
    expect(history.visits.map((visit) => visit.id)).toEqual([july, march]);
    expect(history.months).toBe(12);
    expect(history.truncated).toBe(false);
    expect(history.olderVisits).toBe(0);

    const older = history.visits[1];
    expect(older.practitionerName).toBe('Hafizullah Sherzai');
    expect(older.departmentName).toBe('E2E OPD');
    expect(older.chiefComplaint).toBe('low mood, poor sleep');
    expect(older.diagnoses[0].text).toBe('Moderate depressive episode');
    // Denormalised, so a line reads as "F32.1 — Moderate depressive episode" in one request.
    expect(older.diagnoses[0].icdTitle).toBeTruthy();
    expect(older.prescription?.advice).toBe('Take with food.');
    expect(older.prescription?.items[0].drugNameAtTime).toBe('Sertraline 50mg');
    expect(older.prescription?.items[0].frequency).toBe('OD');
    expect(older.prescription?.items[0].quantity).toBe(30);

    // A visit where nothing was prescribed is normal, not an error.
    expect(history.visits[0].prescription).toBeNull();
  });

  it('shows the drug name AS PRESCRIBED, not as the formulary calls it today', async () => {
    const patientId = await stagePatient();
    const visitId = await stageVisit(patientId, { startedAt: monthsAgo(3) });
    await prisma.prescription.create({
      data: {
        visitId,
        practitionerId,
        items: {
          create: [
            {
              drugId: olanzapineId,
              drugNameAtTime: 'Olanzapine 5mg',
              frequency: 'ON',
              duration: '2 weeks',
              route: 'oral',
              sequence: 0,
            },
          ],
        },
      },
    });

    // The formulary is edited afterwards, as it will be.
    await prisma.drug.update({
      where: { id: olanzapineId },
      data: { genericName: 'Olanzapine ODT', strength: '10mg' },
    });

    const res = await getHistory(patientId).expect(200);
    const items = (res.body as PatientHistoryResponse).visits[0].prescription?.items ?? [];
    // Clinical records are historical documents. They are not rewritten by a lookup table.
    expect(items[0].drugNameAtTime).toBe('Olanzapine 5mg');
  });

  it('orders diagnoses primary first and prescription items as they were written', async () => {
    const patientId = await stagePatient();
    const visitId = await stageVisit(patientId);
    await prisma.diagnosis.create({
      data: { visitId, practitionerId, text: 'Hypertension', certainty: 'confirmed' },
    });
    await prisma.diagnosis.create({
      data: {
        visitId,
        practitionerId,
        text: 'Bipolar affective disorder',
        certainty: 'confirmed',
        isPrimary: true,
      },
    });
    await prisma.prescription.create({
      data: {
        visitId,
        practitionerId,
        items: {
          create: [
            {
              drugId: olanzapineId,
              drugNameAtTime: 'Second',
              frequency: 'ON',
              duration: '1 month',
              route: 'oral',
              sequence: 1,
            },
            {
              drugId: sertralineId,
              drugNameAtTime: 'First',
              frequency: 'OD',
              duration: '1 month',
              route: 'oral',
              sequence: 0,
            },
          ],
        },
      },
    });

    const visit = (await getHistory(patientId).expect(200)).body as PatientHistoryResponse;
    expect(visit.visits[0].diagnoses.map((dx) => dx.text)).toEqual([
      'Bipolar affective disorder',
      'Hypertension',
    ]);
    expect(visit.visits[0].prescription?.items.map((item) => item.drugNameAtTime)).toEqual([
      'First',
      'Second',
    ]);
  });

  // --- The window ---------------------------------------------------------------------

  it('holds the window to twelve months, and counts what sits before it', async () => {
    const patientId = await stagePatient();
    await stageVisit(patientId, { startedAt: monthsAgo(2) });
    await stageVisit(patientId, { startedAt: monthsAgo(14) });
    await stageVisit(patientId, { startedAt: monthsAgo(40) });

    const twelve = (await getHistory(patientId).expect(200)).body as PatientHistoryResponse;
    expect(twelve.visits).toHaveLength(1);
    // The one number the list cannot give: is this a new patient or one known for years.
    expect(twelve.olderVisits).toBe(2);

    const twoYears = (await getHistory(patientId, '?months=24').expect(200))
      .body as PatientHistoryResponse;
    expect(twoYears.visits).toHaveLength(2);
    expect(twoYears.olderVisits).toBe(1);
    expect(twoYears.months).toBe(24);
  });

  it('refuses a window outside one to sixty months', async () => {
    const patientId = await stagePatient();
    await getHistory(patientId, '?months=0').expect(400);
    await getHistory(patientId, '?months=999').expect(400);
    await getHistory(patientId, '?months=twelve').expect(400);
  });

  it('says when it stopped listing rather than quietly ending', async () => {
    const patientId = await stagePatient();
    const over = HISTORY_VISIT_LIMIT + 3;
    for (let index = 0; index < over; index += 1) {
      await stageVisit(patientId, { startedAt: monthsAgo(1) });
    }

    const history = (await getHistory(patientId).expect(200)).body as PatientHistoryResponse;
    expect(history.visits).toHaveLength(HISTORY_VISIT_LIMIT);
    expect(history.truncated).toBe(true);
  });

  // --- What is in, and what is out ----------------------------------------------------

  it('keeps a cancelled visit and drops a voided one', async () => {
    const patientId = await stagePatient();
    const attended = await stageVisit(patientId, { startedAt: monthsAgo(3) });
    const noShow = await stageVisit(patientId, { startedAt: monthsAgo(2), status: 'cancelled' });
    await stageVisit(patientId, { startedAt: monthsAgo(1), status: 'entered_in_error' });

    const history = (await getHistory(patientId).expect(200)).body as PatientHistoryResponse;
    // Dropping out of contact is a psychiatric finding, not noise. A voided visit is one
    // the record says never happened.
    expect(history.visits.map((visit) => visit.id)).toEqual([noShow, attended]);
  });

  it('CARRIES NO CLINICAL NOTE — the admin holds this permission and not that one', async () => {
    const patientId = await stagePatient();
    const visitId = await stageVisit(patientId, { startedAt: monthsAgo(2) });
    await prisma.clinicalNote.create({
      data: {
        visitId,
        practitionerId,
        noteType: 'mse',
        content: { mood: 'CONFIDENTIAL_MSE_MARKER' },
      },
    });

    // Both callers, because the leak would be through the payload rather than the guard.
    for (const actor of ['doctor', 'admin']) {
      const res = await getHistory(patientId, '', actor).expect(200);
      expect(JSON.stringify(res.body)).not.toContain('CONFIDENTIAL_MSE_MARKER');
    }
  });

  it('carries nothing a write endpoint would accept', async () => {
    const patientId = await stagePatient();
    const visitId = await stageVisit(patientId);
    await prisma.diagnosis.create({
      data: { visitId, practitionerId, text: 'Depression', certainty: 'provisional' },
    });
    await prisma.prescription.create({
      data: {
        visitId,
        practitionerId,
        items: {
          create: [
            {
              drugId: sertralineId,
              drugNameAtTime: 'Sertraline 50mg',
              frequency: 'OD',
              duration: '1 month',
              route: 'oral',
              sequence: 0,
            },
          ],
        },
      },
    });

    const visit = ((await getHistory(patientId).expect(200)).body as PatientHistoryResponse)
      .visits[0];
    // Read-only by SHAPE, not by discipline. A diagnosis with an id could be PATCHed on a
    // closed visit; a drug with a drugId is a way around task 4.11's allergy and
    // interaction blocks. Neither is selected.
    expect(visit.diagnoses[0]).not.toHaveProperty('id');
    expect(visit.prescription?.items[0]).not.toHaveProperty('drugId');
    expect(visit.prescription?.items[0]).not.toHaveProperty('id');
    // The visit's own id stays — a place to navigate to, and that screen re-checks
    // every permission itself.
    expect(visit.id).toBe(visitId);
  });

  // --- Lab results (task 6b.6) ---------------------------------------------------------

  it('the done-when: a verified result from months ago comes back with its value, flag and band', async () => {
    const patientId = await stagePatient();
    const visitId = await stageVisit(patientId, { startedAt: monthsAgo(3) });
    await stageLabResults(visitId);

    const visit = ((await getHistory(patientId).expect(200)).body as PatientHistoryResponse)
      .visits[0];
    const byName = Object.fromEntries(visit.labResults.map((r) => [r.testName, r]));

    const glucose = byName['Fasting Glucose'];
    expect(glucose.status).toBe('verified');
    expect(glucose.value).toBe('90');
    expect(glucose.isNumeric).toBe(true);
    expect(glucose.unit).toBe('mg/dL');
    expect(glucose.flag).toBeNull(); // 90 is within 70–110
    expect(glucose.referenceLow).toBe('70');
    expect(glucose.referenceHigh).toBe('110');
    expect(glucose.verifiedAt).not.toBeNull();
  });

  it('an unverified result shows its status but NOT its value, however old the visit', async () => {
    const patientId = await stagePatient();
    const visitId = await stageVisit(patientId, { startedAt: monthsAgo(6) });
    await stageLabResults(visitId);

    const visit = ((await getHistory(patientId).expect(200)).body as PatientHistoryResponse)
      .visits[0];
    const cbc = visit.labResults.find((r) => r.testName === 'Complete Blood Count')!;
    expect(cbc.status).toBe('resulted');
    expect(cbc.value).toBeNull(); // entered but not verified — withheld, same as 5.10's rule
    expect(cbc.verifiedAt).toBeNull();
  });

  it('an ordered test is pending with no value; a cancelled test is absent', async () => {
    const patientId = await stagePatient();
    const visitId = await stageVisit(patientId, { startedAt: monthsAgo(2) });
    await stageLabResults(visitId);

    const visit = ((await getHistory(patientId).expect(200)).body as PatientHistoryResponse)
      .visits[0];
    const names = visit.labResults.map((r) => r.testName);
    expect(names).toContain('ALT');
    expect(names).not.toContain('Malaria Film'); // cancelled — gone
    const alt = visit.labResults.find((r) => r.testName === 'ALT')!;
    expect(alt.status).toBe('ordered');
    expect(alt.value).toBeNull();
  });

  it('a visit with nothing ordered has an empty lab list, not a missing one', async () => {
    const patientId = await stagePatient();
    await stageVisit(patientId);

    const visit = ((await getHistory(patientId).expect(200)).body as PatientHistoryResponse)
      .visits[0];
    expect(visit.labResults).toEqual([]);
  });

  // --- Who -----------------------------------------------------------------------------

  it('the admin may read it — R2', async () => {
    const patientId = await stagePatient();
    await stageVisit(patientId);
    await getHistory(patientId, '', 'admin').expect(200);
  });

  it('the nurse may take a blood pressure and may not read a year of psychiatric attendance', async () => {
    const patientId = await stagePatient();
    // `patient.read_clinical` is R7 for the nurse; `patient.read_history` was never granted.
    // Reading today's record and reading a year of it are different acts.
    await getHistory(patientId, '', 'nurse').expect(403);
  });

  it('the receptionist and the pharmacist see nothing here', async () => {
    const patientId = await stagePatient();
    await getHistory(patientId, '', 'receptionist').expect(403);
    await getHistory(patientId, '', 'pharmacist').expect(403);
  });

  it('rejects anonymous requests', async () => {
    const patientId = await stagePatient();
    await request(server).get(`/patients/${patientId}/history`).expect(401);
  });

  // --- Audit and boundaries --------------------------------------------------------------

  it('audits the read against the patient', async () => {
    const patientId = await stagePatient();
    await getHistory(patientId).expect(200);

    const rows = await eventually(() =>
      prisma.auditLog.findMany({
        where: { action: AuditAction.read, entity: 'Patient', entityId: patientId },
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(doctorId);
  });

  it("404s on another facility's patient", async () => {
    const patientId = await stagePatient(otherFacilityId);
    await getHistory(patientId).expect(404);
  });

  it('404s on a patient that does not exist, 400s on an id that is not a uuid', async () => {
    await getHistory(randomUUID()).expect(404);
    await getHistory('not-a-uuid').expect(400);
  });
});
