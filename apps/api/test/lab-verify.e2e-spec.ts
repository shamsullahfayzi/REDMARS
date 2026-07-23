import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { ModuleKey, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LabQueueResponse, LoginResponse, VerifyResultResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Phase 5, fifth slice — verifying a result.
 *
 * The done-when: a resulted test is signed off to `verified`, stamped with who and when, and
 * then drops off the active worklist — the work is done. The rest guards it: a batch is all or
 * nothing (a not-yet-resulted item in the set refuses the whole verify), an already-verified
 * result is not re-verified, an unknown id 400s, and only the holder of lab.verify_result may
 * do it (lab tech yes; nurse and doctor no).
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_lv_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Lab result verification (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let actorId: string;
  let opdId: string;
  const tokens: Record<string, string> = {};
  let glucoseId: string;

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E LabVerify ${suffix}`,
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
  /** Seed a lab item straight to a status; when `resulted`, attach a result row too. */
  async function stageItem(status: 'sample_collected' | 'resulted' | 'verified'): Promise<string> {
    counter += 1;
    const patient = await prisma.patient.create({
      data: {
        facilityId,
        mrn: `${PREFIX}MRN${counter}`,
        firstName: `Wali${counter}`,
        gender: 'male',
        estimatedAgeYears: 40,
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
      data: { labOrderId: order.id, testId: glucoseId, testNameAtTime: 'seeded', status },
    });
    if (status === 'resulted' || status === 'verified') {
      await prisma.labResult.create({
        data: {
          labOrderItemId: item.id,
          valueNumeric: '90',
          unit: 'mg/dL',
          isAbnormal: false,
          enteredBy: actorId,
          ...(status === 'verified' ? { verifiedBy: actorId, verifiedAt: new Date() } : {}),
        },
      });
    }
    return item.id;
  }

  const verify = (itemIds: string[], as = 'lab_tech') =>
    request(server)
      .post('/lab-queue/verify')
      .set('Authorization', `Bearer ${tokens[as]}`)
      .send({ itemIds });

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
        data: { code: `${PREFIX}fac`, name: 'E2E LabVerify Facility' },
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
    glucoseId = (
      await prisma.labTest.create({
        data: { facilityId, code: `${PREFIX}GLU`, name: 'Fasting Glucose', unit: 'mg/dL' },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  it('the done-when: a resulted test verifies — stamped, and gone from the active worklist', async () => {
    const itemId = await stageItem('resulted');
    const res = await verify([itemId]).expect(201);
    const body = res.body as VerifyResultResponse;
    expect(body.items).toHaveLength(1);
    expect(body.items[0].status).toBe('verified');

    const item = await prisma.labOrderItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.status).toBe('verified');
    const result = await prisma.labResult.findUniqueOrThrow({ where: { labOrderItemId: itemId } });
    expect(result.verifiedAt).not.toBeNull();
    expect(result.verifiedBy).toBe(actorId);

    // The active worklist no longer carries it — verified is done, not waiting.
    const queue = (
      await request(server)
        .get('/lab-queue')
        .set('Authorization', `Bearer ${tokens.lab_tech}`)
        .expect(200)
    ).body as LabQueueResponse;
    expect(queue.entries.some((e) => e.itemId === itemId)).toBe(false);
  });

  it('all or nothing: a not-yet-resulted item in the batch refuses the whole verify', async () => {
    const resulted = await stageItem('resulted');
    const collected = await stageItem('sample_collected');
    const res = await verify([resulted, collected]).expect(400);
    expect((res.body as { code?: string }).code).toBe('not_verifiable');

    // Neither moved.
    const rows = await prisma.labOrderItem.findMany({
      where: { id: { in: [resulted, collected] } },
    });
    expect(rows.find((r) => r.id === resulted)!.status).toBe('resulted');
    expect(rows.find((r) => r.id === collected)!.status).toBe('sample_collected');
  });

  it('an already-verified result is not verified again', async () => {
    const itemId = await stageItem('verified');
    await verify([itemId]).expect(400);
  });

  it('rejects an unknown item id with 400', () =>
    verify(['00000000-0000-0000-0000-000000000000']).expect(400));

  it('only lab.verify_result may verify — nurse and doctor are denied', async () => {
    const forNurse = await stageItem('resulted');
    await verify([forNurse], 'nurse').expect(403);
    const forDoctor = await stageItem('resulted');
    await verify([forDoctor], 'doctor').expect(403);
  });
});
