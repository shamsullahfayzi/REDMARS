import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  LoginResponse,
  PharmacyPrescription,
  PharmacyQueueResponse,
} from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * The pharmacy queue (e2e) — task 6.8.
 *
 * The done-when: a pharmacist sees the doctor's active orders — who the patient is, who
 * prescribed, and the drugs — oldest first. A dispensed (completed) prescription, one on a
 * cancelled visit, and another facility's orders are all absent; a doctor cannot read the
 * queue at all (pharmacy.read_queue is not theirs).
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_pharm_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Pharmacy queue (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let practitionerId: string;
  let drugId: string;
  let patientId: string;
  let detailPrescriptionId: string;
  let otherPrescriptionId: string;
  const tokens: Record<string, string> = {};

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Pharm ${suffix}`,
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

  async function seedPrescription(
    facId: string,
    patId: string,
    departmentId: string,
    practId: string,
    drug: string,
    opts: {
      visitNo: string;
      visitStatus: string;
      status: string;
      drugs: string[];
      interactionAckReason?: string;
      overrideReason?: string;
    },
  ): Promise<string> {
    const visit = await prisma.visit.create({
      data: {
        facilityId: facId,
        patientId: patId,
        departmentId,
        visitNo: opts.visitNo,
        type: 'opd_consult',
        status: opts.visitStatus,
      },
    });
    const rx = await prisma.prescription.create({
      data: {
        visitId: visit.id,
        practitionerId: practId,
        status: opts.status as never,
        interactionAckReason: opts.interactionAckReason ?? null,
        items: {
          create: opts.drugs.map((name, i) => ({
            drugId: drug,
            drugNameAtTime: name,
            frequency: 'TDS',
            duration: '7 days',
            route: 'oral',
            sequence: i,
            allergyOverrideReason: i === 0 ? (opts.overrideReason ?? null) : null,
          })),
        },
      },
    });
    return rx.id;
  }

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.prescriptionItem.deleteMany({
      where: { prescription: { visit: facilityFilter } },
    });
    await prisma.prescription.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visitStatusHistory.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visit.deleteMany({ where: facilityFilter });
    await prisma.allergy.deleteMany({ where: { patient: facilityFilter } });
    await prisma.prescriptionItem.deleteMany({ where: { drug: facilityFilter } });
    await prisma.drug.deleteMany({ where: facilityFilter });
    await prisma.practitioner.deleteMany({ where: facilityFilter });
    await prisma.patient.deleteMany({ where: facilityFilter });
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
        data: { code: `${PREFIX}fac`, name: 'E2E Pharm Facility', phone: '0700000000' },
      })
    ).id;

    await seedActor('pharm', 'pharmacist');
    await seedActor('doctor', 'doctor');

    const dept = await prisma.department.create({
      data: { facilityId, code: `${PREFIX}OPD`, name: 'E2E OPD', type: 'opd' },
    });

    practitionerId = (
      await prisma.practitioner.create({
        data: { facilityId, code: `${PREFIX}DR`, firstName: 'Sara', lastName: 'Ahmadi' },
      })
    ).id;

    drugId = (
      await prisma.drug.create({
        data: { facilityId, code: `${PREFIX}DRUG`, genericName: 'Amoxicillin' },
      })
    ).id;

    const patient = await prisma.patient.create({
      data: {
        facilityId,
        mrn: `${PREFIX}MRN1`,
        prefix: 'Mr.',
        firstName: 'Bilal',
        lastName: 'Khan',
        gender: 'male',
        estimatedAgeYears: 40,
        ageRecordedAt: new Date(),
      },
    });
    patientId = patient.id;

    // The patient's allergies — one live, one retracted — the other half of what R6 grants.
    await prisma.allergy.create({
      data: {
        patientId,
        substance: 'Penicillin',
        reaction: 'Rash',
        severity: 'severe',
        isActive: true,
      },
    });
    await prisma.allergy.create({
      data: {
        patientId,
        substance: 'Sulfa (old)',
        severity: 'mild',
        isActive: false,
      },
    });

    // The one that should show: an active prescription on a live visit, two drugs, with a
    // per-line allergy override and a per-sheet interaction acknowledgement.
    detailPrescriptionId = await seedPrescription(facilityId, patientId, dept.id, practitionerId, drugId, {
      visitNo: `${PREFIX}V1`,
      visitStatus: 'arrived',
      status: 'active',
      drugs: ['Amoxicillin 500mg', 'Paracetamol 500mg'],
      interactionAckReason: 'Monitored',
      overrideReason: 'Benefit outweighs risk',
    });

    // Already dispensed — completed — so it is off the queue.
    await seedPrescription(facilityId, patientId, dept.id, practitionerId, drugId, {
      visitNo: `${PREFIX}V2`,
      visitStatus: 'completed',
      status: 'completed',
      drugs: ['Ibuprofen'],
    });

    // Active, but its visit was cancelled — gone from the queue.
    await seedPrescription(facilityId, patientId, dept.id, practitionerId, drugId, {
      visitNo: `${PREFIX}V3`,
      visitStatus: 'cancelled',
      status: 'active',
      drugs: ['Metformin'],
    });

    // Another facility's active order — never seen here.
    const otherFacilityId = (
      await prisma.facility.create({ data: { code: `${PREFIX}fac2`, name: 'E2E Other' } })
    ).id;
    const otherDept = await prisma.department.create({
      data: { facilityId: otherFacilityId, code: `${PREFIX}OPD2`, name: 'E2E OPD2', type: 'opd' },
    });
    const otherPract = await prisma.practitioner.create({
      data: { facilityId: otherFacilityId, code: `${PREFIX}DR2`, firstName: 'Omar', lastName: 'Zia' },
    });
    const otherPatient = await prisma.patient.create({
      data: {
        facilityId: otherFacilityId,
        mrn: `${PREFIX}MRN2`,
        firstName: 'Other',
        gender: 'female',
        estimatedAgeYears: 30,
        ageRecordedAt: new Date(),
      },
    });
    const otherVisit = await prisma.visit.create({
      data: {
        facilityId: otherFacilityId,
        patientId: otherPatient.id,
        departmentId: otherDept.id,
        visitNo: `${PREFIX}OV1`,
        type: 'opd_consult',
        status: 'arrived',
      },
    });
    otherPrescriptionId = (
      await prisma.prescription.create({
        data: {
          visitId: otherVisit.id,
          practitionerId: otherPract.id,
          status: 'active',
          items: {
            create: {
              drugId: (
                await prisma.drug.create({
                  data: {
                    facilityId: otherFacilityId,
                    code: `${PREFIX}DRUG2`,
                    genericName: 'Aspirin',
                  },
                })
              ).id,
              drugNameAtTime: 'Aspirin',
              frequency: 'OD',
              duration: '3 days',
              route: 'oral',
            },
          },
        },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  const queue = (as: string) =>
    request(server).get('/pharmacy/queue').set('Authorization', `Bearer ${tokens[as]}`);

  it('the done-when: the pharmacist sees the active orders, drugs and prescriber', async () => {
    const body = (await queue('pharm').expect(200)).body as PharmacyQueueResponse;

    const row = body.items.find((i) => i.visitNo === `${PREFIX}V1`);
    expect(row).toBeDefined();
    expect(row!.patientName).toBe('Mr. Bilal Khan');
    expect(row!.patientMrn).toBe(`${PREFIX}MRN1`);
    expect(row!.ageYears).toBe(40);
    expect(row!.practitionerName).toBe('Sara Ahmadi');
    expect(row!.itemCount).toBe(2);
    expect(row!.summary).toContain('Amoxicillin 500mg');
  });

  it('leaves out dispensed, cancelled and other facilities', async () => {
    const body = (await queue('pharm').expect(200)).body as PharmacyQueueResponse;
    const visitNos = body.items.map((i) => i.visitNo);
    expect(visitNos).not.toContain(`${PREFIX}V2`); // completed
    expect(visitNos).not.toContain(`${PREFIX}V3`); // cancelled visit
    expect(visitNos).not.toContain(`${PREFIX}OV1`); // other facility
  });

  const detail = (as: string, id: string) =>
    request(server).get(`/pharmacy/prescriptions/${id}`).set('Authorization', `Bearer ${tokens[as]}`);

  it('the done-when (6.9): opens a prescription to drugs + allergies, and NOTHING else', async () => {
    const body = (await detail('pharm', detailPrescriptionId).expect(200))
      .body as PharmacyPrescription;

    // The drugs, with the per-line allergy override and the per-sheet interaction ack.
    expect(body.items).toHaveLength(2);
    expect(body.items[0].drugName).toBe('Amoxicillin 500mg');
    expect(body.items[0].allergyOverrideReason).toBe('Benefit outweighs risk');
    expect(body.interactionAckReason).toBe('Monitored');

    // The allergies — active first, most severe first; the retracted one is present but last.
    expect(body.allergies[0].isActive).toBe(true);
    expect(body.allergies[0].substance).toBe('Penicillin');
    expect(body.allergies[0].severity).toBe('severe');
    expect(body.allergies.some((a) => !a.isActive)).toBe(true);

    // R6, verified structurally: the payload carries ONLY the drugs-and-allergies shape —
    // no diagnosis, complaint, note or vital field can be present because none is a key here.
    expect(Object.keys(body).sort()).toEqual(
      [
        'advice',
        'allergies',
        'interactionAckReason',
        'items',
        'orderedAt',
        'patient',
        'practitionerName',
        'prescriptionId',
        'status',
        'visitNo',
      ].sort(),
    );
  });

  it('404s a prescription in another facility', async () => {
    await detail('pharm', otherPrescriptionId).expect(404);
  });

  it('denies a doctor — pharmacy.read_queue is not theirs (queue and detail)', async () => {
    await queue('doctor').expect(403);
    await detail('doctor', detailPrescriptionId).expect(403);
  });
});
