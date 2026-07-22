import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  ClinicalNote,
  ClinicalNoteListResponse,
  LoginResponse,
  RiskAssessmentContent,
} from '@redmars/shared';
import { emptyRiskAssessment, highestRiskLevel } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 4.13 — the psychiatric note.
 *
 * The done-when is "Dr. H can write a full psychiatric assessment", and that is one test.
 * The rest of this file is about the two things that make a note system dangerous rather
 * than merely incomplete: a blank note that claims an assessment happened, and a risk
 * rating with nothing behind it.
 *
 * `clinical_note.read` is the narrowest permission in the matrix — denied even to admin —
 * so the R2 test here asserts the OPPOSITE of every other clinical spec in this suite.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_note_';
const PASSWORD = 'e2e-test-password-not-a-secret';

/** The R1 read row is fire-and-forget, so a test that asserts it has to wait for it. */
async function eventually<T>(read: () => Promise<T[]>, tries = 40): Promise<T[]> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const rows = await read();
    if (rows.length > 0) return rows;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return read();
}

/** A complete first-visit workup, as Dr. H would write one. */
const FULL_ASSESSMENT = {
  historyOfPresentingIllness:
    'Six months of low mood, early morning waking, loss of appetite with 7kg weight loss.',
  pastPsychiatricHistory: 'One previous episode in 1401, treated with fluoxetine, full recovery.',
  pastMedicalHistory: 'Nil of note. No head injury, no seizures.',
  medicationHistory: 'Fluoxetine 20mg for nine months in 1401, stopped by the patient.',
  substanceUse: 'Naswar occasionally. No alcohol, no opiates.',
  familyHistory: 'Mother had a depressive illness. No family history of psychosis or suicide.',
  personalHistory:
    'Born in Kabul, schooled to grade 12, married, three children, works as a tailor.',
  premorbidPersonality: 'Sociable, conscientious, described by family as the one who copes.',
  physicalExamination: 'Thin. No tremor, no rigidity. Chest and abdomen unremarkable.',
  formulation:
    'Moderate depressive episode without psychotic features, on a background of one previous ' +
    'episode and a family history. Precipitated by loss of work. Protective: engaged family.',
  plan: 'Start an SSRI, review in two weeks, family psychoeducation. Thyroid function to exclude.',
};

