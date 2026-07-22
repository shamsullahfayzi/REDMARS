import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  FREQUENCY_CODES,
  FREQUENCY_VALUES,
  ROUTE_CODES,
  ROUTE_VALUES,
  defaultPrintSettings,
  matchCode,
  printSettingsSchema,
  searchCodes,
} from '@redmars/shared';
import type {
  DrugListResponse,
  LastPrescriptionResponse,
  LoginResponse,
  PrescriptionResponse,
} from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 4.7 — the prescription table. "4 drugs prescribed in under 30 seconds."
 *
 * The whole sheet is saved at once and the server DIFFS it, which is what makes repeated
 * saves cheap and the audit trail readable. Two things are proved here that a per-row API
 * would not have needed and this one absolutely does: saving twice leaves ONE prescription,
 * and a row the client stopped sending is removed rather than orphaned.
 *
 * `drugNameAtTime` is snapshotted server-side, per the schema's own instruction — "a 2026
 * prescription must still print what was ACTUALLY prescribed" — and a test renames a drug
 * afterwards to prove the old sheet does not change under it.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_rx_';
const PASSWORD = 'e2e-test-password-not-a-secret';

/**
 * The R1 read row is written FIRE-AND-FORGET by the audit interceptor, because R1 says a
 * clinical read is never blocked — including by its own logging. So a test that asserts it
 * has to wait for it rather than assume it has landed, or it passes alone and fails under
 * load, which is the worst kind of test.
 */
async function eventually<T>(read: () => Promise<T[]>, tries = 40): Promise<T[]> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const rows = await read();
    if (rows.length > 0) return rows;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return read();
}

