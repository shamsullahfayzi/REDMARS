import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse, Template, TemplateListResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 4.12 — prescription templates. "Standard depression starter in one click."
 *
 * A WHOLE REGIMEN, unlike task 4.4's complaint templates which hold one phrase each and are
 * stacked. The difference is what the two things are: a phrase is a building block, a
 * starting regimen is a decision somebody already made.
 *
 * Three properties are worth more than the rest and are what this file mostly proves:
 *
 *  1. A template CANNOT be saved naming a drug that is unknown or withdrawn, because that
 *     would be a one-click way to produce a prescription the save endpoint refuses — and
 *     the doctor would meet that error weeks later with no idea which template caused it.
 *  2. Ownership survives deletion. Your own goes; a shared one is the hospital's list
 *     changing and needs `template.manage.shared`; a colleague's private one is a 404,
 *     because whether another doctor has a template by that name is not yours to learn.
 *  3. The content shapes do not cross. A phrase sent as a prescription template and a drug
 *     list sent as a complaint template are both 400s, which is the discriminated union
 *     earning its place.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_rxtpl_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Prescription templates (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let otherFacilityId: string;
  let doctorId: string;
  let otherDoctorUserId: string;
  const drugs: Record<string, string> = {};

  const tokens: Record<string, string> = {};

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E RxTpl ${suffix}`,
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

  const listTemplates = (as = 'doctor') =>
    request(server)
      .get('/templates?type=prescription')
      .set('Authorization', `Bearer ${tokens[as]}`);

  const createTemplate = (body: unknown, as = 'doctor') =>
    request(server).post('/templates').set('Authorization', `Bearer ${tokens[as]}`).send(body);

  const deleteTemplate = (id: string, as = 'doctor') =>
    request(server).delete(`/templates/${id}`).set('Authorization', `Bearer ${tokens[as]}`);

  const item = (drugId: string, over: Record<string, unknown> = {}) => ({
    drugId,
    frequency: 'OD',
    duration: '1 month',
    route: 'PO',
    ...over,
  });

  const regimen = (name: string, items: unknown[], over: Record<string, unknown> = {}) => ({
    type: 'prescription',
    name: `${PREFIX}${name}`,
    content: { items },
    ...over,
  });

  async function cleanup(): Promise<void> {
    const facilityFilter = { facility: { code: { startsWith: PREFIX } } };
    await prisma.auditLog.deleteMany({ where: facilityFilter });
    await prisma.template.deleteMany({ where: facilityFilter });
    await prisma.drug.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.practitioner.deleteMany({ where: { code: { startsWith: PREFIX } } });
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
      await prisma.facility.create({ data: { code: `${PREFIX}fac`, name: 'E2E RxTpl Facility' } })
    ).id;
    otherFacilityId = (
      await prisma.facility.create({ data: { code: `${PREFIX}other`, name: 'E2E RxTpl Other' } })
    ).id;

    doctorId = await seedActor('doctor', 'doctor');
    otherDoctorUserId = await seedActor('doctor2', 'doctor');
    await seedActor('nurse', 'nurse');
    await seedActor('admin', 'admin');

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
        firstName: 'Ahmad',
        lastName: 'Nazari',
        userId: otherDoctorUserId,
      },
    });

    const seedDrug = async (key: string, genericName: string, extra = {}) => {
      const drug = await prisma.drug.create({
        data: {
          facilityId,
          code: `${PREFIX}${key}`,
          genericName,
          strength: '20mg',
          form: 'tablet',
          ...extra,
        },
      });
      drugs[key] = drug.id;
    };
    await seedDrug('SER', 'Sertraline');
    await seedDrug('OLZ', 'Olanzapine');
    await seedDrug('LOR', 'Lorazepam');
    await seedDrug('GONE', 'Discontinued Drug', { isActive: false });
    // Belongs to the other facility, so it is a real uuid this facility must still refuse.
    const elsewhere = await prisma.drug.create({
      data: {
        facilityId: otherFacilityId,
        code: `${PREFIX}ELSE`,
        genericName: 'Elsewhere Drug',
        form: 'tablet',
      },
    });
    drugs.ELSE = elsewhere.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  // --- The done-when ------------------------------------------------------------

  it('the done-when: a whole regimen saved once and read back in one click', async () => {
    const created = await createTemplate(
      regimen('starter', [
        item(drugs.SER, { dose: '1 tab', quantity: 30, instructions: 'PC' }),
        item(drugs.OLZ, { frequency: 'ON', duration: '2 weeks' }),
        item(drugs.LOR, { frequency: 'PRN', duration: '5 days' }),
      ]),
    ).expect(201);

    const template = created.body as Template;
    expect(template.type).toBe('prescription');
    expect(template.isMine).toBe(true);
    expect(template.isShared).toBe(false);

    const listed = await listTemplates().expect(200);
    const found = (listed.body as TemplateListResponse).templates.find(
      (row) => row.id === template.id,
    );
    // Narrowed, because the list is a union and reading content off it without narrowing
    // is exactly what the union exists to prevent.
    expect(found?.type).toBe('prescription');
    if (found?.type !== 'prescription') throw new Error('wrong type back');

    expect(found.content.items).toHaveLength(3);
    // The order they were saved in is the order they come back in — a regimen is a
    // sequence a doctor recognises, not a set.
    expect(found.content.items.map((row) => row.drugId)).toEqual([drugs.SER, drugs.OLZ, drugs.LOR]);
    expect(found.content.items[0]).toMatchObject({
      dose: '1 tab',
      quantity: 30,
      instructions: 'PC',
      frequency: 'OD',
      route: 'PO',
    });
  });

  it('keeps the advice that goes with the regimen', async () => {
    const created = await createTemplate(
      regimen('withadvice', [item(drugs.SER)], {
        content: { items: [item(drugs.SER)], advice: 'Review in four weeks.' },
      }),
    ).expect(201);

    const template = created.body as Template;
    if (template.type !== 'prescription') throw new Error('wrong type back');
    expect(template.content.advice).toBe('Review in four weeks.');
  });

  // --- What may not be saved ----------------------------------------------------

  /**
   * The property this feature turns on. A template naming a drug that cannot be prescribed
   * is a one-click way to build a sheet the save endpoint refuses, and the doctor would
   * meet that error weeks later with no idea which template caused it.
   */
  it('refuses a drug that is withdrawn, unknown, or another facility’s', async () => {
    await createTemplate(regimen('withdrawn', [item(drugs.GONE)])).expect(400);
    await createTemplate(regimen('unknown', [item('11111111-1111-4111-8111-111111111111')])).expect(
      400,
    );
    // A real uuid, a real drug — just not this hospital's. 400 and not 404: from here it is
    // an invalid drug in the request, and confirming it exists elsewhere would answer a
    // question about another facility.
    await createTemplate(regimen('foreign', [item(drugs.ELSE)])).expect(400);
  });

  it('refuses an empty regimen and one that is not a regimen at all', async () => {
    // An empty one is not a starting point for anything.
    await createTemplate(regimen('empty', [])).expect(400);
    // A phrase under the prescription type. The discriminated union earning its place.
    await createTemplate({
      type: 'prescription',
      name: `${PREFIX}phrase`,
      content: { text: 'not a regimen' },
    }).expect(400);
  });

  it('refuses a route or frequency that is not a code', async () => {
    // The same closed sets the prescription contract uses. A template that could hold
    // "oral" would produce a sheet that cannot be saved.
    await createTemplate(regimen('badroute', [item(drugs.SER, { route: 'oral' })])).expect(400);
    await createTemplate(regimen('badfreq', [item(drugs.SER, { frequency: 'daily' })])).expect(400);
  });

  // --- Whose regimen is whose ---------------------------------------------------

  it('shows the shared list plus your own, never a colleague’s', async () => {
    const mine = (await createTemplate(regimen('mine', [item(drugs.SER)])).expect(201))
      .body as Template;
    const theirs = (
      await createTemplate(regimen('theirs', [item(drugs.OLZ)]), 'doctor2').expect(201)
    ).body as Template;
    const shared = (
      await createTemplate(regimen('shared', [item(drugs.LOR)], { shared: true }), 'admin').expect(
        201,
      )
    ).body as Template;

    const ids = (await listTemplates().expect(200)).body as TemplateListResponse;
    const seen = ids.templates.map((row) => row.id);
    expect(seen).toContain(mine.id);
    expect(seen).toContain(shared.id);
    expect(seen).not.toContain(theirs.id);

    // Shared first: the hospital's agreed regimen is what a new doctor reaches for before
    // their own.
    const sharedRow = ids.templates.find((row) => row.id === shared.id);
    expect(sharedRow?.isShared).toBe(true);
    expect(sharedRow?.isMine).toBe(false);
  });

  it('only an administrator may add to the hospital’s shared list', async () => {
    await createTemplate(regimen('doctorshared', [item(drugs.SER)], { shared: true })).expect(403);
  });

  // --- Deleting -----------------------------------------------------------------

  it('deletes your own and returns what is left', async () => {
    const mine = (await createTemplate(regimen('todelete', [item(drugs.SER)])).expect(201))
      .body as Template;

    const after = (await deleteTemplate(mine.id).expect(200)).body as TemplateListResponse;
    expect(after.templates.map((row) => row.id)).not.toContain(mine.id);
  });

  it('will not delete a colleague’s private regimen, and does not admit it exists', async () => {
    const theirs = (
      await createTemplate(regimen('theirsafe', [item(drugs.OLZ)]), 'doctor2').expect(201)
    ).body as Template;

    // 404 rather than 403: whether another doctor has a template by that name is not this
    // caller's to learn, and a 403 would answer that question.
    await deleteTemplate(theirs.id).expect(404);
    expect(await prisma.template.findUnique({ where: { id: theirs.id } })).not.toBeNull();
  });

  it('will not let a doctor delete a shared regimen, but an admin may', async () => {
    const shared = (
      await createTemplate(
        regimen('sharedgone', [item(drugs.LOR)], { shared: true }),
        'admin',
      ).expect(201)
    ).body as Template;

    // Removing it changes the hospital's list, so it needs the shared permission — the
    // same split that governs creating one.
    await deleteTemplate(shared.id).expect(403);
    await deleteTemplate(shared.id, 'admin').expect(200);
    expect(await prisma.template.findUnique({ where: { id: shared.id } })).toBeNull();
  });

  it('does not reach across facilities to delete', async () => {
    const elsewhere = await prisma.template.create({
      data: {
        facilityId: otherFacilityId,
        type: 'prescription',
        name: `${PREFIX}elsewhere`,
        content: { items: [item(drugs.ELSE)] },
      },
    });
    await deleteTemplate(elsewhere.id).expect(404);
  });

  // --- Who ----------------------------------------------------------------------

  it('a nurse may read the regimens and save none', async () => {
    // `template.read` is the nurse's; `template.manage.own` is not.
    await listTemplates('nurse').expect(200);
    await createTemplate(regimen('nurse', [item(drugs.SER)]), 'nurse').expect(403);
  });

  it('refuses an admin an own regimen, because an admin is not a practitioner', async () => {
    // Not a permission failure — `template.manage.own` is the admin's. There is simply no
    // practitioner row to own it, and writing one with a null owner would silently make it
    // the whole hospital's.
    const res = await createTemplate(regimen('adminown', [item(drugs.SER)]), 'admin').expect(400);
    expect((res.body as { code?: string }).code).toBe('no_practitioner');
  });

  it('refuses an unauthenticated caller', async () => {
    await request(server).get('/templates?type=prescription').expect(401);
    await request(server).delete(`/templates/${drugs.SER}`).expect(401);
  });
});
