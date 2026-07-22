import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse, Template, TemplateListResponse, VisitSummary } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 4.4 — the chief complaint, and the templates that make writing one fast.
 *
 * The done-when is "oliguria, frequency, nocturia in 2 seconds", and that sentence is
 * THREE templates rather than one: a complaint template holds a single phrase and the
 * doctor stacks them. A template per whole-sentence combination needs a template per
 * combination, which is how a template list becomes unusable by week three.
 *
 * Ownership is one nullable column. `Template.practitionerId` null means shared across the
 * hospital; set means one practitioner's own. A doctor sees the shared list plus theirs and
 * never a colleague's, and only an admin may add to the shared one.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_complaint_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Chief complaint and templates (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let otherFacilityId: string;
  let doctorId: string;
  let otherDoctorUserId: string;
  let opdId: string;
  let drSelfId: string;
  let drOtherId: string;

  const tokens: Record<string, string> = {};

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Complaint ${suffix}`,
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
    options: { status?: 'arrived' | 'in_progress' | 'completed'; facility?: string } = {},
  ): Promise<string> {
    counter += 1;
    const inFacility = options.facility ?? facilityId;
    const patient = await prisma.patient.create({
      data: {
        facilityId: inFacility,
        mrn: `${PREFIX}MRN${counter}`,
        firstName: `Sohrab${counter}`,
        gender: 'male',
        estimatedAgeYears: 55,
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
        // What the desk managed to type at a busy window.
        chiefComplaint: 'not feeling well',
        statusHistory: { create: { status: 'arrived', changedBy: doctorId } },
      },
    });
    return visit.id;
  }

  const setComplaint = (visitId: string, body: unknown, as = 'doctor') =>
    request(server)
      .patch(`/visits/${visitId}/complaint`)
      .set('Authorization', `Bearer ${tokens[as]}`)
      .send(body);

  const listTemplates = (type: string, as = 'doctor') =>
    request(server).get(`/templates?type=${type}`).set('Authorization', `Bearer ${tokens[as]}`);

  const createTemplate = (body: unknown, as = 'doctor') =>
    request(server).post('/templates').set('Authorization', `Bearer ${tokens[as]}`).send(body);

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.template.deleteMany({ where: facilityFilter });
    await prisma.visitStatusHistory.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visit.deleteMany({ where: facilityFilter });
    await prisma.patient.deleteMany({ where: facilityFilter });
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
      await prisma.facility.create({
        data: { code: `${PREFIX}fac`, name: 'E2E Complaint Facility' },
      })
    ).id;
    otherFacilityId = (
      await prisma.facility.create({
        data: { code: `${PREFIX}other`, name: 'E2E Complaint Other' },
      })
    ).id;

    doctorId = await seedActor('doctor', 'doctor');
    otherDoctorUserId = await seedActor('doctor2', 'doctor');
    await seedActor('admin', 'admin');
    await seedActor('nurse', 'nurse');
    await seedActor('receptionist', 'receptionist');

    opdId = (
      await prisma.department.create({
        data: { facilityId, code: `${PREFIX}OPD`, name: 'E2E OPD', type: 'opd' },
      })
    ).id;

    // Both doctors have a practitioner record, which is what gives them a private list.
    drSelfId = (
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
    drOtherId = (
      await prisma.practitioner.create({
        data: {
          facilityId,
          code: `${PREFIX}DR2`,
          firstName: 'Nasima',
          lastName: 'Rahimi',
          userId: otherDoctorUserId,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  // --- The done-when ----------------------------------------------------------

  it('the done-when: three templates make "oliguria, frequency, nocturia" in two seconds', async () => {
    for (const text of ['oliguria', 'frequency', 'nocturia']) {
      await createTemplate({
        type: 'complaint',
        name: text,
        content: { text },
      }).expect(201);
    }

    const listed = await listTemplates('complaint').expect(200);
    const names = (listed.body as TemplateListResponse).templates.map((row) => row.name);
    expect(names).toEqual(expect.arrayContaining(['oliguria', 'frequency', 'nocturia']));

    // Stacked into one complaint, which is the whole point of one phrase per template.
    const visitId = await stageVisit();
    const res = await setComplaint(visitId, {
      chiefComplaint: 'oliguria, frequency, nocturia',
    }).expect(200);
    expect((res.body as VisitSummary).chiefComplaint).toBe('oliguria, frequency, nocturia');
  });

  it("replaces the desk's version rather than appending to it", async () => {
    const visitId = await stageVisit();
    const res = await setComplaint(visitId, { chiefComplaint: 'low mood, early waking' }).expect(
      200,
    );
    expect((res.body as VisitSummary).chiefComplaint).toBe('low mood, early waking');
  });

  it('lets the doctor clear a complaint the desk guessed at', async () => {
    const visitId = await stageVisit();
    // Empty is more honest than "not feeling well" sitting there as though someone
    // meant it.
    const res = await setComplaint(visitId, { chiefComplaint: '' }).expect(200);
    expect((res.body as VisitSummary).chiefComplaint).toBeNull();
  });

  it('keeps the old wording in the audit trail — who changed it and from what', async () => {
    const visitId = await stageVisit();
    await setComplaint(visitId, { chiefComplaint: 'dysuria' }).expect(200);

    const row = await prisma.auditLog.findFirst({
      where: { entity: 'Visit', entityId: visitId, action: 'update' },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).not.toBeNull();
    expect(row?.userId).toBe(doctorId);
    expect(JSON.stringify(row?.before)).toContain('not feeling well');
    expect(JSON.stringify(row?.after)).toContain('dysuria');
  });

  it('refuses to write a complaint against a closed visit', async () => {
    const visitId = await stageVisit({ status: 'completed' });
    const res = await setComplaint(visitId, { chiefComplaint: 'headache' }).expect(400);
    expect((res.body as { code?: string }).code).toBe('visit_closed');
  });

  it('refuses one longer than the column', async () => {
    const visitId = await stageVisit();
    await setComplaint(visitId, { chiefComplaint: 'x'.repeat(501) }).expect(400);
  });

  // --- Whose templates are whose ------------------------------------------------

  it("shows the shared list and your own — never a colleague's private ones", async () => {
    await prisma.template.create({
      data: {
        facilityId,
        practitionerId: null,
        type: 'complaint',
        name: `${PREFIX}shared`,
        content: { text: 'chest pain' },
      },
    });
    await prisma.template.create({
      data: {
        facilityId,
        practitionerId: drSelfId,
        type: 'complaint',
        name: `${PREFIX}mine`,
        content: { text: 'panic attacks' },
      },
    });
    await prisma.template.create({
      data: {
        facilityId,
        practitionerId: drOtherId,
        type: 'complaint',
        name: `${PREFIX}theirs`,
        content: { text: 'insomnia' },
      },
    });

    const listed = await listTemplates('complaint').expect(200);
    const names = (listed.body as TemplateListResponse).templates.map((row) => row.name);
    expect(names).toContain(`${PREFIX}shared`);
    expect(names).toContain(`${PREFIX}mine`);
    expect(names).not.toContain(`${PREFIX}theirs`);
  });

  it('says which are the hospital’s and which are yours', async () => {
    const listed = await listTemplates('complaint').expect(200);
    const templates = (listed.body as TemplateListResponse).templates;

    const shared = templates.find((row) => row.name === `${PREFIX}shared`);
    expect(shared?.isShared).toBe(true);
    expect(shared?.isMine).toBe(false);

    const mine = templates.find((row) => row.name === `${PREFIX}mine`);
    expect(mine?.isShared).toBe(false);
    expect(mine?.isMine).toBe(true);
  });

  it("does not leak another facility's templates", async () => {
    await prisma.template.create({
      data: {
        facilityId: otherFacilityId,
        practitionerId: null,
        type: 'complaint',
        name: `${PREFIX}elsewhere`,
        content: { text: 'somewhere else entirely' },
      },
    });

    const listed = await listTemplates('complaint').expect(200);
    const names = (listed.body as TemplateListResponse).templates.map((row) => row.name);
    expect(names).not.toContain(`${PREFIX}elsewhere`);
  });

  it('files a doctor’s new template as their own, not as everyone’s', async () => {
    const created = await createTemplate({
      type: 'complaint',
      name: `${PREFIX}private`,
      content: { text: 'auditory hallucinations' },
    }).expect(201);

    const template = created.body as Template;
    expect(template.isShared).toBe(false);
    expect(template.isMine).toBe(true);

    // And the colleague cannot see it.
    const listed = await listTemplates('complaint', 'doctor2').expect(200);
    const names = (listed.body as TemplateListResponse).templates.map((row) => row.name);
    expect(names).not.toContain(`${PREFIX}private`);
  });

  it('refuses a doctor a SHARED template — that is template.manage.shared, admin only', async () => {
    const res = await createTemplate({
      type: 'complaint',
      name: `${PREFIX}denied`,
      content: { text: 'fever' },
      shared: true,
    }).expect(403);
    expect((res.body as { code?: string }).code).toBe('shared_template_denied');
  });

  it('lets an admin add to the shared list', async () => {
    const created = await createTemplate(
      { type: 'complaint', name: `${PREFIX}byadmin`, content: { text: 'cough' }, shared: true },
      'admin',
    ).expect(201);
    expect((created.body as Template).isShared).toBe(true);
  });

  it('refuses an admin an OWN template — an admin has no practitioner record to own it', async () => {
    const res = await createTemplate(
      { type: 'complaint', name: `${PREFIX}adminown`, content: { text: 'rash' } },
      'admin',
    ).expect(400);
    // Better than silently writing a null owner, which would have made it everyone's.
    expect((res.body as { code?: string }).code).toBe('no_practitioner');
  });

  it('refuses a template with no text or no name', async () => {
    await createTemplate({ type: 'complaint', name: 'x', content: { text: 'y' } }).expect(400);
    await createTemplate({ type: 'complaint', name: 'valid name', content: { text: '' } }).expect(
      400,
    );
  });

  it('refuses a type that has no content shape yet', async () => {
    // Task 4.12 adds prescription templates, with their own shape. Until then this is a
    // 400 rather than a row nobody can read back.
    await createTemplate({
      type: 'prescription',
      name: `${PREFIX}soon`,
      content: { text: 'nope' },
    }).expect(400);
  });

  // --- Who ----------------------------------------------------------------------

  it('the nurse may write a complaint and read templates, but not save one', async () => {
    const visitId = await stageVisit();
    await setComplaint(visitId, { chiefComplaint: 'triage: agitated' }, 'nurse').expect(200);
    await listTemplates('complaint', 'nurse').expect(200);
    await createTemplate(
      { type: 'complaint', name: `${PREFIX}nurse`, content: { text: 'agitated' } },
      'nurse',
    ).expect(403);
  });

  it('the receptionist writes no complaint after check-in and sees no templates', async () => {
    const visitId = await stageVisit();
    await setComplaint(visitId, { chiefComplaint: 'anything' }, 'receptionist').expect(403);
    await listTemplates('complaint', 'receptionist').expect(403);
  });

  it('rejects anonymous requests', async () => {
    const visitId = await stageVisit();
    await request(server).get('/templates?type=complaint').expect(401);
    await request(server).patch(`/visits/${visitId}/complaint`).send({}).expect(401);
  });

  it('400s on a template type that does not exist', async () => {
    await listTemplates('nonsense').expect(400);
  });

  it("404s on another facility's visit", async () => {
    const visitId = await stageVisit({ facility: otherFacilityId });
    await setComplaint(visitId, { chiefComplaint: 'x' }).expect(404);
  });

  it('404s on a visit that does not exist', async () => {
    await setComplaint(randomUUID(), { chiefComplaint: 'x' }).expect(404);
  });
});
