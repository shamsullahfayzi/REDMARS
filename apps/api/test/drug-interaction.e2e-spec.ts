import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { InteractionCheckResponse, LoginResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 2.11 — drug interaction check. Needs a seeded database (roles).
 *
 * The done-when: a known-dangerous pair fires a warning. The rest guards the edges —
 * a third unrelated drug does not spuriously match, direction does not matter, worst
 * severity sorts first, a foreign-facility id cannot smuggle itself into the check,
 * only a prescriber/dispenser (doctor/pharmacist/admin) may call it, and a single
 * drug is a 400.
 *
 * Interactions are seeded directly here (two curated rows) rather than by running the
 * CSV seeder, so the test owns its data and asserts on exact severities.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_drugint_';
const FACILITY_CODE = 'e2e_drugint_FAC';
const OTHER_FACILITY_CODE = 'e2e_drugint_FAC2';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Drug interactions (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let otherFacilityId: string;
  let fluoxetineId: string; // A
  let duloxetineId: string; // B
  let valproateId: string; // C
  let foreignDrugId: string; // D, in the other facility
  let doctorToken: string;
  let pharmacistToken: string;
  let adminToken: string;
  let receptionistToken: string;

  jest.setTimeout(60_000);

  async function seedActor(facId: string, suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId: facId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E DrugInt ${suffix}`,
        passwordHash: await hash(PASSWORD),
      },
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const res = await request(server)
      .post('/auth/login')
      .send({ username: `${PREFIX}${suffix}`, password: PASSWORD })
      .expect(200);
    return (res.body as LoginResponse).accessToken;
  }

  function makeDrug(facId: string, code: string, genericName: string, strength: string) {
    return prisma.drug.create({
      data: { facilityId: facId, code: `${PREFIX}${code}`, genericName, strength },
    });
  }

  // GET /drug-interactions/check?drugIds=a,b — chainable so callers add .expect(...).
  function check(drugIds: string[], token: string) {
    return request(server)
      .get('/drug-interactions/check')
      .set('Authorization', `Bearer ${token}`)
      .query({ drugIds: drugIds.join(',') });
  }

  async function cleanup(): Promise<void> {
    // Logins write audit_log rows scoped to the facility (and its users); those FKs
    // must go before the facility, user, and drug rows they point at.
    await prisma.auditLog.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.drugInteraction.deleteMany({ where: { drugA: { code: { startsWith: PREFIX } } } });
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.drug.deleteMany({ where: { code: { startsWith: PREFIX } } });
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

    const facility = await prisma.facility.create({
      data: { code: FACILITY_CODE, name: 'E2E DrugInt Facility' },
    });
    facilityId = facility.id;
    const other = await prisma.facility.create({
      data: { code: OTHER_FACILITY_CODE, name: 'E2E DrugInt Other Facility' },
    });
    otherFacilityId = other.id;

    fluoxetineId = (await makeDrug(facilityId, 'FLUOX', 'Fluoxetine', '20mg')).id;
    duloxetineId = (await makeDrug(facilityId, 'DULOX', 'Duloxetine', '30mg')).id;
    valproateId = (await makeDrug(facilityId, 'VALP', 'Sodium valproate', '500mg')).id;
    foreignDrugId = (await makeDrug(otherFacilityId, 'FLUOX2', 'Fluoxetine', '20mg')).id;

    // A+B major (serotonin syndrome), B+C moderate. No A+C pair.
    await prisma.drugInteraction.create({
      data: {
        drugAId: fluoxetineId,
        drugBId: duloxetineId,
        severity: 'major',
        description: 'Additive serotonergic effect; serotonin syndrome risk.',
      },
    });
    await prisma.drugInteraction.create({
      data: {
        drugAId: duloxetineId,
        drugBId: valproateId,
        severity: 'moderate',
        description: 'Additive sedation; monitor.',
      },
    });

    doctorToken = await seedActor(facilityId, 'doctor', 'doctor');
    pharmacistToken = await seedActor(facilityId, 'pharmacist', 'pharmacist');
    adminToken = await seedActor(facilityId, 'admin', 'admin');
    receptionistToken = await seedActor(facilityId, 'receptionist', 'receptionist');
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  it('the done-when: a dangerous pair fires a warning', async () => {
    const res = await check([fluoxetineId, duloxetineId], doctorToken).expect(200);
    const { interactions } = res.body as InteractionCheckResponse;
    expect(interactions).toHaveLength(1);
    expect(interactions[0].severity).toBe('major');
    expect(interactions[0].description).toMatch(/serotonin/i);
    const names = [interactions[0].drugAName, interactions[0].drugBName].sort();
    expect(names).toEqual(['Duloxetine 30mg', 'Fluoxetine 20mg']);
  });

  it('a pharmacist may also check (dispensing safety)', async () => {
    const res = await check([fluoxetineId, duloxetineId], pharmacistToken).expect(200);
    expect((res.body as InteractionCheckResponse).interactions).toHaveLength(1);
  });

  it('an unrelated third drug does not spuriously match', async () => {
    // A+C has no seeded pair.
    const res = await check([fluoxetineId, valproateId], adminToken).expect(200);
    expect((res.body as InteractionCheckResponse).interactions).toHaveLength(0);
  });

  it('finds the pair regardless of the order the ids are given', async () => {
    const res = await check([duloxetineId, fluoxetineId], doctorToken).expect(200);
    expect((res.body as InteractionCheckResponse).interactions).toHaveLength(1);
  });

  it('returns worst severity first when several pairs match', async () => {
    const res = await check([fluoxetineId, duloxetineId, valproateId], doctorToken).expect(200);
    const { interactions } = res.body as InteractionCheckResponse;
    expect(interactions.map((i) => i.severity)).toEqual(['major', 'moderate']);
  });

  it('ignores a drug id from another facility — it cannot surface an interaction', async () => {
    // foreignDrugId belongs to the other facility; filtered out, leaving only one
    // known drug, so no pair is possible even though it is a real Fluoxetine row.
    const res = await check([fluoxetineId, foreignDrugId], doctorToken).expect(200);
    expect((res.body as InteractionCheckResponse).interactions).toHaveLength(0);
  });

  it('tolerates an id that matches no drug at all', async () => {
    const res = await check([fluoxetineId, duloxetineId, randomUUID()], doctorToken).expect(200);
    expect((res.body as InteractionCheckResponse).interactions).toHaveLength(1);
  });

  it('denies a receptionist the check', () =>
    check([fluoxetineId, duloxetineId], receptionistToken).expect(403));

  it('rejects a single-drug check with 400', () => check([fluoxetineId], doctorToken).expect(400));

  it('rejects a non-uuid drug id with 400', () =>
    check([fluoxetineId, 'not-a-uuid'], doctorToken).expect(400));
});
