import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { FollowUpListResponse, LoginResponse, PrescriptionResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 4.15 — the recall list.
 *
 * The done-when is "psych patients due next month are listable", which is one test. The
 * rest is about `attended`, which is what turns a diary into a work queue and is computed
 * rather than stored — so every way it could be wrong is a way a patient quietly falls off
 * the list: a visit counted in the wrong time zone, the originating consultation counting
 * as its own follow-up, a voided visit counting as attendance.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_fu_';
const PASSWORD = 'e2e-test-password-not-a-secret';

/** YYYY-MM-DD shifted by whole days, in UTC — these are calendar days, not instants. */
function day(offset: number, base = new Date()): string {
  const at = new Date(base);
  at.setUTCDate(at.getUTCDate() + offset);
  return at.toISOString().slice(0, 10);
}

describe('Follow-up recall list (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let otherFacilityId: string;
  let doctorId: string;
  let practitionerId: string;
  let otherPractitionerId: string;
  let opdId: string;
  let drugId: string;

  const tokens: Record<string, string> = {};

  jest.setTimeout(90_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E FU ${suffix}`,
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
    return (
      await prisma.patient.create({
        data: {
          facilityId: inFacility,
          mrn: `${PREFIX}MRN${counter}`,
          firstName: `Wahida${counter}`,
          gender: 'female',
          phone: `070000${String(counter).padStart(4, '0')}`,
          estimatedAgeYears: 36,
          ageRecordedAt: new Date(),
        },
      })
    ).id;
  }

  async function stageVisit(
    patientId: string,
    options: {
      startedAt?: Date;
      status?: 'in_progress' | 'completed' | 'entered_in_error';
      facility?: string;
    } = {},
  ): Promise<string> {
    counter += 1;
    return (
      await prisma.visit.create({
        data: {
          facilityId: options.facility ?? facilityId,
          patientId,
          departmentId: opdId,
          practitionerId,
          visitNo: `${PREFIX}V${counter}`,
          type: 'opd_consult',
          status: options.status ?? 'in_progress',
          startedAt: options.startedAt ?? new Date(),
        },
      })
    ).id;
  }

  /** A prescription written straight into the database, for list fixtures. */
  async function stageFollowUp(
    visitId: string,
    followUpDate: string,
    prescriber = practitionerId,
  ): Promise<void> {
    await prisma.prescription.create({
      data: {
        visitId,
        practitionerId: prescriber,
        followUpDate: new Date(`${followUpDate}T00:00:00.000Z`),
        items: {
          create: [
            {
              drugId,
              drugNameAtTime: 'Sertraline 50mg',
              frequency: 'OD',
              duration: '1 month',
              route: 'PO',
              sequence: 0,
            },
          ],
        },
      },
    });
  }

  const savePrescription = (visitId: string, body: unknown, as = 'doctor') =>
    request(server)
      .put(`/visits/${visitId}/prescription`)
      .set('Authorization', `Bearer ${tokens[as]}`)
      .send(body);

  const listFollowUps = (query = '', as = 'doctor') =>
    request(server).get(`/follow-ups${query}`).set('Authorization', `Bearer ${tokens[as]}`);

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.prescriptionItem.deleteMany({
      where: { prescription: { visit: facilityFilter } },
    });
    await prisma.prescription.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visitStatusHistory.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visit.deleteMany({ where: facilityFilter });
    await prisma.patient.deleteMany({ where: facilityFilter });
    await prisma.drug.deleteMany({ where: { code: { startsWith: PREFIX } } });
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
      await prisma.facility.create({ data: { code: `${PREFIX}fac`, name: 'E2E FU Facility' } })
    ).id;
    otherFacilityId = (
      await prisma.facility.create({ data: { code: `${PREFIX}other`, name: 'E2E FU Other' } })
    ).id;

    doctorId = await seedActor('doctor', 'doctor');
    await seedActor('receptionist', 'receptionist');
    await seedActor('admin', 'admin');
    await seedActor('nurse', 'nurse');
    await seedActor('pharmacist', 'pharmacist');
    await seedActor('management', 'management');

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
    otherPractitionerId = (
      await prisma.practitioner.create({
        data: { facilityId, code: `${PREFIX}DR2`, firstName: 'Nadia', lastName: 'Amini' },
      })
    ).id;

    drugId = (
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
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  // --- The date, on the prescription ------------------------------------------------

  it('saves a follow-up with the sheet and gives it back as a plain day', async () => {
    const visitId = await stageVisit(await stagePatient());
    const due = day(28);

    const saved = await savePrescription(visitId, {
      items: [{ drugId, frequency: 'OD', duration: '1 month', route: 'PO' }],
      followUpDate: due,
    }).expect(200);

    // YYYY-MM-DD both ways. An instant here is how "the fifth" becomes the fourth for
    // whoever reads it from the other side of midnight.
    expect((saved.body as PrescriptionResponse).prescription?.followUpDate).toBe(due);
  });

  it('refuses a follow-up before the visit it was decided in', async () => {
    const visitId = await stageVisit(await stagePatient());
    const res = await savePrescription(visitId, {
      items: [{ drugId, frequency: 'OD', duration: '1 month', route: 'PO' }],
      followUpDate: day(-1),
    }).expect(400);
    expect((res.body as { code?: string }).code).toBe('follow_up_in_past');
  });

  it('refuses a follow-up two years and a day out — the mistyped year', async () => {
    const visitId = await stageVisit(await stagePatient());
    const res = await savePrescription(visitId, {
      items: [{ drugId, frequency: 'OD', duration: '1 month', route: 'PO' }],
      followUpDate: '2062-08-15',
    }).expect(400);
    expect((res.body as { code?: string }).code).toBe('follow_up_too_far');
  });

  it('refuses anything that is not a calendar day', async () => {
    const visitId = await stageVisit(await stagePatient());
    await savePrescription(visitId, {
      items: [{ drugId, frequency: 'OD', duration: '1 month', route: 'PO' }],
      followUpDate: 'next month',
    }).expect(400);
  });

  it('takes a sheet with no follow-up at all, and lets one be cleared', async () => {
    const visitId = await stageVisit(await stagePatient());
    const items = [{ drugId, frequency: 'OD', duration: '1 month', route: 'PO' }];

    const none = await savePrescription(visitId, { items }).expect(200);
    expect((none.body as PrescriptionResponse).prescription?.followUpDate).toBeNull();

    await savePrescription(visitId, { items, followUpDate: day(14) }).expect(200);
    // Re-saving without one takes it off — a review cancelled is a review cancelled.
    const cleared = await savePrescription(visitId, { items, followUpDate: null }).expect(200);
    expect((cleared.body as PrescriptionResponse).prescription?.followUpDate).toBeNull();
  });

  // --- The done-when ------------------------------------------------------------------

  it('the done-when: patients due next month are listable', async () => {
    const patientId = await stagePatient();
    const visitId = await stageVisit(patientId);
    const due = day(20);
    await stageFollowUp(visitId, due);

    const res = await listFollowUps().expect(200);
    const list = res.body as FollowUpListResponse;

    const row = list.followUps.find((entry) => entry.patientId === patientId);
    expect(row).toBeDefined();
    expect(row!.followUpDate).toBe(due);
    expect(row!.visitId).toBe(visitId);
    expect(row!.practitionerName).toBe('Hafizullah Sherzai');
    // The number the desk rings. A recall list nobody can act on does not get worked.
    expect(row!.patientPhone).toBeTruthy();
    expect(row!.attended).toBe(false);
  });

  it('holds the window, and takes an explicit one', async () => {
    const inside = await stagePatient();
    const outside = await stagePatient();
    await stageFollowUp(await stageVisit(inside), day(10));
    await stageFollowUp(await stageVisit(outside), day(120));

    const defaultWindow = (await listFollowUps().expect(200)).body as FollowUpListResponse;
    const ids = defaultWindow.followUps.map((entry) => entry.patientId);
    expect(ids).toContain(inside);
    expect(ids).not.toContain(outside);

    const wide = (await listFollowUps(`?from=${day(0)}&to=${day(200)}`).expect(200))
      .body as FollowUpListResponse;
    expect(wide.followUps.map((entry) => entry.patientId)).toContain(outside);
    expect(wide.from).toBe(day(0));
    expect(wide.to).toBe(day(200));
  });

  it('lists soonest first — the ones about to be missed are the ones to ring today', async () => {
    const later = await stagePatient();
    const sooner = await stagePatient();
    await stageFollowUp(await stageVisit(later), day(25));
    await stageFollowUp(await stageVisit(sooner), day(3));

    const list = (await listFollowUps().expect(200)).body as FollowUpListResponse;
    const mine = list.followUps.filter((entry) => [later, sooner].includes(entry.patientId));
    expect(mine.map((entry) => entry.patientId)).toEqual([sooner, later]);
  });

  it('narrows to one prescriber', async () => {
    const ours = await stagePatient();
    const theirs = await stagePatient();
    await stageFollowUp(await stageVisit(ours), day(5));
    await stageFollowUp(await stageVisit(theirs), day(5), otherPractitionerId);

    const list = (await listFollowUps(`?practitionerId=${practitionerId}`).expect(200))
      .body as FollowUpListResponse;
    const ids = list.followUps.map((entry) => entry.patientId);
    expect(ids).toContain(ours);
    expect(ids).not.toContain(theirs);
  });

  it('refuses a window that is not made of calendar days', async () => {
    await listFollowUps('?from=last-week').expect(400);
    await listFollowUps('?to=2026').expect(400);
  });

  // --- attended, which is the whole point ---------------------------------------------

  it('marks a patient attended once they are seen on or after the day they were due', async () => {
    const patientId = await stagePatient();
    const due = day(-10);
    await stageFollowUp(
      await stageVisit(patientId, { startedAt: new Date(`${day(-40)}T09:00:00Z`) }),
      due,
    );

    const before = (await listFollowUps(`?from=${day(-30)}&to=${day(0)}`).expect(200))
      .body as FollowUpListResponse;
    expect(before.followUps.find((entry) => entry.patientId === patientId)?.attended).toBe(false);

    // They came back.
    await stageVisit(patientId, { startedAt: new Date(`${day(-8)}T09:00:00Z`) });

    const after = (await listFollowUps(`?from=${day(-30)}&to=${day(0)}`).expect(200))
      .body as FollowUpListResponse;
    const row = after.followUps.find((entry) => entry.patientId === patientId);
    expect(row?.attended).toBe(true);
    expect(row?.attendedAt).toBeTruthy();
  });

  it('does not let the consultation count as its own follow-up', async () => {
    const patientId = await stagePatient();
    const startedAt = new Date();
    const visitId = await stageVisit(patientId, { startedAt });
    // A review set for the same day, which the contract allows.
    await stageFollowUp(visitId, day(0));

    const list = (await listFollowUps(`?from=${day(0)}&to=${day(0)}`).expect(200))
      .body as FollowUpListResponse;
    expect(list.followUps.find((entry) => entry.patientId === patientId)?.attended).toBe(false);
  });

  it('does not count a voided visit as having come back', async () => {
    const patientId = await stagePatient();
    await stageFollowUp(
      await stageVisit(patientId, { startedAt: new Date(`${day(-40)}T09:00:00Z`) }),
      day(-10),
    );
    await stageVisit(patientId, {
      startedAt: new Date(`${day(-8)}T09:00:00Z`),
      status: 'entered_in_error',
    });

    const list = (await listFollowUps(`?from=${day(-30)}&to=${day(0)}`).expect(200))
      .body as FollowUpListResponse;
    // Taking a patient off the recall list on the strength of a mistake somebody already
    // corrected is how a patient is lost.
    expect(list.followUps.find((entry) => entry.patientId === patientId)?.attended).toBe(false);
  });

  it('counts what was missed, and filters to it without changing the count', async () => {
    const missedPatient = await stagePatient();
    const seenPatient = await stagePatient();
    const from = day(-25);
    const to = day(-15);

    await stageFollowUp(
      await stageVisit(missedPatient, { startedAt: new Date(`${day(-50)}T09:00:00Z`) }),
      day(-20),
    );
    await stageFollowUp(
      await stageVisit(seenPatient, { startedAt: new Date(`${day(-50)}T09:00:00Z`) }),
      day(-20),
    );
    await stageVisit(seenPatient, { startedAt: new Date(`${day(-18)}T09:00:00Z`) });

    const all = (await listFollowUps(`?from=${from}&to=${to}`).expect(200))
      .body as FollowUpListResponse;
    expect(all.followUps.map((entry) => entry.patientId).sort()).toEqual(
      [missedPatient, seenPatient].sort(),
    );
    expect(all.missed).toBe(1);

    const onlyMissed = (await listFollowUps(`?from=${from}&to=${to}&onlyMissed=true`).expect(200))
      .body as FollowUpListResponse;
    expect(onlyMissed.followUps.map((entry) => entry.patientId)).toEqual([missedPatient]);
    // The header number describes the window, not the filter — so it does not change
    // meaning under the desk as they work the list down.
    expect(onlyMissed.missed).toBe(1);
  });

  // --- Who -----------------------------------------------------------------------------

  it('THE RECEPTIONIST HOLDS IT — the desk is who rings a patient who did not come back', async () => {
    await listFollowUps('', 'receptionist').expect(200);
  });

  it('the admin may read it — R2', async () => {
    await listFollowUps('', 'admin').expect(200);
  });

  it('management does not see named patients and phone numbers', async () => {
    // Every other list they hold is counts and money. There is no operational question
    // that needs the names to answer it.
    await listFollowUps('', 'management').expect(403);
  });

  it('the nurse and the pharmacist have no recall list', async () => {
    await listFollowUps('', 'nurse').expect(403);
    await listFollowUps('', 'pharmacist').expect(403);
  });

  it('rejects anonymous requests', async () => {
    await request(server).get('/follow-ups').expect(401);
  });

  // --- Boundaries ------------------------------------------------------------------------

  it("never lists another facility's recalls", async () => {
    const theirs = await stagePatient(otherFacilityId);
    const theirVisit = await prisma.visit.create({
      data: {
        facilityId: otherFacilityId,
        patientId: theirs,
        departmentId: opdId,
        visitNo: `${PREFIX}VOTHER`,
        type: 'opd_consult',
        status: 'in_progress',
      },
    });
    await prisma.prescription.create({
      data: {
        visitId: theirVisit.id,
        practitionerId,
        followUpDate: new Date(`${day(7)}T00:00:00.000Z`),
      },
    });

    const list = (await listFollowUps().expect(200)).body as FollowUpListResponse;
    expect(list.followUps.map((entry) => entry.patientId)).not.toContain(theirs);
  });
});
