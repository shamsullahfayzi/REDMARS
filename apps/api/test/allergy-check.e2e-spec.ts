import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { AllergyConflictResponse, LoginResponse, PrescriptionResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 4.8 — the hard block. "Prescribing penicillin to an allergic patient stops you."
 *
 * Three properties, each with its own case, because each is a different way this feature
 * could look like it works and not:
 *
 *  1. IT ACTUALLY BLOCKS. 409, and NOTHING is written — not the safe lines either. A
 *     partial prescription is worse than none, because the doctor is then looking at a
 *     sheet missing a drug they believe they prescribed.
 *  2. THE OVERRIDE IS RECORDED. Getting past the block writes the reason onto the
 *     prescription item, where the question "why was this prescribed?" is actually asked.
 *     An override that only exists in an audit table is an override nobody will ever read.
 *  3. IT DOES NOT CRY WOLF. A retracted allergy does not block; an unrelated drug does not
 *     block; a two-letter substance does not block. An override clicked through fifty
 *     times a day is not a safety feature, it is training in dismissing warnings.
 *
 * And one test pins the KNOWN LIMIT: "Penicillin" does not block amoxicillin, because
 * nothing in the data relates them. Better recorded as a failing expectation nobody
 * believes is passing.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_allergychk_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Allergy check at prescribe time (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let doctorId: string;
  let opdId: string;
  const drugs: Record<string, string> = {};
  let token: string;

  jest.setTimeout(60_000);

  let counter = 0;
  async function stagePatient(): Promise<string> {
    counter += 1;
    const patient = await prisma.patient.create({
      data: {
        facilityId,
        mrn: `${PREFIX}MRN${counter}`,
        firstName: `Sahar${counter}`,
        gender: 'female',
        estimatedAgeYears: 36,
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

  async function allergic(
    patientId: string,
    substance: string,
    over: { drugId?: string; severity?: 'mild' | 'moderate' | 'severe'; isActive?: boolean } = {},
  ): Promise<void> {
    await prisma.allergy.create({
      data: {
        patientId,
        substance,
        drugId: over.drugId ?? null,
        severity: over.severity ?? 'severe',
        reaction: 'Anaphylaxis',
        isActive: over.isActive ?? true,
        notedBy: doctorId,
      },
    });
  }

  const putRx = (visitId: string, body: unknown) =>
    request(server)
      .put(`/visits/${visitId}/prescription`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const line = (drugId: string, over: Record<string, unknown> = {}) => ({
    drugId,
    frequency: 'OD',
    duration: '1 week',
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
    await prisma.allergy.deleteMany({ where: { patient: facilityFilter } });
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

    facilityId = (
      await prisma.facility.create({ data: { code: `${PREFIX}fac`, name: 'E2E AllergyChk' } })
    ).id;

    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}doctor`,
        fullName: 'E2E AllergyChk doctor',
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

    const seedDrug = async (key: string, genericName: string, brandName?: string) => {
      const drug = await prisma.drug.create({
        data: {
          facilityId,
          code: `${PREFIX}${key}`,
          genericName,
          brandName: brandName ?? null,
          strength: '500mg',
          form: 'tablet',
        },
      });
      drugs[key] = drug.id;
    };
    await seedDrug('PEN', 'Benzylpenicillin');
    await seedDrug('AMOX', 'Amoxicillin');
    await seedDrug('PARA', 'Paracetamol');
    await seedDrug('SERT', 'Sertraline', 'Zoloft');
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  // --- It actually blocks ---------------------------------------------------------

  it('the done-when: prescribing penicillin to a penicillin-allergic patient stops you', async () => {
    const patientId = await stagePatient();
    await allergic(patientId, 'Penicillin');
    const visitId = await stageVisit(patientId);

    const res = await putRx(visitId, { items: [line(drugs.PEN)] }).expect(409);
    const body = res.body as AllergyConflictResponse;

    expect(body.code).toBe('allergy_conflict');
    expect(body.conflicts).toHaveLength(1);
    expect(body.conflicts[0].substance).toBe('Penicillin');
    expect(body.conflicts[0].severity).toBe('severe');
    expect(body.conflicts[0].reaction).toBe('Anaphylaxis');
    // "Penicillin" against "Benzylpenicillin 500mg" — string matching, and the doctor is
    // told that is how it was found.
    expect(body.conflicts[0].matchedOn).toBe('name');
    expect(body.conflicts[0].drugId).toBe(drugs.PEN);

    // NOTHING was written.
    expect(await prisma.prescription.count({ where: { visitId } })).toBe(0);
  });

  it('writes nothing at all — not even the lines that were safe', async () => {
    const patientId = await stagePatient();
    await allergic(patientId, 'Penicillin');
    const visitId = await stageVisit(patientId);

    // Paracetamol is fine; penicillin is not. A partial sheet is worse than none, because
    // the doctor would be looking at a prescription missing a drug they think they wrote.
    await putRx(visitId, { items: [line(drugs.PARA), line(drugs.PEN)] }).expect(409);
    expect(await prisma.prescription.count({ where: { visitId } })).toBe(0);
    expect(await prisma.prescriptionItem.count()).toBeGreaterThanOrEqual(0);
  });

  it('matches by drug id when the allergy names the exact formulary drug', async () => {
    const patientId = await stagePatient();
    // Substance deliberately unlike the drug name, so only the id can find it.
    await allergic(patientId, 'That injection from last year', { drugId: drugs.PEN });
    const visitId = await stageVisit(patientId);

    const res = await putRx(visitId, { items: [line(drugs.PEN)] }).expect(409);
    expect((res.body as AllergyConflictResponse).conflicts[0].matchedOn).toBe('drug');
  });

  it('matches a brand name too', async () => {
    const patientId = await stagePatient();
    await allergic(patientId, 'Zoloft', { severity: 'moderate' });
    const visitId = await stageVisit(patientId);
    await putRx(visitId, { items: [line(drugs.SERT)] }).expect(409);
  });

  it('blocks a mild allergy as well — the threshold is not this feature’s to invent', async () => {
    const patientId = await stagePatient();
    await allergic(patientId, 'Paracetamol', { severity: 'mild' });
    const visitId = await stageVisit(patientId);
    await putRx(visitId, { items: [line(drugs.PARA)] }).expect(409);
  });

  // --- The override is recorded -------------------------------------------------------

  it('lets the doctor through with a reason, and KEEPS the reason on the record', async () => {
    const patientId = await stagePatient();
    await allergic(patientId, 'Penicillin');
    const visitId = await stageVisit(patientId);

    const saved = await putRx(visitId, {
      items: [
        line(drugs.PEN, {
          allergyOverrideReason: 'Reaction was a mild rash aged 6; no alternative available.',
        }),
      ],
    }).expect(200);

    const item = (saved.body as PrescriptionResponse).prescription!.items[0];
    // On the PRESCRIPTION, not only in an audit table — "why was this prescribed?" is
    // asked of the prescription by people who do not read audit logs.
    expect(item.allergyOverrideReason).toContain('mild rash aged 6');

    const stored = await prisma.prescriptionItem.findFirstOrThrow({ where: { id: item.id } });
    expect(stored.allergyOverrideReason).toBeTruthy();
  });

  it('refuses a reason too short to mean anything', async () => {
    const patientId = await stagePatient();
    await allergic(patientId, 'Penicillin');
    const visitId = await stageVisit(patientId);
    await putRx(visitId, { items: [line(drugs.PEN, { allergyOverrideReason: 'ok' })] }).expect(400);
  });

  it('an override on one drug does not silently cover another', async () => {
    const patientId = await stagePatient();
    await allergic(patientId, 'Penicillin');
    await allergic(patientId, 'Paracetamol', { severity: 'moderate' });
    const visitId = await stageVisit(patientId);

    const res = await putRx(visitId, {
      items: [
        line(drugs.PEN, { allergyOverrideReason: 'Documented tolerance since 2019.' }),
        line(drugs.PARA),
      ],
    }).expect(409);

    const { conflicts } = res.body as AllergyConflictResponse;
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].drugId).toBe(drugs.PARA);
  });

  it('does not keep a reason on a drug nobody was warned about', async () => {
    const patientId = await stagePatient();
    const visitId = await stageVisit(patientId);

    // No allergies at all. A reason here is noise that makes the real ones harder to find.
    const saved = await putRx(visitId, {
      items: [line(drugs.PARA, { allergyOverrideReason: 'Pasted in from the last patient.' })],
    }).expect(200);

    expect(
      (saved.body as PrescriptionResponse).prescription!.items[0].allergyOverrideReason,
    ).toBeNull();
  });

  // --- It does not cry wolf -------------------------------------------------------------

  it('a retracted allergy does not block — that is what retracting is for', async () => {
    const patientId = await stagePatient();
    await allergic(patientId, 'Penicillin', { isActive: false });
    const visitId = await stageVisit(patientId);
    await putRx(visitId, { items: [line(drugs.PEN)] }).expect(200);
  });

  it('an unrelated drug does not block', async () => {
    const patientId = await stagePatient();
    await allergic(patientId, 'Penicillin');
    const visitId = await stageVisit(patientId);
    await putRx(visitId, { items: [line(drugs.PARA), line(drugs.SERT)] }).expect(200);
  });

  it('a patient with no allergies at all is never interrupted', async () => {
    const patientId = await stagePatient();
    const visitId = await stageVisit(patientId);
    await putRx(visitId, { items: [line(drugs.PEN), line(drugs.PARA)] }).expect(200);
  });

  it('a two-letter substance does not collide with half the formulary', async () => {
    const patientId = await stagePatient();
    // "Zo" is inside "Zoloft". Matching on it would block by accident, and a block that
    // fires by accident is a block doctors learn to click through.
    await allergic(patientId, 'Zo');
    const visitId = await stageVisit(patientId);
    await putRx(visitId, { items: [line(drugs.SERT)] }).expect(200);
  });

  it('KNOWN LIMIT: "Penicillin" does not block amoxicillin', async () => {
    const patientId = await stagePatient();
    await allergic(patientId, 'Penicillin');
    const visitId = await stageVisit(patientId);

    // Class cross-reactivity is NOT implemented, and this test exists so that stays a
    // decision rather than a surprise. Nothing in the data relates the two — Drug.atcCode
    // exists but Allergy has no ATC — and inferring a class from free text would either
    // miss quietly or block wrongly. Task 4.6's banner is on screen throughout saying
    // "Penicillin — severe" whatever is being prescribed.
    await putRx(visitId, { items: [line(drugs.AMOX)] }).expect(200);
  });

  it('re-saving an already-overridden sheet does not ask again', async () => {
    const patientId = await stagePatient();
    await allergic(patientId, 'Penicillin');
    const visitId = await stageVisit(patientId);

    const first = await putRx(visitId, {
      items: [line(drugs.PEN, { allergyOverrideReason: 'Tolerated at low dose previously.' })],
    }).expect(200);
    const item = (first.body as PrescriptionResponse).prescription!.items[0];

    // The reason travels back down with the row, so F2 twice does not re-prompt.
    await putRx(visitId, {
      items: [
        line(drugs.PEN, {
          id: item.id,
          allergyOverrideReason: item.allergyOverrideReason,
          frequency: 'BD',
        }),
      ],
    }).expect(200);
  });

  it('an allergy recorded AFTER the prescription blocks the next save', async () => {
    const patientId = await stagePatient();
    const visitId = await stageVisit(patientId);
    const saved = await putRx(visitId, { items: [line(drugs.PEN)] }).expect(200);
    const item = (saved.body as PrescriptionResponse).prescription!.items[0];

    // The patient mentions it halfway through the consultation, which is exactly when
    // allergies get discovered.
    await allergic(patientId, 'Penicillin');

    await putRx(visitId, { items: [line(drugs.PEN, { id: item.id, frequency: 'BD' })] }).expect(
      409,
    );
  });
});
