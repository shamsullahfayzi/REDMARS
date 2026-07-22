import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { DrugListResponse, LoginResponse, PrescriptionResponse } from '@redmars/shared';
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

  const line = (drugId: string, over: Record<string, unknown> = {}) => ({
    drugId,
    frequency: 'OD',
    duration: '1 month',
    route: 'oral',
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
    await prisma.patient.deleteMany({ where: facilityFilter });
    await prisma.drug.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.practitioner.deleteMany({ where: { code: { startsWith: PREFIX } } });
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
        { ...line(drugs.DUL), id: items[0].id, frequency: 'BD' },
        { ...line(drugs.LOR), id: items[2].id },
        line(drugs.SER),
      ],
    }).expect(200);

    const after = (second.body as PrescriptionResponse).prescription!.items;
    expect(after).toHaveLength(3);
    // The kept row is the SAME row, edited — not deleted and recreated.
    expect(after[0].id).toBe(items[0].id);
    expect(after[0].frequency).toBe('BD');
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
      items: [{ drugId: drugs.DUL, route: 'oral', duration: '1 month' }],
    }).expect(400);
    await putRx(visitId, { items: [{ drugId: drugs.DUL, route: 'oral', frequency: 'OD' }] }).expect(
      400,
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
