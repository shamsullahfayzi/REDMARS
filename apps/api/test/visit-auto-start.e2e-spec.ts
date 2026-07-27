import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { ModuleKey, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 6b.4 — the visit becomes `in_progress` on the first clinical write, never on
 * merely opening the chart, and never on a write the server ends up refusing.
 *
 * Every clinical-write path gets its own case here — vitals, complaint, diagnosis,
 * prescription, notes, lab order — because each one lives in its own service and each one
 * had to be taught this separately. The two negative cases matter as much as the six
 * positive ones: a rejected diagnosis (bad ICD code) and an empty lab-order save (nothing
 * asked for, nothing on file) must leave an `arrived` visit exactly `arrived`.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_autostart_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Consult auto-start on first clinical write (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let doctorId: string;
  let opdId: string;
  let drugId: string;
  let labTestId: string;

  const tokens: Record<string, string> = {};

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E AutoStart ${suffix}`,
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
  async function stageVisit(status: 'arrived' | 'in_progress' = 'arrived'): Promise<string> {
    counter += 1;
    const patient = await prisma.patient.create({
      data: {
        facilityId,
        mrn: `${PREFIX}MRN${counter}`,
        firstName: `Zarghuna${counter}`,
        gender: 'female',
        estimatedAgeYears: 33,
        ageRecordedAt: new Date(),
      },
    });
    const visit = await prisma.visit.create({
      data: {
        facilityId,
        patientId: patient.id,
        departmentId: opdId,
        visitNo: `${PREFIX}V${counter}`,
        type: 'opd_consult',
        status,
        // Same as every other consult spec: the opening row is `arrived` regardless of
        // where the visit is staged to start, because that is the fact the real create()
        // path always writes first.
        statusHistory: { create: { status: 'arrived', changedBy: doctorId } },
      },
    });
    return visit.id;
  }

  async function statusOf(visitId: string): Promise<string> {
    return (
      await prisma.visit.findUniqueOrThrow({ where: { id: visitId }, select: { status: true } })
    ).status;
  }

  async function inProgressRows(visitId: string) {
    return prisma.visitStatusHistory.findMany({ where: { visitId, status: 'in_progress' } });
  }

  const auth = (as = 'doctor') => `Bearer ${tokens[as]}`;

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.invoiceItem.deleteMany({ where: { invoice: facilityFilter } });
    await prisma.invoice.deleteMany({ where: facilityFilter });
    await prisma.labResult.deleteMany({
      where: { labOrderItem: { labOrder: { visit: facilityFilter } } },
    });
    await prisma.labOrderItem.deleteMany({ where: { labOrder: { visit: facilityFilter } } });
    await prisma.labOrder.deleteMany({ where: { visit: facilityFilter } });
    await prisma.clinicalNote.deleteMany({ where: { visit: facilityFilter } });
    await prisma.prescriptionItem.deleteMany({
      where: { prescription: { visit: facilityFilter } },
    });
    await prisma.prescription.deleteMany({ where: { visit: facilityFilter } });
    await prisma.diagnosis.deleteMany({ where: { visit: facilityFilter } });
    await prisma.vitals.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visitStatusHistory.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visit.deleteMany({ where: facilityFilter });
    await prisma.patient.deleteMany({ where: facilityFilter });
    await prisma.drug.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.labTest.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.practitioner.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.facilityModule.deleteMany({ where: facilityFilter });
    await prisma.numberSequence.deleteMany({ where: facilityFilter });
    await prisma.department.deleteMany({ where: { code: { startsWith: PREFIX } } });
    // Again, and deliberately. The R1 read row is written fire-and-forget, so one can land
    // AFTER the sweep above and before the facility goes — and then the facility delete
    // fails on a foreign key, inside afterAll, which Jest reports as a failed suite with no
    // failed tests. Cheap to repeat, miserable to debug.
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
      await prisma.facility.create({
        data: { code: `${PREFIX}fac`, name: 'E2E AutoStart Facility' },
      })
    ).id;
    await prisma.facilityModule.create({
      data: { facilityId, module: ModuleKey.lab, enabled: true, enabledAt: new Date() },
    });

    doctorId = await seedActor('doctor', 'doctor');

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

    drugId = (
      await prisma.drug.create({
        data: {
          facilityId,
          code: `${PREFIX}DRG`,
          genericName: 'Sertraline',
          strength: '50mg',
          form: 'tablet',
          defaultRoute: 'oral',
          defaultFreq: 'OD',
          defaultDuration: '1 month',
        },
      })
    ).id;

    labTestId = (
      await prisma.labTest.create({
        data: { facilityId, code: `${PREFIX}CBC`, name: 'Complete Blood Count', price: '150.00' },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  it('a vital sign starts an arrived visit', async () => {
    const visitId = await stageVisit('arrived');
    await request(server)
      .post(`/visits/${visitId}/vitals`)
      .set('Authorization', auth())
      .send({ pulse: 78 })
      .expect(201);

    expect(await statusOf(visitId)).toBe('in_progress');
    const rows = await inProgressRows(visitId);
    expect(rows).toHaveLength(1);
    expect(rows[0].changedBy).toBe(doctorId);
  });

  it("the doctor's own version of the complaint starts an arrived visit", async () => {
    const visitId = await stageVisit('arrived');
    await request(server)
      .patch(`/visits/${visitId}/complaint`)
      .set('Authorization', auth())
      .send({ chiefComplaint: 'low mood, poor sleep' })
      .expect(200);

    expect(await statusOf(visitId)).toBe('in_progress');
    expect(await inProgressRows(visitId)).toHaveLength(1);
  });

  it('a diagnosis starts an arrived visit', async () => {
    const visitId = await stageVisit('arrived');
    await request(server)
      .post(`/visits/${visitId}/diagnoses`)
      .set('Authorization', auth())
      .send({ text: 'Moderate depressive episode', icdCode: 'F32.1', certainty: 'confirmed' })
      .expect(201);

    expect(await statusOf(visitId)).toBe('in_progress');
    expect(await inProgressRows(visitId)).toHaveLength(1);
  });

  it('an unknown ICD code is refused, and refusing it does not start the visit', async () => {
    const visitId = await stageVisit('arrived');
    await request(server)
      .post(`/visits/${visitId}/diagnoses`)
      .set('Authorization', auth())
      .send({ text: 'Something', icdCode: 'Z99.9Z' })
      .expect(400);

    expect(await statusOf(visitId)).toBe('arrived');
    expect(await inProgressRows(visitId)).toHaveLength(0);
  });

  it('a prescription starts an arrived visit', async () => {
    const visitId = await stageVisit('arrived');
    await request(server)
      .put(`/visits/${visitId}/prescription`)
      .set('Authorization', auth())
      .send({ items: [{ drugId, frequency: 'OD', duration: '1 month', route: 'PO' }] })
      .expect(200);

    expect(await statusOf(visitId)).toBe('in_progress');
    expect(await inProgressRows(visitId)).toHaveLength(1);
  });

  it('a clinical note starts an arrived visit', async () => {
    const visitId = await stageVisit('arrived');
    await request(server)
      .put(`/visits/${visitId}/notes`)
      .set('Authorization', auth())
      .send({ noteType: 'progress', content: { progress: 'First contact today.' } })
      .expect(200);

    expect(await statusOf(visitId)).toBe('in_progress');
    expect(await inProgressRows(visitId)).toHaveLength(1);
  });

  it('a lab order starts an arrived visit', async () => {
    const visitId = await stageVisit('arrived');
    await request(server)
      .put(`/visits/${visitId}/lab-order`)
      .set('Authorization', auth())
      .send({ testIds: [labTestId] })
      .expect(200);

    expect(await statusOf(visitId)).toBe('in_progress');
    expect(await inProgressRows(visitId)).toHaveLength(1);
  });

  it('an empty lab-order save with nothing on file is a no-op, and does not start the visit', async () => {
    const visitId = await stageVisit('arrived');
    await request(server)
      .put(`/visits/${visitId}/lab-order`)
      .set('Authorization', auth())
      .send({ testIds: [] })
      .expect(200);

    expect(await statusOf(visitId)).toBe('arrived');
    expect(await inProgressRows(visitId)).toHaveLength(0);
  });

  it('a visit already in progress is left alone — no second history row from a later write', async () => {
    const visitId = await stageVisit('in_progress');
    await request(server)
      .post(`/visits/${visitId}/vitals`)
      .set('Authorization', auth())
      .send({ pulse: 80 })
      .expect(201);

    expect(await statusOf(visitId)).toBe('in_progress');
    // Never started `arrived` in the first place, so there is nothing to have flipped.
    expect(await inProgressRows(visitId)).toHaveLength(0);
  });

  it('two clinical writes on the same arrived visit produce exactly one in_progress row', async () => {
    const visitId = await stageVisit('arrived');
    await request(server)
      .post(`/visits/${visitId}/vitals`)
      .set('Authorization', auth())
      .send({ pulse: 82 })
      .expect(201);
    await request(server)
      .patch(`/visits/${visitId}/complaint`)
      .set('Authorization', auth())
      .send({ chiefComplaint: 'headache' })
      .expect(200);

    expect(await inProgressRows(visitId)).toHaveLength(1);
  });
});
