import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  DrugListResponse,
  DrugSummary,
  ImportDrugsResponse,
  LoginResponse,
} from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 2.4 — drug formulary + CSV import. Needs a seeded database.
 *
 * The headline test is the done-when: a batch of drugs is imported by pasting CSV
 * and then found by search. The rest guards what makes it safe — import is
 * re-runnable (upsert, no duplicates), one bad row is skipped and reported rather
 * than aborting the lot, both admin and pharmacist may manage, and a receptionist
 * may not.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_drug_';
const PASSWORD = 'e2e-test-password-not-a-secret';

describe('Drug formulary (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let adminId: string;
  let pharmacistId: string;
  let receptionistId: string;
  let adminToken: string;
  let pharmacistToken: string;
  let receptionistToken: string;

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E Drug ${suffix}`,
        passwordHash: await hash(PASSWORD),
      },
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return user.id;
  }

  async function login(username: string, password: string): Promise<string> {
    const res = await request(server).post('/auth/login').send({ username, password }).expect(200);
    return (res.body as LoginResponse).accessToken;
  }

  async function cleanup(): Promise<void> {
    await prisma.drug.deleteMany({ where: { code: { startsWith: PREFIX } } });
    // Again, and deliberately. The R1 read row is written fire-and-forget, so one can
    // land AFTER the sweep above and before the facility goes — and then the facility
    // delete fails on a foreign key, inside afterAll, which Jest reports as a failed suite
    // with no failed tests. Cheap to repeat, miserable to debug.
    await prisma.auditLog.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    facilityId = (await prisma.facility.findFirstOrThrow()).id;
    await cleanup();

    adminId = await seedActor('admin', 'admin');
    pharmacistId = await seedActor('pharmacist', 'pharmacist');
    receptionistId = await seedActor('receptionist', 'receptionist');
    adminToken = await login(`${PREFIX}admin`, PASSWORD);
    pharmacistToken = await login(`${PREFIX}pharmacist`, PASSWORD);
    receptionistToken = await login(`${PREFIX}receptionist`, PASSWORD);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { userId: { in: [adminId, pharmacistId, receptionistId] } },
    });
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  const CSV = [
    'code,genericName,brandName,strength,form,isControlled',
    `${PREFIX}DULOX,Duloxetine,Cymbalta,30mg,capsule,false`,
    `${PREFIX}DIAZE,Diazepam,Valium,5mg,tablet,true`,
    // A quoted field containing a comma must survive the parser.
    `${PREFIX}COAMOX,"Co-amoxiclav, 625mg",Augmentin,625mg,tablet,false`,
  ].join('\n');

  it('the done-when: import a CSV batch, then find a drug by search', async () => {
    const res = await request(server)
      .post('/drugs/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ csv: CSV })
      .expect(200);

    const result = res.body as ImportDrugsResponse;
    expect(result.imported).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Search finds duloxetine by a partial generic name. Scoped to this test's own
    // code rather than asserting a global count — a real seeded formulary may hold
    // its own Duloxetine, and this test must not assume an empty table.
    const search = await request(server)
      .get('/drugs?q=dulox')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const mine = (search.body as DrugListResponse).drugs.filter((d) => d.code === `${PREFIX}DULOX`);
    expect(mine).toHaveLength(1);
    expect(mine[0].genericName).toBe('Duloxetine');

    // The comma inside the quoted field was preserved, not split.
    const coamox = await prisma.drug.findFirstOrThrow({ where: { code: `${PREFIX}COAMOX` } });
    expect(coamox.genericName).toBe('Co-amoxiclav, 625mg');
    expect(coamox.isControlled).toBe(false);
  });

  it('re-importing the same CSV updates rather than duplicating', async () => {
    const before = await prisma.drug.count({ where: { code: { startsWith: PREFIX } } });
    const res = await request(server)
      .post('/drugs/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ csv: CSV })
      .expect(200);
    expect((res.body as ImportDrugsResponse).imported).toBe(3);

    const after = await prisma.drug.count({ where: { code: { startsWith: PREFIX } } });
    expect(after).toBe(before);
  });

  it('skips a bad row and reports its line, importing the good ones', async () => {
    const csv = [
      'code,genericName',
      `${PREFIX}GOOD1,Aspirin`,
      `${PREFIX}BADROW,X`, // generic name too short -> rejected
      `${PREFIX}GOOD2,Ibuprofen`,
    ].join('\n');

    const res = await request(server)
      .post('/drugs/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ csv })
      .expect(200);

    const result = res.body as ImportDrugsResponse;
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    // The bad row is line 3 (header is line 1).
    expect(result.errors[0].line).toBe(3);
  });

  it('a pharmacist may also manage drugs (not admin-only)', () =>
    request(server).get('/drugs').set('Authorization', `Bearer ${pharmacistToken}`).expect(200));

  it('denies a receptionist the formulary', () =>
    request(server).get('/drugs').set('Authorization', `Bearer ${receptionistToken}`).expect(403));

  it('creates a single drug, and rejects a duplicate code with 409', async () => {
    await request(server)
      .post('/drugs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `${PREFIX}SOLO`, genericName: 'Sertraline' })
      .expect(201);

    await request(server)
      .post('/drugs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `${PREFIX}SOLO`, genericName: 'Dup' })
      .expect(409);
  });

  it('captures prescribing defaults (2.6): create carries route/freq/duration, edit changes them', async () => {
    const created = await request(server)
      .post('/drugs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `${PREFIX}DEFAULTS`,
        genericName: 'Duloxetine',
        defaultRoute: 'oral',
        defaultFreq: 'OD',
        defaultDuration: '1 month',
      })
      .expect(201);
    const drug = created.body as DrugSummary;
    expect(drug.defaultRoute).toBe('oral');
    expect(drug.defaultFreq).toBe('OD');
    expect(drug.defaultDuration).toBe('1 month');

    // Editable — a prescriber-facing default is never locked.
    const edited = await request(server)
      .patch(`/drugs/${drug.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ genericName: 'Duloxetine', defaultFreq: 'BD', defaultDuration: '2 weeks' })
      .expect(200);
    const after = edited.body as DrugSummary;
    expect(after.defaultRoute).toBeNull(); // omitted on edit -> cleared
    expect(after.defaultFreq).toBe('BD');
    expect(after.defaultDuration).toBe('2 weeks');
  });

  it('CSV import carries prescribing defaults (2.6)', async () => {
    const csv = [
      'code,genericName,defaultRoute,defaultFreq,defaultDuration',
      `${PREFIX}IMPDEF,Sertraline,oral,OD,1 month`,
    ].join('\n');
    await request(server)
      .post('/drugs/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ csv })
      .expect(200);

    const row = await prisma.drug.findFirstOrThrow({ where: { code: `${PREFIX}IMPDEF` } });
    expect(row.defaultRoute).toBe('oral');
    expect(row.defaultFreq).toBe('OD');
    expect(row.defaultDuration).toBe('1 month');
  });

  it('rejects a bad body (missing generic name) with 400', () =>
    request(server)
      .post('/drugs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `${PREFIX}NOGEN` })
      .expect(400));

  it('deactivation is reversible: a deactivated drug is still listed', async () => {
    const drug = (await request(server)
      .post('/drugs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `${PREFIX}TOGGLE`, genericName: 'Fluoxetine' })
      .expect(201)) as { body: DrugSummary };
    const id = drug.body.id;

    await request(server)
      .patch(`/drugs/${id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    const list = await request(server)
      .get('/drugs')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const found = (list.body as DrugListResponse).drugs.find((d) => d.id === id);
    expect(found?.isActive).toBe(false);
  });

  it('audits an imported drug, attributable to the importer', async () => {
    const drug = await prisma.drug.findFirstOrThrow({ where: { code: `${PREFIX}DULOX` } });
    const rows = await prisma.auditLog.findMany({
      where: { entity: 'Drug', entityId: drug.id, action: AuditAction.create },
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].userId).toBe(adminId);
  });
});
