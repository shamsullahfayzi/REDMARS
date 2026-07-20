import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { NumberSequenceService } from './../src/services/number-sequence.service';

/**
 * Task 2.10 — the gapless number issuer. Needs a database.
 *
 * The headline is the ⚠️ one: fire N calls CONCURRENTLY and assert N distinct,
 * contiguous numbers. A naive count()+1 issuer passes a sequential loop and fails
 * exactly here — two calls read the same value and hand it out twice. The rest
 * proves the year scoping, the non-NULL sentinel that keeps the unique constraint
 * honest, and the formatting.
 *
 * Tested at the service layer (no HTTP route exists — this is infrastructure), by
 * resolving the provider from the Nest container and calling it directly.
 */
const prisma = new PrismaClient();
const FACILITY_CODE = 'e2e_numseq_FAC';

describe('NumberSequence (e2e)', () => {
  let app: INestApplication<App>;
  let service: NumberSequenceService;
  let facilityId: string;

  jest.setTimeout(60_000);

  async function cleanCounters(): Promise<void> {
    await prisma.numberSequence.deleteMany({ where: { facilityId } });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    service = app.get(NumberSequenceService);

    // A dedicated facility so every counter starts empty and 1..N is exact.
    const facility = await prisma.facility.create({
      data: { code: FACILITY_CODE, name: 'E2E NumberSequence Facility' },
    });
    facilityId = facility.id;
  });

  afterAll(async () => {
    await cleanCounters();
    await prisma.facility.deleteMany({ where: { code: FACILITY_CODE } });
    await prisma.$disconnect();
    await app.close();
  });

  afterEach(cleanCounters);

  it('issues sequentially with no gaps, formatted', async () => {
    const first = await service.next(facilityId, 'patient_mrn');
    const second = await service.next(facilityId, 'patient_mrn');
    expect(first.value).toBe(1);
    expect(second.value).toBe(2);
    expect(first.formatted).toBe('MRN-000001');
    expect(second.formatted).toBe('MRN-000002');
  });

  it('the done-when: 50 concurrent calls yield 50 distinct, contiguous numbers', async () => {
    const issued = await Promise.all(
      Array.from({ length: 50 }, () => service.next(facilityId, 'invoice_no')),
    );
    const values = issued.map((n) => n.value);

    // No duplicate — the collision a naive issuer would produce.
    expect(new Set(values).size).toBe(50);
    // No gap — sorted, they are exactly 1..50.
    expect([...values].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it('scopes yearly counters per year — each restarts at 1', async () => {
    const y2026 = new Date('2026-06-15T12:00:00Z');
    const y2027 = new Date('2027-06-15T12:00:00Z');

    const a = await service.next(facilityId, 'invoice_no', y2026);
    const b = await service.next(facilityId, 'invoice_no', y2026);
    const c = await service.next(facilityId, 'invoice_no', y2027);

    expect([a.value, b.value]).toEqual([1, 2]);
    expect(a.formatted).toBe('INV-2026-0001');
    expect(c.value).toBe(1); // a new year is a fresh counter
    expect(c.formatted).toBe('INV-2027-0001');
  });

  it('concurrent calls across two years stay independent (each 1..N)', async () => {
    const y2026 = new Date('2026-01-02T00:00:00Z');
    const y2027 = new Date('2027-01-02T00:00:00Z');

    const issued = await Promise.all([
      ...Array.from({ length: 20 }, () => service.next(facilityId, 'visit_no', y2026)),
      ...Array.from({ length: 20 }, () => service.next(facilityId, 'visit_no', y2027)),
    ]);

    const v2026 = issued
      .filter((n) => n.year === 2026)
      .map((n) => n.value)
      .sort((a, b) => a - b);
    const v2027 = issued
      .filter((n) => n.year === 2027)
      .map((n) => n.value)
      .sort((a, b) => a - b);
    const oneToTwenty = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(v2026).toEqual(oneToTwenty);
    expect(v2027).toEqual(oneToTwenty);
  });

  it('a non-yearly sequence stores the sentinel year and keeps ONE counter row', async () => {
    await service.next(facilityId, 'patient_mrn');
    await service.next(facilityId, 'patient_mrn');

    // The unique constraint would not dedupe NULL years — the sentinel (0) is what
    // guarantees a single counter row rather than a new one per call.
    const rows = await prisma.numberSequence.findMany({
      where: { facilityId, key: 'patient_mrn' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].year).toBe(0);
    expect(rows[0].current).toBe(2);
  });

  it('the counter tick writes no audit rows', async () => {
    await service.next(facilityId, 'lab_order_no');
    const audits = await prisma.auditLog.findMany({
      where: { facilityId, entity: 'NumberSequence' },
    });
    expect(audits).toHaveLength(0);
  });

  it('rejects an unknown key', async () => {
    await expect(
      service.next(facilityId, 'not_a_real_key' as unknown as Parameters<typeof service.next>[1]),
    ).rejects.toThrow(/Unknown number sequence key/);
  });
});