describe('Prescription (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let otherFacilityId: string;
  let doctorId: string;
  let opdId: string;
  const drugs: Record<string, string> = {};

  const tokens: Record<string, string> = {};

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Rx ${suffix}`,
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
        firstName: `Nasir${counter}`,
        gender: 'male',
        estimatedAgeYears: 44,
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

  const getRx = (visitId: string, as = 'doctor') =>
    request(server)
      .get(`/visits/${visitId}/prescription`)
      .set('Authorization', `Bearer ${tokens[as]}`);

  const putRx = (visitId: string, body: unknown, as = 'doctor') =>
    request(server)
      .put(`/visits/${visitId}/prescription`)
      .set('Authorization', `Bearer ${tokens[as]}`)
      .send(body);

  /**
   * Task 4.11 — a SECOND visit for the patient an existing visit belongs to.
   *
   * Copy-last is entirely about one patient across two occasions, so the fixture has to be
   * able to build that. `stageVisit` makes a fresh patient every time, which is right for
   * every other test here and useless for this one.
   */
  async function stageFollowUp(previousVisitId: string): Promise<string> {
    counter += 1;
    const previous = await prisma.visit.findUniqueOrThrow({
      where: { id: previousVisitId },
      select: { patientId: true, departmentId: true, facilityId: true },
    });
    const visit = await prisma.visit.create({
      data: {
        facilityId: previous.facilityId,
        patientId: previous.patientId,
        departmentId: previous.departmentId,
        visitNo: `${PREFIX}V${counter}`,
        type: 'opd_consult',
        status: 'in_progress',
        statusHistory: { create: { status: 'arrived', changedBy: doctorId } },
      },
    });
    return visit.id;
  }

  const getLast = (visitId: string, as = 'doctor') =>
    request(server)
      .get(`/visits/${visitId}/prescription/last`)
      .set('Authorization', `Bearer ${tokens[as]}`);

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
    await prisma.visitStatusHistory.deleteMany({ where: { visit: facilityFilter } });
    await prisma.visit.deleteMany({ where: facilityFilter });
    // Task 4.11's override test records one. Patients cannot go while it points at them.
    await prisma.allergy.deleteMany({ where: { patient: facilityFilter } });
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
      await prisma.facility.create({ data: { code: `${PREFIX}fac`, name: 'E2E Rx Facility' } })
    ).id;
    otherFacilityId = (
      await prisma.facility.create({ data: { code: `${PREFIX}other`, name: 'E2E Rx Other' } })
    ).id;

    doctorId = await seedActor('doctor', 'doctor');
    await seedActor('doctor2', 'doctor');
    await seedActor('nurse', 'nurse');
    await seedActor('pharmacist', 'pharmacist');
    await seedActor('admin', 'admin');
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

    const seedDrug = async (key: string, genericName: string, extra = {}) => {
      const drug = await prisma.drug.create({
        data: {
          facilityId,
          code: `${PREFIX}${key}`,
          genericName,
          strength: '20mg',
          form: 'tablet',
          defaultRoute: 'oral',
          defaultFreq: 'OD',
          defaultDuration: '1 month',
          ...extra,
        },
      });
      drugs[key] = drug.id;
    };
    await seedDrug('DUL', 'Duloxetine');
    await seedDrug('OLZ', 'Olanzapine');
    await seedDrug('LOR', 'Lorazepam');
    await seedDrug('SER', 'Sertraline');
    await seedDrug('OLD', 'Withdrawn Drug', { isActive: false });
    // Starts ACTIVE and is withdrawn by task 4.11's test. OLD cannot serve: a prescription
    // naming it could never have been saved in the first place, and the case being proved
    // is a drug that was legitimately prescribed and has been withdrawn since.
    await seedDrug('WDR', 'Withdrawable Drug');
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  // --- The done-when ------------------------------------------------------------

  it('the done-when: four drugs on one sheet, in one request', async () => {
    const visitId = await stageVisit();

    const saved = await putRx(visitId, {
      items: [
        line(drugs.DUL, { dose: '1 tab', instructions: 'after food' }),
        line(drugs.OLZ, { frequency: 'ON', quantity: 30 }),
        line(drugs.LOR, { frequency: 'PRN', duration: '2 weeks' }),
        line(drugs.SER),
      ],
      advice: 'Return sooner if the sleep gets worse.',
    }).expect(200);

    const { prescription } = saved.body as PrescriptionResponse;
    expect(prescription?.items).toHaveLength(4);
    // The order the doctor put them in is the order they will print in.
    expect(prescription?.items.map((item) => item.sequence)).toEqual([0, 1, 2, 3]);
    expect(prescription?.items[0].instructions).toBe('after food');
    expect(prescription?.advice).toContain('Return sooner');
    // An unsigned drug order is not a thing.
    expect(prescription?.practitionerName).toBe('Hafizullah Sherzai');
  });

  /**
   * Farhat's current sheet fills Qty on every line and the pharmacy dispenses against it,
   * so the number has to survive the round trip exactly — and an EMPTY box has to arrive as
   * null rather than 0. "Dispense nothing" and "no quantity stated" are different
   * instructions to a pharmacist, and Number('') is 0.
   */
  it('keeps the dispensed quantity, and an empty one is null rather than zero', async () => {
    const visitId = await stageVisit();

    const saved = await putRx(visitId, {
      items: [line(drugs.DUL, { quantity: 30 }), line(drugs.OLZ, { quantity: '' })],
    }).expect(200);

    const { prescription } = saved.body as PrescriptionResponse;
    expect(prescription?.items[0].quantity).toBe(30);
    expect(prescription?.items[1].quantity).toBeNull();
  });

  it('snapshots the drug name, so renaming the formulary does not rewrite old sheets', async () => {
    const visitId = await stageVisit();
    await putRx(visitId, { items: [line(drugs.DUL)] }).expect(200);

    await prisma.drug.update({
      where: { id: drugs.DUL },
      data: { genericName: 'Duloxetine HCl RENAMED' },
    });

    const read = await getRx(visitId).expect(200);
    // "Clinical records are historical documents — they are not retroactively rewritten
    // by a lookup table."
    expect((read.body as PrescriptionResponse).prescription?.items[0].drugNameAtTime).toContain(
      'Duloxetine',
    );
    expect((read.body as PrescriptionResponse).prescription?.items[0].drugNameAtTime).not.toContain(
      'RENAMED',
    );

    await prisma.drug.update({ where: { id: drugs.DUL }, data: { genericName: 'Duloxetine' } });
  });

  // --- Saving twice ----------------------------------------------------------------

  it('saving twice leaves ONE prescription, not two', async () => {
    const visitId = await stageVisit();
    const first = await putRx(visitId, { items: [line(drugs.DUL)] }).expect(200);
    const second = await putRx(visitId, { items: [line(drugs.DUL), line(drugs.OLZ)] }).expect(200);

    expect((second.body as PrescriptionResponse).prescription?.id).toBe(
      (first.body as PrescriptionResponse).prescription?.id,
    );
    const count = await prisma.prescription.count({ where: { visitId } });
    expect(count).toBe(1);
  });

  it('updates the rows it was sent and removes the ones it was not', async () => {
    const visitId = await stageVisit();
    const first = await putRx(visitId, {
      items: [line(drugs.DUL), line(drugs.OLZ), line(drugs.LOR)],
    }).expect(200);
    const items = (first.body as PrescriptionResponse).prescription!.items;

    // Keep the first (edited), drop the second, keep the third, add a new one.
    const second = await putRx(visitId, {
      items: [
        { ...line(drugs.DUL), id: items[0].id, frequency: 'BID' },
        { ...line(drugs.LOR), id: items[2].id },
        line(drugs.SER),
      ],
    }).expect(200);

    const after = (second.body as PrescriptionResponse).prescription!.items;
    expect(after).toHaveLength(3);
    // The kept row is the SAME row, edited — not deleted and recreated.
    expect(after[0].id).toBe(items[0].id);
    expect(after[0].frequency).toBe('BID');
    expect(after.map((item) => item.drugId)).toEqual([drugs.DUL, drugs.LOR, drugs.SER]);
    expect(await prisma.prescriptionItem.count({ where: { id: items[1].id } })).toBe(0);
  });

  it('audits a re-save as edits, not as a pile of deletes and creates', async () => {
    const visitId = await stageVisit();
    const first = await putRx(visitId, { items: [line(drugs.DUL)] }).expect(200);
    const itemId = (first.body as PrescriptionResponse).prescription!.items[0].id;

    await putRx(visitId, { items: [{ ...line(drugs.DUL), id: itemId, dose: '2 tab' }] }).expect(
      200,
    );
    await putRx(visitId, { items: [{ ...line(drugs.DUL), id: itemId, dose: '3 tab' }] }).expect(
      200,
    );

    const creates = await prisma.auditLog.count({
      where: { entity: 'PrescriptionItem', entityId: itemId, action: AuditAction.create },
    });
    const updates = await prisma.auditLog.count({
      where: { entity: 'PrescriptionItem', entityId: itemId, action: AuditAction.update },
    });
    expect(creates).toBe(1);
    expect(updates).toBe(2);
  });

  it('an empty list means NO prescription, not an empty one', async () => {
    const visitId = await stageVisit();
    await putRx(visitId, { items: [line(drugs.DUL)] }).expect(200);

    const cleared = await putRx(visitId, { items: [] }).expect(200);
    expect((cleared.body as PrescriptionResponse).prescription).toBeNull();
    expect(await prisma.prescription.count({ where: { visitId } })).toBe(0);
  });

  it('returns null for a visit with no prescription — a normal outcome, not an error', async () => {
    const visitId = await stageVisit();
    const read = await getRx(visitId).expect(200);
    expect((read.body as PrescriptionResponse).prescription).toBeNull();
  });

  // --- What it refuses ---------------------------------------------------------------

  it('requires route, frequency and duration — the server never fills them in', async () => {
    const visitId = await stageVisit();
    // The formulary's defaults are what the BROWSER prefills and the doctor sees. A server
    // that supplied one silently would be writing an instruction nobody read.
    await putRx(visitId, {
      items: [{ drugId: drugs.DUL, frequency: 'OD', duration: '1 month' }],
    }).expect(400);
    await putRx(visitId, {
      items: [{ drugId: drugs.DUL, route: 'PO', duration: '1 month' }],
    }).expect(400);
    await putRx(visitId, { items: [{ drugId: drugs.DUL, route: 'PO', frequency: 'OD' }] }).expect(
      400,
    );
  });

  /**
   * Pure-function checks, living in an e2e spec because packages/shared has no test runner
   * of its own and this seam is worth more than its awkward home. `matchCode` is what maps
   * the formulary's free-text defaults (task 2.6 stored "oral", "OD") onto the codes the
   * contract now demands. If it stops working, every autofilled row arrives with an empty
   * route and the feature that exists to save time costs it instead — silently.
   */
  it('maps the formulary’s free-text defaults onto codes', () => {
    expect(matchCode('oral', ROUTE_CODES)).toBe('PO');
    expect(matchCode('Oral', ROUTE_CODES)).toBe('PO');
    expect(matchCode('by mouth', ROUTE_CODES)).toBe('PO');
    expect(matchCode('PO', ROUTE_CODES)).toBe('PO');
    expect(matchCode('injection', ROUTE_CODES)).toBe('IM');
    expect(matchCode('OD', FREQUENCY_CODES)).toBe('OD');
    expect(matchCode('daily', FREQUENCY_CODES)).toBe('OD');
    // The BRITISH forms are keywords now that the codes are American, because Farhat's own
    // sheet writes BID. A prescriber trained the other way must still land on the same code.
    expect(matchCode('bd', FREQUENCY_CODES)).toBe('BID');
    expect(matchCode('tds', FREQUENCY_CODES)).toBe('TID');
    expect(matchCode('nocte', FREQUENCY_CODES)).toBe('ON');
    // Farhat writes these two as one frequency; they are ON and OM here.
    expect(matchCode('od night', FREQUENCY_CODES)).toBe('ON');
    expect(matchCode('od morning', FREQUENCY_CODES)).toBe('OM');

    // No match is null, never a guess — the picker then opens empty and the prescriber
    // chooses, which is the only safe answer for a route nobody can identify.
    expect(matchCode('somehow', ROUTE_CODES)).toBeNull();
    expect(matchCode('', ROUTE_CODES)).toBeNull();
    expect(matchCode(null, ROUTE_CODES)).toBeNull();
  });

  it('finds a code by the word a doctor would actually type', () => {
    // The keyword lists are the difference between a dropdown and a ten-second hunt.
    const byWord = (query: string) => searchCodes(query, ROUTE_CODES).map((entry) => entry.code);
    expect(byWord('injection')).toEqual(expect.arrayContaining(['IM', 'IV', 'SC']));
    expect(byWord('skin')).toEqual(expect.arrayContaining(['TOP', 'SC', 'TD']));
    expect(byWord('eye')).toContain('OPH');
    expect(searchCodes('twice', FREQUENCY_CODES).map((e) => e.code)).toContain('BID');
    // Typing the British abbreviation finds the American code — the transition, tested.
    expect(searchCodes('bd', FREQUENCY_CODES).map((e) => e.code)).toContain('BID');
    expect(searchCodes('night', FREQUENCY_CODES).map((e) => e.code)).toContain('ON');
    // An empty query shows everything, so focusing the box is enough to discover the list.
    expect(searchCodes('', ROUTE_CODES)).toHaveLength(ROUTE_CODES.length);
  });

  // --- Task 4.11, copy last prescription ----------------------------------------

  it('the done-when: last visit’s drugs come back for this one', async () => {
    const first = await stageVisit();
    await putRx(first, {
      items: [
        line(drugs.DUL, { dose: '1 tab', quantity: 30, instructions: 'AC' }),
        line(drugs.OLZ, { frequency: 'ON' }),
      ],
    }).expect(200);

    const follow = await stageFollowUp(first);
    const res = await getLast(follow).expect(200);
    const { last } = res.body as LastPrescriptionResponse;

    expect(last?.visitId).toBe(first);
    expect(last?.items).toHaveLength(2);
    expect(last?.items[0]).toMatchObject({
      drugId: drugs.DUL,
      dose: '1 tab',
      quantity: 30,
      instructions: 'AC',
      frequency: 'OD',
      route: 'PO',
    });
    // The order they were written in is the order they come back in.
    expect(last?.items[1].drugId).toBe(drugs.OLZ);
    expect(last?.practitionerName).toBe('Hafizullah Sherzai');
  });

  /**
   * THE SAFETY PROPERTY OF THIS FEATURE, and the reason the response has its own shape
   * rather than reusing the stored item.
   *
   * An item id belongs to the visit it was written in. If one travelled up here the browser
   * could forward it into THIS visit's PUT, and the diff in save() would read it as "update
   * the row I already have" — silently editing a drug order on a consultation that closed
   * weeks ago. It is not filtered out; it is never selected.
   *
   * The allergy override is the same shape of danger and worse in consequence. A reason
   * carried forward by a copy would satisfy task 4.8's hard block on a sheet nobody looked
   * at: one click, no warning shown, block not applied.
   */
  it('carries neither the item id nor a previous allergy override', async () => {
    const first = await stageVisit();
    // Record the allergy first so the original save has to be overridden to go through.
    const patient = await prisma.visit.findUniqueOrThrow({
      where: { id: first },
      select: { patientId: true },
    });
    await prisma.allergy.create({
      data: {
        patientId: patient.patientId,
        substance: 'Duloxetine',
        drugId: drugs.DUL,
        severity: 'severe',
        notedBy: doctorId,
      },
    });

    await putRx(first, {
      items: [line(drugs.DUL, { allergyOverrideReason: 'Tolerated at this dose before.' })],
    }).expect(200);

    const follow = await stageFollowUp(first);
    const { last } = (await getLast(follow).expect(200)).body as LastPrescriptionResponse;

    expect(last?.items).toHaveLength(1);
    expect(last?.items[0]).not.toHaveProperty('id');
    expect(last?.items[0]).not.toHaveProperty('allergyOverrideReason');

    // And the block fires again on the copy, which is the point of not carrying it.
    await putRx(follow, { items: [line(drugs.DUL)] }).expect(409);
  });

  /**
   * A withdrawn drug cannot be saved — save() refuses it with `inactive_drug` — so copying
   * one forward would produce a sheet that fails on an error naming a drug the doctor never
   * chose. Dropping it in silence is worse: the doctor's memory becomes the only thing that
   * would notice, and not needing that memory is why the button exists.
   */
  it('does not offer a drug that has been withdrawn since, and names it', async () => {
    const first = await stageVisit();
    await putRx(first, { items: [line(drugs.DUL), line(drugs.WDR)] }).expect(200);
    await prisma.drug.update({ where: { id: drugs.WDR }, data: { isActive: false } });

    const follow = await stageFollowUp(first);
    const { last } = (await getLast(follow).expect(200)).body as LastPrescriptionResponse;

    expect(last?.items.map((item) => item.drugId)).toEqual([drugs.DUL]);
    expect(last?.skipped).toHaveLength(1);
    expect(last?.skipped[0].reason).toBe('withdrawn');
    // Named, so the doctor knows the patient is a medicine short rather than finding out
    // at the next visit.
    expect(last?.skipped[0].drugName).toContain('Withdrawable');
  });

  it('never offers this visit’s own sheet back', async () => {
    const visitId = await stageVisit();
    await putRx(visitId, { items: [line(drugs.SER)] }).expect(200);

    const { last } = (await getLast(visitId).expect(200)).body as LastPrescriptionResponse;
    // A copy that returned the sheet already on screen would duplicate every line.
    expect(last).toBeNull();
  });

  it('is null for a patient who has never been prescribed anything', async () => {
    const visitId = await stageVisit();
    const { last } = (await getLast(visitId).expect(200)).body as LastPrescriptionResponse;
    expect(last).toBeNull();
  });

  it('refuses everyone who cannot write a prescription', async () => {
    const visitId = await stageVisit();
    // It prepares a prescription, so it is gated on writing one — not on reading one, which
    // a pharmacist and (conditionally) a nurse and an admin all hold.
    await getLast(visitId, 'pharmacist').expect(403);
    await getLast(visitId, 'nurse').expect(403);
    await getLast(visitId, 'admin').expect(403);
  });

  it('does not reach across facilities for a previous sheet', async () => {
    const visitId = await stageVisit({ facility: otherFacilityId });
    await getLast(visitId).expect(404);
  });

  /**
   * Task 4.10 rests on ONE property: every print setting has a default, so the sheet ships
   * and works before the admin screen that will write these per facility exists. A field
   * added later without a default turns `parse({})` into a throw at print time — on the one
   * action that happens while a patient is standing up to leave.
   */
  it('every print setting has a default, so an unconfigured facility still prints', () => {
    const settings = defaultPrintSettings();

    // Farhat's sheet, as photographed: pre-printed letterhead and route spelled out.
    expect(settings.topMarginMm).toBe(55);
    expect(settings.paperSize).toBe('A4');
    expect(settings.routeAsWord).toBe(true);

    // Allergies print by DEFAULT even though their current sheet has no such section.
    // Tasks 4.6 and 4.8 exist to make a recorded allergy impossible to miss, and a
    // prescription that leaves the building without it undoes both at the last step.
    expect(settings.showAllergies).toBe(true);

    // A partial stored value fills its gaps rather than failing — which is what makes
    // adding a setting later a safe change for facilities that saved the old shape.
    expect(printSettingsSchema.parse({ topMarginMm: 20 })).toMatchObject({
      topMarginMm: 20,
      showAllergies: true,
      paperSize: 'A4',
    });
  });

  it('refuses a route or frequency that is not a code', async () => {
    const visitId = await stageVisit();
    // "oral", "Oral" and "by mouth" are one route typed three ways, and a column holding
    // all three cannot be printed consistently, dispensed against, or counted. The picker
    // offers the codes; the contract is what makes them the only possibility.
    await putRx(visitId, {
      items: [{ ...line(drugs.DUL), route: 'oral' }],
    }).expect(400);
    await putRx(visitId, {
      items: [{ ...line(drugs.DUL), route: 'by mouth' }],
    }).expect(400);
    await putRx(visitId, {
      items: [{ ...line(drugs.DUL), frequency: 'once daily' }],
    }).expect(400);
  });

  it('takes every code the picker offers', async () => {
    const visitId = await stageVisit();
    // If the shared list and the contract ever drift, this is where it shows up rather
    // than in a doctor's face at the moment they try to save.
    for (const route of ROUTE_VALUES) {
      await putRx(visitId, { items: [{ ...line(drugs.DUL), route }] }).expect(200);
    }
    for (const frequency of FREQUENCY_VALUES) {
      await putRx(visitId, { items: [{ ...line(drugs.DUL), frequency }] }).expect(200);
    }
  });

  it('keeps duration open — "until review" is a real answer', async () => {
    const visitId = await stageVisit();
    // Long-term psychiatric medication is the normal case at Farhat, so a closed duration
    // list would push the commonest answer into the instructions box.
    const saved = await putRx(visitId, {
      items: [{ ...line(drugs.DUL), duration: 'Until review' }],
    }).expect(200);
    expect((saved.body as PrescriptionResponse).prescription!.items[0].duration).toBe(
      'Until review',
    );
  });

  it('refuses an unknown drug and a withdrawn one', async () => {
    const visitId = await stageVisit();
    const unknown = await putRx(visitId, { items: [line(randomUUID())] }).expect(400);
    expect((unknown.body as { code?: string }).code).toBe('unknown_drug');

    const withdrawn = await putRx(visitId, { items: [line(drugs.OLD)] }).expect(400);
    expect((withdrawn.body as { code?: string }).code).toBe('inactive_drug');
  });

  it("refuses an item id belonging to another visit's prescription", async () => {
    const mine = await stageVisit();
    const theirs = await stageVisit();
    const other = await putRx(theirs, { items: [line(drugs.DUL)] }).expect(200);
    const stolen = (other.body as PrescriptionResponse).prescription!.items[0].id;

    await putRx(mine, { items: [{ ...line(drugs.OLZ), id: stolen }] }).expect(404);
  });

  it('refuses a doctor with no practitioner record — nothing signs the order', async () => {
    const visitId = await stageVisit();
    const res = await putRx(visitId, { items: [line(drugs.DUL)] }, 'doctor2').expect(400);
    expect((res.body as { code?: string }).code).toBe('no_practitioner');
  });

  it('refuses to write once the visit is closed, but still reads', async () => {
    const visitId = await stageVisit();
    await putRx(visitId, { items: [line(drugs.DUL)] }).expect(200);
    await prisma.visit.update({ where: { id: visitId }, data: { status: 'completed' } });

    const res = await putRx(visitId, { items: [line(drugs.OLZ)] }).expect(400);
    expect((res.body as { code?: string }).code).toBe('visit_closed');
    await getRx(visitId).expect(200);
  });

  // --- Who ------------------------------------------------------------------------------

  it('THE PHARMACIST READS IT — dispensing from a sheet you cannot read is not dispensing', async () => {
    const visitId = await stageVisit();
    await putRx(visitId, { items: [line(drugs.DUL)] }).expect(200);

    const read = await getRx(visitId, 'pharmacist').expect(200);
    expect((read.body as PrescriptionResponse).prescription?.items).toHaveLength(1);
    await putRx(visitId, { items: [line(drugs.OLZ)] }, 'pharmacist').expect(403);
  });

  it('nurse and admin read it; neither writes one', async () => {
    const visitId = await stageVisit();
    await putRx(visitId, { items: [line(drugs.DUL)] }).expect(200);

    await getRx(visitId, 'nurse').expect(200);
    await getRx(visitId, 'admin').expect(200);
    await putRx(visitId, { items: [line(drugs.OLZ)] }, 'nurse').expect(403);
    await putRx(visitId, { items: [line(drugs.OLZ)] }, 'admin').expect(403);
  });

  it('the receptionist sees no drug order', async () => {
    const visitId = await stageVisit();
    await getRx(visitId, 'receptionist').expect(403);
  });

  it('rejects anonymous requests', async () => {
    const visitId = await stageVisit();
    await request(server).get(`/visits/${visitId}/prescription`).expect(401);
  });

  // --- The formulary the doctor prescribes FROM --------------------------------------------

  it('lets the doctor and the nurse read the formulary — drug.read, task 4.7', async () => {
    // `drug.manage` is EDITING the catalogue. Reading it was gated there too, which left
    // the doctor unable to look up the drug they are about to prescribe.
    const asDoctor = await request(server)
      .get('/drugs?q=Duloxetine')
      .set('Authorization', `Bearer ${tokens.doctor}`)
      .expect(200);
    const found = (asDoctor.body as DrugListResponse).drugs.find((d) => d.id === drugs.DUL);
    // The defaults the browser prefills from — "duloxetine -> oral / OD / 1 month".
    expect(found?.defaultRoute).toBe('oral');
    expect(found?.defaultFreq).toBe('OD');
    expect(found?.defaultDuration).toBe('1 month');

    // R7: "Nurse sees vitals and allergies, PLUS THE DRUG LIST."
    await request(server).get('/drugs').set('Authorization', `Bearer ${tokens.nurse}`).expect(200);

    // The receptionist bills from the service catalogue, not the formulary.
    await request(server)
      .get('/drugs')
      .set('Authorization', `Bearer ${tokens.receptionist}`)
      .expect(403);
  });

  it('still refuses the doctor the right to EDIT the formulary', async () => {
    await request(server)
      .post('/drugs')
      .set('Authorization', `Bearer ${tokens.doctor}`)
      .send({ code: `${PREFIX}NOPE`, genericName: 'Doctor made this up' })
      .expect(403);
  });

  // --- Audit and boundaries ------------------------------------------------------------------

  it('audits the read against the visit', async () => {
    const visitId = await stageVisit();
    await getRx(visitId).expect(200);

    const rows = await eventually(() =>
      prisma.auditLog.findMany({
        where: { action: AuditAction.read, entity: 'Prescription', entityId: visitId },
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(doctorId);
  });

  it("404s on another facility's visit, 400s on a bad id", async () => {
    const visitId = await stageVisit({ facility: otherFacilityId });
    await getRx(visitId).expect(404);
    await getRx(randomUUID()).expect(404);
    await getRx('not-a-uuid').expect(400);
  });
});