describe('Clinical note (e2e)', () => {
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
        fullName: `E2E Note ${suffix}`,
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
        firstName: `Zarmina${counter}`,
        gender: 'female',
        estimatedAgeYears: 34,
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

  const listNotes = (visitId: string, as = 'doctor') =>
    request(server).get(`/visits/${visitId}/notes`).set('Authorization', `Bearer ${tokens[as]}`);

  const putNote = (visitId: string, body: unknown, as = 'doctor') =>
    request(server)
      .put(`/visits/${visitId}/notes`)
      .set('Authorization', `Bearer ${tokens[as]}`)
      .send(body);

  const risk = (changes: Partial<RiskAssessmentContent>): RiskAssessmentContent => ({
    ...emptyRiskAssessment(),
    ...changes,
  });

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.clinicalNote.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visitStatusHistory.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visit.deleteMany({ where: facilityFilter });
    await prisma.patient.deleteMany({ where: facilityFilter });
    await prisma.practitioner.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.department.deleteMany({ where: { code: { startsWith: PREFIX } } });
    // Again, and deliberately — the R1 read row is fire-and-forget and one can land after
    // the sweep above, failing the facility delete on a foreign key inside afterAll.
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
      await prisma.facility.create({ data: { code: `${PREFIX}fac`, name: 'E2E Note Facility' } })
    ).id;
    otherFacilityId = (
      await prisma.facility.create({ data: { code: `${PREFIX}other`, name: 'E2E Note Other' } })
    ).id;

    doctorId = await seedActor('doctor', 'doctor');
    const secondDoctorId = await seedActor('doctor2', 'doctor');
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
    await prisma.practitioner.create({
      data: {
        facilityId,
        code: `${PREFIX}DR2`,
        firstName: 'Nadia',
        lastName: 'Amini',
        userId: secondDoctorId,
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  // --- The done-when ----------------------------------------------------------------

  it('the done-when: Dr. H writes a full psychiatric assessment and reads it back whole', async () => {
    const visitId = await stageVisit();
    const saved = await putNote(visitId, {
      noteType: 'psych_assessment',
      content: FULL_ASSESSMENT,
    }).expect(200);

    const note = saved.body as ClinicalNote;
    expect(note.noteType).toBe('psych_assessment');
    expect(note.practitionerName).toBe('Hafizullah Sherzai');
    expect(note.content).toEqual(FULL_ASSESSMENT);

    // And it survives the round trip through the Json column with every field intact —
    // which is the thing a jsonb note can quietly get wrong.
    const listed = await listNotes(visitId).expect(200);
    const { notes } = listed.body as ClinicalNoteListResponse;
    expect(notes).toHaveLength(1);
    expect(notes[0].content).toEqual(FULL_ASSESSMENT);
  });

  it('takes a half-written assessment — an interrupted consultation is the normal case', async () => {
    const visitId = await stageVisit();
    const saved = await putNote(visitId, {
      noteType: 'psych_assessment',
      content: { historyOfPresentingIllness: 'Three weeks of insomnia.' },
    }).expect(200);

    const content = (saved.body as ClinicalNote).content as Record<string, unknown>;
    expect(content.historyOfPresentingIllness).toBe('Three weeks of insomnia.');
    // Skipped fields come back as null, not undefined — the shape is the same either way.
    expect(content.formulation).toBeNull();
  });

  it('refuses a note with nothing in it — saving one files a claim that never happened', async () => {
    const visitId = await stageVisit();
    await putNote(visitId, { noteType: 'psych_assessment', content: {} }).expect(400);
    await putNote(visitId, {
      noteType: 'psych_assessment',
      content: { formulation: '   ' },
    }).expect(400);
  });

  // --- Replace, not append ------------------------------------------------------------

  it('replaces the note of that type rather than filing a second one', async () => {
    const visitId = await stageVisit();
    const first = await putNote(visitId, {
      noteType: 'psych_assessment',
      content: { formulation: 'First pass.' },
    }).expect(200);
    const second = await putNote(visitId, {
      noteType: 'psych_assessment',
      content: { formulation: 'Revised after speaking to the brother.' },
    }).expect(200);

    expect((second.body as ClinicalNote).id).toBe((first.body as ClinicalNote).id);

    const listed = await listNotes(visitId).expect(200);
    expect((listed.body as ClinicalNoteListResponse).notes).toHaveLength(1);
  });

  it('keeps the overwritten version in the audit trail', async () => {
    const visitId = await stageVisit();
    const first = await putNote(visitId, {
      noteType: 'progress',
      content: { progress: 'Sleeping better.' },
    }).expect(200);
    await putNote(visitId, {
      noteType: 'progress',
      content: { progress: 'Sleeping better, appetite returning.' },
    }).expect(200);

    const rows = await prisma.auditLog.findMany({
      where: {
        entity: 'ClinicalNote',
        entityId: (first.body as ClinicalNote).id,
        action: AuditAction.update,
      },
    });
    expect(rows).toHaveLength(1);
    // The whole reason this is an update() and not an upsert(): upsert is not audited.
    expect(JSON.stringify(rows[0].before)).toContain('Sleeping better.');
  });

  it('does not reassign the author when a second doctor edits it', async () => {
    const visitId = await stageVisit();
    await putNote(visitId, { noteType: 'mse', content: { mood: 'Low.' } }).expect(200);

    const edited = await putNote(
      visitId,
      { noteType: 'mse', content: { mood: 'Low, reactive on discussing her children.' } },
      'doctor2',
    ).expect(200);

    // Tidying a colleague's wording does not make you the person who examined the patient.
    // Who changed what is the audit table's question.
    expect((edited.body as ClinicalNote).practitionerName).toBe('Hafizullah Sherzai');
  });

  it('holds all four note types on one visit, side by side', async () => {
    const visitId = await stageVisit();
    await putNote(visitId, { noteType: 'psych_assessment', content: FULL_ASSESSMENT }).expect(200);
    await putNote(visitId, { noteType: 'mse', content: { affect: 'Blunted.' } }).expect(200);
    await putNote(visitId, {
      noteType: 'risk_assessment',
      content: risk({ selfHarm: { level: 'none', detail: 'No ideation, no plan, no intent.' } }),
    }).expect(200);
    await putNote(visitId, {
      noteType: 'progress',
      content: { plan: 'Review in 2 weeks.' },
    }).expect(200);

    const listed = await listNotes(visitId).expect(200);
    const types = (listed.body as ClinicalNoteListResponse).notes.map((note) => note.noteType);
    expect(types.sort()).toEqual(['mse', 'progress', 'psych_assessment', 'risk_assessment']);
  });

  // --- The mental state examination ------------------------------------------------

  it('keeps all ten MSE domains as written — free text, not a dropdown', async () => {
    const visitId = await stageVisit();
    const mse = {
      appearanceAndBehaviour: 'Unkempt, poor eye contact, cooperative.',
      speech: 'Slow, monosyllabic.',
      mood: 'Subjectively "empty". Objectively low.',
      affect: 'Reactive but constricted, congruent with stated mood.',
      thoughtForm: 'Linear and goal-directed.',
      thoughtContent: 'Hopelessness. Passive death wish, no active suicidal ideation.',
      perception: 'No hallucinations elicited.',
      cognition: 'Alert and oriented to time, place and person.',
      insight: 'Partial — accepts she is unwell, unsure treatment will help.',
      judgement: 'Intact.',
    };
    const saved = await putNote(visitId, { noteType: 'mse', content: mse }).expect(200);
    expect((saved.body as ClinicalNote).content).toEqual(mse);
  });

  // --- Risk assessment: the two rules that make this a safety feature ----------------

  it('refuses a moderate or high rating with nothing behind it', async () => {
    const visitId = await stageVisit();
    const res = await putNote(visitId, {
      noteType: 'risk_assessment',
      content: risk({
        selfHarm: { level: 'high', detail: null },
        plan: 'Admit today.',
      }),
    }).expect(400);

    const errors = (res.body as { errors: { path: string; message: string }[] }).errors;
    expect(errors.some((issue) => issue.path === 'content.selfHarm.detail')).toBe(true);
  });

  it('REFUSES HIGH RISK WITH NO PLAN — the note that gets read out at the inquiry', async () => {
    const visitId = await stageVisit();
    const res = await putNote(visitId, {
      noteType: 'risk_assessment',
      content: risk({
        selfHarm: {
          level: 'high',
          detail: 'Active ideation with a plan. Has kept her husband’s tablets.',
        },
      }),
    }).expect(400);

    const errors = (res.body as { errors: { path: string; message: string }[] }).errors;
    expect(errors.some((issue) => issue.path === 'content.plan')).toBe(true);
  });

  it('accepts the same assessment the moment there is a plan', async () => {
    const visitId = await stageVisit();
    const content = risk({
      selfHarm: {
        level: 'high',
        detail: 'Active ideation with a plan. Has kept her husband’s tablets.',
      },
      vulnerability: { level: 'moderate', detail: 'Lives alone since her brother left Kabul.' },
      protectiveFactors: 'Wants treatment. Sister nearby and willing to stay.',
      plan: 'Admit today. Tablets removed by the sister. Nursing observations hourly.',
    });
    const saved = await putNote(visitId, { noteType: 'risk_assessment', content }).expect(200);

    expect((saved.body as ClinicalNote).content).toEqual(content);
  });

  it('leaves LOW risk alone — a low rating with no separate plan is honest', async () => {
    const visitId = await stageVisit();
    await putNote(visitId, {
      noteType: 'risk_assessment',
      content: risk({ selfHarm: { level: 'low', detail: 'Fleeting thoughts, no intent.' } }),
    }).expect(200);
  });

  it('refuses an untouched risk form — nil risk has to be written, not defaulted into', async () => {
    const visitId = await stageVisit();
    await putNote(visitId, { noteType: 'risk_assessment', content: emptyRiskAssessment() }).expect(
      400,
    );
  });

  it('accepts nil risk once it is actually recorded', async () => {
    const visitId = await stageVisit();
    await putNote(visitId, {
      noteType: 'risk_assessment',
      content: risk({
        selfHarm: { level: 'none', detail: 'No ideation, no plan, no intent, no history.' },
      }),
    }).expect(200);
  });

  it('refuses a risk domain that is missing entirely — a PUT is the whole document', async () => {
    const visitId = await stageVisit();
    const partial = emptyRiskAssessment() as Partial<RiskAssessmentContent>;
    delete partial.harmToOthers;
    // Answering a missing domain with a silent 'none' would write "no risk of harm to
    // others" onto the record on the strength of a client bug.
    await putNote(visitId, { noteType: 'risk_assessment', content: partial }).expect(400);
  });

  it('refuses a level that is not one of the four', async () => {
    const visitId = await stageVisit();
    await putNote(visitId, {
      noteType: 'risk_assessment',
      content: risk({ selfHarm: { level: 'severe', detail: 'x' } as never }),
    }).expect(400);
  });

  it('derives the highest risk rather than storing it', () => {
    // Shared, so the badge on the screen and anything that later filters on risk cannot
    // compute it differently. `packages/shared` has no runner of its own, so it is tested here.
    expect(highestRiskLevel(emptyRiskAssessment())).toBe('none');
    expect(
      highestRiskLevel(
        risk({
          selfHarm: { level: 'low', detail: null },
          selfNeglect: { level: 'moderate', detail: null },
          vulnerability: { level: 'low', detail: null },
        }),
      ),
    ).toBe('moderate');
  });

  // --- Types --------------------------------------------------------------------------

  it('refuses a note type this phase does not build', async () => {
    const visitId = await stageVisit();
    await putNote(visitId, { noteType: 'soap', content: { plan: 'x' } }).expect(400);
  });

  it('refuses one type’s content under another type’s name', async () => {
    const visitId = await stageVisit();
    // The whole point of the discriminated union: a formulation is not an MSE domain, and
    // the shapes cannot be crossed even though both are bags of strings in a Json column.
    await putNote(visitId, {
      noteType: 'mse',
      content: { formulation: 'Moderate depressive episode.' },
    }).expect(400);
  });

  // --- Once the visit is closed ---------------------------------------------------------

  it('refuses a write once the visit is closed, and still reads', async () => {
    const visitId = await stageVisit();
    await putNote(visitId, {
      noteType: 'progress',
      content: { progress: 'Written while open.' },
    }).expect(200);

    await prisma.visit.update({ where: { id: visitId }, data: { status: 'completed' } });

    const res = await putNote(visitId, {
      noteType: 'progress',
      content: { progress: 'Added after the fact.' },
    }).expect(400);
    expect((res.body as { code?: string }).code).toBe('visit_closed');

    // Reviewing what happened is not writing to it.
    await listNotes(visitId).expect(200);
  });

  // --- Who ------------------------------------------------------------------------------

  it('THE ADMIN CANNOT READ IT — the one clinical read R2 does not grant', async () => {
    const visitId = await stageVisit();
    await putNote(visitId, { noteType: 'mse', content: { mood: 'Low.' } }).expect(200);

    // Every other clinical spec in this suite asserts the admin CAN read. Not this one.
    // Farhat is a psychiatric hospital in a small community.
    await listNotes(visitId, 'admin').expect(403);
    await putNote(
      visitId,
      { noteType: 'mse', content: { mood: 'Admin wrote this.' } },
      'admin',
    ).expect(403);
  });

  it('the nurse holds vitals, not the mental state examination', async () => {
    const visitId = await stageVisit();
    await listNotes(visitId, 'nurse').expect(403);
    await putNote(
      visitId,
      { noteType: 'mse', content: { mood: 'Nurse wrote this.' } },
      'nurse',
    ).expect(403);
  });

  it('the receptionist sees nothing clinical', async () => {
    const visitId = await stageVisit();
    await listNotes(visitId, 'receptionist').expect(403);
  });

  it('rejects anonymous requests', async () => {
    const visitId = await stageVisit();
    await request(server).get(`/visits/${visitId}/notes`).expect(401);
  });

  // --- Audit and boundaries ---------------------------------------------------------------

  it('audits the read against the visit', async () => {
    const visitId = await stageVisit();
    await listNotes(visitId).expect(200);

    const rows = await eventually(() =>
      prisma.auditLog.findMany({
        where: { action: AuditAction.read, entity: 'ClinicalNote', entityId: visitId },
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(doctorId);
  });

  it("404s on another facility's visit", async () => {
    const visitId = await stageVisit({ facility: otherFacilityId });
    await listNotes(visitId).expect(404);
    await putNote(visitId, { noteType: 'mse', content: { mood: 'Low.' } }).expect(404);
  });

  it('404s on a visit that does not exist, 400s on an id that is not a uuid', async () => {
    await listNotes(randomUUID()).expect(404);
    await listNotes('not-a-uuid').expect(400);
  });
});
