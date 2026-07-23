import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { Gender, ModuleKey, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse, SaveLabResultResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Phase 5, fourth slice — entering a result and flagging it.
 *
 * The done-when: a technician types a value and the server records it AND flags it against
 * the normal band for this patient's gender and age — H above, L below, nothing when normal.
 * The heart of it is that the SAME number is normal for a woman and low for a man, so the
 * band is chosen server-side from the patient, never sent by the browser. The rest guards it:
 * a text result carries no H/L, a test with no band is recorded unflagged, a result is a
 * number XOR a text, only a collected sample can be resulted, re-entry overwrites, and only a
 * lab tech may enter.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_lr_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Lab result entry (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let actorId: string;
  let opdId: string;
  const tokens: Record<string, string> = {};
  const tests: Record<string, string> = {};

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E LabResult ${suffix}`,
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
  /** Seed a lab item straight to a status, with a patient of the given gender/age. */
  async function stageItem(
    testId: string,
    opts: { gender?: Gender; ageYears?: number; status?: 'ordered' | 'sample_collected' } = {},
  ): Promise<string> {
    counter += 1;
    const patient = await prisma.patient.create({
      data: {
        facilityId,
        mrn: `${PREFIX}MRN${counter}`,
        firstName: `Wali${counter}`,
        gender: opts.gender ?? Gender.male,
        estimatedAgeYears: opts.ageYears ?? 40,
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
        status: 'in_progress',
        statusHistory: { create: { status: 'arrived', changedBy: actorId } },
      },
    });
    const order = await prisma.labOrder.create({
      data: { facilityId, visitId: visit.id, orderNo: `${PREFIX}LAB${counter}` },
    });
    const item = await prisma.labOrderItem.create({
      data: {
        labOrderId: order.id,
        testId,
        testNameAtTime: 'seeded',
        status: opts.status ?? 'sample_collected',
      },
    });
    return item.id;
  }

  const putResult = (itemId: string, body: object, as = 'lab_tech') =>
    request(server)
      .put(`/lab-queue/items/${itemId}/result`)
      .set('Authorization', `Bearer ${tokens[as]}`)
      .send(body);

  /** Enter a result expecting success, and hand back the typed result payload. */
  async function enterResult(
    itemId: string,
    body: object,
    as = 'lab_tech',
  ): Promise<SaveLabResultResponse['result']> {
    const res = await putResult(itemId, body, as).expect(200);
    return (res.body as SaveLabResultResponse).result;
  }

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.invoiceItem.deleteMany({ where: { invoice: facilityFilter } });
    await prisma.payment.deleteMany({ where: { invoice: facilityFilter } });
    await prisma.invoice.deleteMany({ where: facilityFilter });
    await prisma.labResult.deleteMany({
      where: { labOrderItem: { labOrder: { visit: facilityFilter } } },
    });
    await prisma.labOrderItem.deleteMany({ where: { labOrder: { visit: facilityFilter } } });
    await prisma.labOrder.deleteMany({ where: { visit: facilityFilter } });
    await prisma.referenceRange.deleteMany({ where: { test: { code: { startsWith: PREFIX } } } });
    await prisma.visitStatusHistory.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visit.deleteMany({ where: facilityFilter });
    await prisma.patient.deleteMany({ where: facilityFilter });
    await prisma.labTest.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.practitioner.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.facilityModule.deleteMany({ where: facilityFilter });
    await prisma.numberSequence.deleteMany({ where: facilityFilter });
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
      await prisma.facility.create({
        data: { code: `${PREFIX}fac`, name: 'E2E LabResult Facility' },
      })
    ).id;
    await prisma.facilityModule.create({
      data: { facilityId, module: ModuleKey.lab, enabled: true, enabledAt: new Date() },
    });

    actorId = await seedActor('lab_tech', 'lab_tech');
    await seedActor('nurse', 'nurse');
    await seedActor('doctor', 'doctor');

    opdId = (
      await prisma.department.create({
        data: { facilityId, code: `${PREFIX}OPD`, name: 'E2E OPD', type: 'opd' },
      })
    ).id;

    // Glucose — one any-gender numeric band, 70..110 mg/dL.
    const glucose = await prisma.labTest.create({
      data: { facilityId, code: `${PREFIX}GLU`, name: 'Fasting Glucose', unit: 'mg/dL' },
    });
    await prisma.referenceRange.create({
      data: { testId: glucose.id, lowValue: '70', highValue: '110' },
    });
    // Haemoglobin — gender-specific: male 13..17, female 12..15. The discriminator.
    const hgb = await prisma.labTest.create({
      data: { facilityId, code: `${PREFIX}HGB`, name: 'Haemoglobin', unit: 'g/dL' },
    });
    await prisma.referenceRange.create({
      data: { testId: hgb.id, gender: Gender.male, lowValue: '13', highValue: '17' },
    });
    await prisma.referenceRange.create({
      data: { testId: hgb.id, gender: Gender.female, lowValue: '12', highValue: '15' },
    });
    // Malaria film — a text band: normal is "Negative".
    const mp = await prisma.labTest.create({
      data: { facilityId, code: `${PREFIX}MP`, name: 'Malaria Film' },
    });
    await prisma.referenceRange.create({ data: { testId: mp.id, textValue: 'Negative' } });
    // A test with no band at all.
    const noband = await prisma.labTest.create({
      data: { facilityId, code: `${PREFIX}NB`, name: 'Unbanded Test', unit: 'x' },
    });

    tests.glucose = glucose.id;
    tests.hgb = hgb.id;
    tests.mp = mp.id;
    tests.noband = noband.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  it('the done-when: a normal value is recorded, unflagged, and the test becomes resulted', async () => {
    const itemId = await stageItem(tests.glucose);
    const res = await putResult(itemId, { valueNumeric: '90' }).expect(200);
    const r = (res.body as SaveLabResultResponse).result;
    expect(r.status).toBe('resulted');
    expect(r.valueNumeric).toBe('90');
    expect(r.unit).toBe('mg/dL'); // defaulted from the test
    expect(r.flag).toBeNull();
    expect(r.isAbnormal).toBe(false);
    expect(r.referenceLow).toBe('70');
    expect(r.referenceHigh).toBe('110');

    const item = await prisma.labOrderItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.status).toBe('resulted');
  });

  it('flags H above the band and L below it', async () => {
    const high = await stageItem(tests.glucose);
    const rHigh = await enterResult(high, { valueNumeric: '140' });
    expect(rHigh.flag).toBe('H');
    expect(rHigh.isAbnormal).toBe(true);

    const low = await stageItem(tests.glucose);
    const rLow = await enterResult(low, { valueNumeric: '60' });
    expect(rLow.flag).toBe('L');
    expect(rLow.isAbnormal).toBe(true);
  });

  it('the heart of it: the same value is normal for a woman and low for a man', async () => {
    const male = await stageItem(tests.hgb, { gender: Gender.male });
    const female = await stageItem(tests.hgb, { gender: Gender.female });

    const forMale = await enterResult(male, { valueNumeric: '12.5' });
    const forFemale = await enterResult(female, { valueNumeric: '12.5' });

    // 12.5 is below the male band (13–17) but inside the female one (12–15).
    expect(forMale.flag).toBe('L');
    expect(forMale.isAbnormal).toBe(true);
    expect(forMale.referenceLow).toBe('13');
    expect(forFemale.flag).toBeNull();
    expect(forFemale.isAbnormal).toBe(false);
    expect(forFemale.referenceLow).toBe('12');
  });

  it('a text result carries no H/L, and differs from the band to read abnormal', async () => {
    const negative = await stageItem(tests.mp);
    const rNeg = await enterResult(negative, { valueText: 'Negative' });
    expect(rNeg.valueText).toBe('Negative');
    expect(rNeg.flag).toBeNull();
    expect(rNeg.isAbnormal).toBe(false);

    const positive = await stageItem(tests.mp);
    const rPos = await enterResult(positive, { valueText: 'Positive' });
    expect(rPos.flag).toBeNull(); // text has no H/L
    expect(rPos.isAbnormal).toBe(true); // but it is not the expected "Negative"
  });

  it('a test with no band is recorded but unflagged', async () => {
    const itemId = await stageItem(tests.noband);
    const r = await enterResult(itemId, { valueNumeric: '5' });
    expect(r.flag).toBeNull();
    expect(r.isAbnormal).toBe(false);
    expect(r.referenceLow).toBeNull();
    expect(r.referenceHigh).toBeNull();
  });

  it('a result is a number XOR a text: both, or neither, is a 400', async () => {
    const both = await stageItem(tests.glucose);
    await putResult(both, { valueNumeric: '90', valueText: 'x' }).expect(400);
    await putResult(both, {}).expect(400);
  });

  it('a test with no sample collected cannot be resulted', async () => {
    const itemId = await stageItem(tests.glucose, { status: 'ordered' });
    const res = await putResult(itemId, { valueNumeric: '90' }).expect(400);
    expect((res.body as { code?: string }).code).toBe('no_sample');
  });

  it('re-entering before verification overwrites the value', async () => {
    const itemId = await stageItem(tests.glucose);
    await enterResult(itemId, { valueNumeric: '90' });
    const again = await enterResult(itemId, { valueNumeric: '200' });
    expect(again.valueNumeric).toBe('200');
    expect(again.flag).toBe('H');
    const rows = await prisma.labResult.count({ where: { labOrderItemId: itemId } });
    expect(rows).toBe(1); // upsert, not a second row
  });

  it('only a lab tech may enter a result — nurse and doctor are denied', async () => {
    const forNurse = await stageItem(tests.glucose);
    await putResult(forNurse, { valueNumeric: '90' }, 'nurse').expect(403);
    const forDoctor = await stageItem(tests.glucose);
    await putResult(forDoctor, { valueNumeric: '90' }, 'doctor').expect(403);
  });
});
