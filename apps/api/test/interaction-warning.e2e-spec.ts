import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  InteractionCheckResponse,
  InteractionWarningResponse,
  LoginResponse,
  PrescriptionResponse,
} from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 4.9 — the SOFT interaction warning. "SSRI + MAOI warns before save."
 *
 * The softness is real and it lives in the SEVERITY, not in a weaker mechanism. Task
 * 2.11's contract already grades these — "contraindicated/major as danger, moderate as
 * warning, minor as info" — so this enforces a line the data already draws:
 *
 *   minor, moderate      → shown, never an obstacle
 *   major, contraindicated → wants a sentence
 *
 * That is what separates it from task 4.8's hard block. A recorded allergy stops EVERY
 * prescription of that drug however mild the reaction, because the alternative is deciding
 * on a patient's behalf which of their allergies matter. An interaction is graded by
 * whoever curated the list, and making a doctor justify every minor pairing produces a
 * prescriber who dismisses warnings without reading them.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_ddi_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Drug interaction warning at prescribe time (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let doctorId: string;
  let opdId: string;
  const drugs: Record<string, string> = {};
  let token: string;

  jest.setTimeout(60_000);

  let counter = 0;
  async function stageVisit(): Promise<string> {
    counter += 1;
    const patient = await prisma.patient.create({
      data: {
        facilityId,
        mrn: `${PREFIX}MRN${counter}`,
        firstName: `Rahim${counter}`,
        gender: 'male',
        estimatedAgeYears: 47,
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
        statusHistory: { create: { status: 'arrived', changedBy: doctorId } },
      },
    });
    return visit.id;
  }

  const putRx = (visitId: string, body: unknown) =>
    request(server)
      .put(`/visits/${visitId}/prescription`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const line = (drugId: string, over: Record<string, unknown> = {}) => ({
    drugId,
    frequency: 'OD',
    duration: '1 month',
    route: 'PO',
    ...over,
  });

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.prescriptionItem.deleteMany({
      where: { prescription: { visit: facilityFilter } },
    });
    await prisma.prescription.deleteMany({ where: { visit: facilityFilter } });
    await prisma.drugInteraction.deleteMany({
      where: { drugA: { code: { startsWith: PREFIX } } },
    });
    await prisma.visitStatusHistory.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visit.deleteMany({ where: facilityFilter });
    await prisma.patient.deleteMany({ where: facilityFilter });
    await prisma.drug.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.practitioner.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.department.deleteMany({ where: { code: { startsWith: PREFIX } } });
    // Again, and deliberately. The R1 read row is written fire-and-forget, so one can
    // land AFTER the sweep above and before the facility goes — and then the facility
    // delete fails on a foreign key, inside afterAll, which Jest reports as a failed suite
    // with no failed tests. Cheap to repeat, miserable to debug.
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

    facilityId = (await prisma.facility.create({ data: { code: `${PREFIX}fac`, name: 'E2E DDI' } }))
      .id;

    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}doctor`,
        fullName: 'E2E DDI doctor',
        passwordHash: await hash(PASSWORD),
      },
    });
    doctorId = user.id;
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'doctor' } });
    await prisma.userRole.create({ data: { userId: doctorId, roleId: role.id } });
    const login = await request(server)
      .post('/auth/login')
      .send({ username: `${PREFIX}doctor`, password: PASSWORD })
      .expect(200);
    token = (login.body as LoginResponse).accessToken;

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

    const seedDrug = async (key: string, genericName: string) => {
      const drug = await prisma.drug.create({
        data: {
          facilityId,
          code: `${PREFIX}${key}`,
          genericName,
          strength: '20mg',
          form: 'tablet',
        },
      });
      drugs[key] = drug.id;
    };
    await seedDrug('FLUOX', 'Fluoxetine');
    await seedDrug('SELEG', 'Selegiline');
    await seedDrug('LITH', 'Lithium carbonate');
    await seedDrug('IBU', 'Ibuprofen');
    await seedDrug('PARA', 'Paracetamol');

    // The SSRI + MAOI pair the done-when names — serotonin syndrome, contraindicated.
    await prisma.drugInteraction.create({
      data: {
        drugAId: drugs.FLUOX,
        drugBId: drugs.SELEG,
        severity: 'contraindicated',
        description: 'Serotonin syndrome. Do not combine an SSRI with an MAOI.',
      },
    });
    // A genuine but lesser one, to prove the soft half is actually soft.
    await prisma.drugInteraction.create({
      data: {
        drugAId: drugs.LITH,
        drugBId: drugs.IBU,
        severity: 'moderate',
        description: 'NSAIDs raise lithium levels. Monitor.',
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  // --- The done-when ------------------------------------------------------------

  it('the done-when: SSRI + MAOI warns before save', async () => {
    const visitId = await stageVisit();

    // The browser asks as the rows change — this is the "before save" half, and it is
    // task 2.11's endpoint doing the work.
    const live = await request(server)
      .get(`/drug-interactions/check?drugIds=${drugs.FLUOX},${drugs.SELEG}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const found = (live.body as InteractionCheckResponse).interactions;
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('contraindicated');

    // And the server refuses the save until somebody says why.
    const res = await putRx(visitId, {
      items: [line(drugs.FLUOX), line(drugs.SELEG)],
    }).expect(409);

    const body = res.body as InteractionWarningResponse;
    expect(body.code).toBe('interaction_warning');
    expect(body.interactions).toHaveLength(1);
    expect(body.interactions[0].description).toContain('Serotonin syndrome');
    expect(body.interactions[0].drugAName).toBeTruthy();
    expect(body.interactions[0].drugBName).toBeTruthy();

    expect(await prisma.prescription.count({ where: { visitId } })).toBe(0);
  });

  it('goes through with a reason, and the reason is on the record', async () => {
    const visitId = await stageVisit();
    const saved = await putRx(visitId, {
      items: [line(drugs.FLUOX), line(drugs.SELEG)],
      interactionAckReason: 'Washout completed 6 weeks ago; supervised cross-taper.',
    }).expect(200);

    const { prescription } = saved.body as PrescriptionResponse;
    expect(prescription?.interactionAckReason).toContain('Washout completed');

    const stored = await prisma.prescription.findFirstOrThrow({ where: { visitId } });
    expect(stored.interactionAckReason).toBeTruthy();
  });

  it('refuses a reason too short to mean anything', async () => {
    const visitId = await stageVisit();
    await putRx(visitId, {
      items: [line(drugs.FLUOX), line(drugs.SELEG)],
      interactionAckReason: 'ok',
    }).expect(400);
  });

  // --- The soft half is actually soft ----------------------------------------------

  it('a MODERATE pair does not stop anybody — that is the whole difference from 4.8', async () => {
    const visitId = await stageVisit();
    // Lithium + ibuprofen is a real interaction and it is worth showing. It is not worth
    // making a doctor type a sentence about, because a prescriber who justifies every
    // minor pairing stops reading the ones that matter.
    await putRx(visitId, { items: [line(drugs.LITH), line(drugs.IBU)] }).expect(200);
  });

  it('but the browser can still see the moderate one, so it can warn', async () => {
    const live = await request(server)
      .get(`/drug-interactions/check?drugIds=${drugs.LITH},${drugs.IBU}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((live.body as InteractionCheckResponse).interactions[0].severity).toBe('moderate');
  });

  it('an unseeded pair does not warn — and that means UNSEEDED, not safe', async () => {
    const visitId = await stageVisit();
    // The schema is explicit: "you cannot build a comprehensive interaction database — the
    // real ones are commercially licensed." An empty result means no seeded pair matched.
    await putRx(visitId, { items: [line(drugs.PARA), line(drugs.IBU)] }).expect(200);
  });

  it('one drug on its own is never an interaction', async () => {
    const visitId = await stageVisit();
    await putRx(visitId, { items: [line(drugs.FLUOX)] }).expect(200);
  });

  it('finds the pair whichever way round the seed stored it', async () => {
    const visitId = await stageVisit();
    // The @@unique([drugAId, drugBId]) does not normalise order, so the query asks both
    // directions. Sending the drugs in the opposite order to the seed must still catch it.
    await putRx(visitId, { items: [line(drugs.SELEG), line(drugs.FLUOX)] }).expect(409);
  });

  // --- Alongside the allergy block ---------------------------------------------------

  it('the allergy block comes first — the patient-specific danger outranks the general one', async () => {
    const visitId = await stageVisit();
    const visit = await prisma.visit.findFirstOrThrow({ where: { id: visitId } });
    await prisma.allergy.create({
      data: {
        patientId: visit.patientId,
        substance: 'Fluoxetine',
        severity: 'severe',
        notedBy: doctorId,
      },
    });

    const res = await putRx(visitId, {
      items: [line(drugs.FLUOX), line(drugs.SELEG)],
    }).expect(409);
    // Both apply; the allergy is the one reported, because it is about THIS patient.
    expect((res.body as { code?: string }).code).toBe('allergy_conflict');

    await prisma.allergy.deleteMany({ where: { patientId: visit.patientId } });
  });

  it('needs both answers when both apply', async () => {
    const visitId = await stageVisit();
    const visit = await prisma.visit.findFirstOrThrow({ where: { id: visitId } });
    await prisma.allergy.create({
      data: {
        patientId: visit.patientId,
        substance: 'Fluoxetine',
        severity: 'moderate',
        notedBy: doctorId,
      },
    });

    // Allergy answered, interaction not: still refused, now on the interaction.
    const half = await putRx(visitId, {
      items: [
        line(drugs.FLUOX, {
          allergyOverrideReason: 'Previous reaction was gastric, not allergic.',
        }),
        line(drugs.SELEG),
      ],
    }).expect(409);
    expect((half.body as { code?: string }).code).toBe('interaction_warning');

    // Both answered: through.
    await putRx(visitId, {
      items: [
        line(drugs.FLUOX, {
          allergyOverrideReason: 'Previous reaction was gastric, not allergic.',
        }),
        line(drugs.SELEG),
      ],
      interactionAckReason: 'Specialist advice on file; monitoring daily.',
    }).expect(200);

    await prisma.allergy.deleteMany({ where: { patientId: visit.patientId } });
  });

  it('re-saving an acknowledged sheet does not ask again', async () => {
    const visitId = await stageVisit();
    const first = await putRx(visitId, {
      items: [line(drugs.FLUOX), line(drugs.SELEG)],
      interactionAckReason: 'Deliberate, under supervision.',
    }).expect(200);
    const items = (first.body as PrescriptionResponse).prescription!.items;

    // The reason travels back down with the sheet, so F2 twice does not re-prompt.
    await putRx(visitId, {
      items: [
        line(drugs.FLUOX, { id: items[0].id, frequency: 'BID' }),
        line(drugs.SELEG, { id: items[1].id }),
      ],
      interactionAckReason: 'Deliberate, under supervision.',
    }).expect(200);
  });

  it('asks again if the acknowledgement is dropped on a later save', async () => {
    const visitId = await stageVisit();
    await putRx(visitId, {
      items: [line(drugs.FLUOX), line(drugs.SELEG)],
      interactionAckReason: 'Deliberate, under supervision.',
    }).expect(200);

    // Sending the same drugs with no reason is a save that has not been justified, and
    // the server does not remember consent it was not given this time.
    await putRx(visitId, { items: [line(drugs.FLUOX), line(drugs.SELEG)] }).expect(409);
  });

  it('stops asking once the offending drug is removed', async () => {
    const visitId = await stageVisit();
    await putRx(visitId, { items: [line(drugs.FLUOX), line(drugs.SELEG)] }).expect(409);
    await putRx(visitId, { items: [line(drugs.FLUOX), line(drugs.PARA)] }).expect(200);
  });
});
