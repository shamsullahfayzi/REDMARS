import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { shamsiToGregorian, fiscalYearCalendar } from '@redmars/shared';
import { AppModule } from '../src/app.module';
import { FinanceLedgerService, FinanceActor } from '../src/modules/finance/finance-ledger.service';
import { FinanceOperationsService } from '../src/modules/finance/finance-operations.service';
import { requestContext } from '../src/audit/request-context';

describe('Finance Layer 0 foundations', () => {
  jest.setTimeout(60000);
  const raw = new PrismaClient();
  let app: INestApplication, ledger: FinanceLedgerService, operations: FinanceOperationsService;
  let actor: FinanceActor, other: FinanceActor, cash: string, equity: string, otherCash: string;
  let reviewer: FinanceActor;
  const command = () => ({ idempotencyKey: randomUUID() });
  const run = <T>(fn: () => Promise<T>) => requestContext.run(actor, fn);
  const input = (on = '1404-07-05', amount = '0.30') => ({
    date: shamsiToGregorian(on),
    memo: 'Foundation test',
    ...command(),
    lines: [
      { accountId: cash, description: '', debit: amount, credit: '0' },
      { accountId: equity, description: '', debit: '0', credit: amount },
    ],
  });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    ledger = app.get(FinanceLedgerService);
    operations = app.get(FinanceOperationsService);
    async function facility() {
      const f = await raw.facility.create({
        data: { code: randomUUID(), name: 'Isolated finance foundation test' },
      });
      const user = await raw.appUser.create({
        data: {
          facilityId: f.id,
          username: randomUUID(),
          fullName: 'Test actor',
          passwordHash: 'not-a-login',
        },
      });
      const a = { facilityId: f.id, userId: user.id };
      await requestContext.run(a, () =>
        ledger.setup(a, { cutoverDate: '2025-03-21', ...command() }),
      );
      return a;
    }
    actor = await facility();
    reviewer={...actor,userId:(await raw.appUser.create({data:{facilityId:actor.facilityId,username:randomUUID(),fullName:'Reviewer',passwordHash:'no-login'}})).id};
    other = await facility();
    const account = async (a: FinanceActor, key: string) =>
      (
        await raw.financeAccount.findUniqueOrThrow({
          where: { facilityId_systemKey: { facilityId: a.facilityId, systemKey: key } },
        })
      ).id;
    cash = await account(actor, 'cash');
    equity = await account(actor, 'opening');
    otherCash = await account(other, 'cash');
  });
  afterAll(async () => {
    await app?.close();
    await raw.$disconnect();
  });

  it('creates 1404 as twelve exact months, exposes UTC boundaries and scopes both facilities', async () => {
    const workspace = await operations.workspace(actor.facilityId);
    const periods = workspace.periods.filter((p) => p.year === 1404);
    expect(periods).toHaveLength(12);
    for (const [index, p] of periods.entries()) {
      const expected = fiscalYearCalendar(1404).periods[index];
      expect(p.label).toBe(expected.label);
      expect(p.startsAt).toBe(expected.startsOn.toISOString());
      expect(p.endsAt).toBe(expected.endsOn.toISOString());
    }
    const otherIds = (await operations.workspace(other.facilityId)).periods.map((p) => p.id);
    expect(periods.some((p) => otherIds.includes(p.id))).toBe(false);
  });

  it('files Mizan 5 into 1404-07, preserves the UTC instant and includes the last instant in reports', async () => {
    const draft = await run(() => ledger.createJournal(actor, input()));
    expect(draft.periodLabel).toBe('1404-07');
    expect(draft.effectiveAt).toBe('2025-09-26T19:30:00.000Z');
    await run(() => ledger.postJournal(reviewer, draft.id, { expectedVersion: 1, ...command() }));
    const period = fiscalYearCalendar(1404).periods[6];
    const last = new Date(period.endsOn.getTime() - 1);
    const late = await run(() =>
      ledger.prisma.db.$transaction((tx) =>
        ledger.automatic(tx, actor, input('1404-07-30', '0.10'), 'expense', randomUUID(), last),
      ),
    );
    expect(late.periodLabel).toBe('1404-07');
    expect(late.effectiveAt).toBe(last.toISOString());
    await ledger.postJournal(reviewer,late.id,{expectedVersion:late.version,...command()});
    const report = await ledger.report(actor.facilityId, '2025-09-23', '2025-10-22');
    expect(report.debit).toBe('0.40');
    expect(report.credit).toBe('0.40');
    const next = await run(() => ledger.createJournal(actor, input('1404-08-01')));
    expect(next.periodLabel).toBe('1404-08');
  });

  it('enforces exact half-open boundaries in PostgreSQL under a non-UTC session timezone', async () => {
    const p = await raw.fiscalPeriod.findUniqueOrThrow({
      where: { facilityId_label: { facilityId: actor.facilityId, label: '1404-07' } },
    });
    const data = {
      facilityId: actor.facilityId,
      periodId: p.id,
      date: p.startsOn,
      memo: 'Boundary',
      createdBy: actor.userId,
    };
    await raw.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'America/New_York'");
      const j = await tx.financeJournal.create({ data });
      expect(j.date.toISOString()).toBe(p.startsOn.toISOString());
    });
    for (const instant of [new Date(p.startsOn.getTime() - 1), p.endsOn])
      await expect(
        raw.financeJournal.create({ data: { ...data, date: instant } }),
      ).rejects.toThrow();
    await expect(
      raw.fiscalPeriod.update({
        where: { id: p.id },
        data: { endsOn: new Date(p.endsOn.getTime() + 1) },
      }),
    ).rejects.toThrow('immutable');
  });

  it('refuses incomplete or forged fiscal years and creates leap years atomically', async () => {
    const calendar = fiscalYearCalendar(1403);
    await expect(
      raw.fiscalYear.create({
        data: {
          facilityId: actor.facilityId,
          year: 1403,
          label: '1403',
          startsOn: calendar.startsOn,
          endsOn: calendar.endsOn,
        },
      }),
    ).rejects.toThrow('twelve');
    await expect(
      raw.fiscalYear.create({
        data: {
          facilityId: actor.facilityId,
          year: 1403,
          label: '1403',
          startsOn: new Date('2024-01-01Z'),
          endsOn: new Date('2025-01-01Z'),
        },
      }),
    ).rejects.toThrow();
    const request = { year: 1403, ...command() };
    const result = await run(() => ledger.createFiscalYear(actor, request));
    expect(await run(() => ledger.createFiscalYear(actor, request))).toEqual(result);
    expect(await raw.fiscalPeriod.count({ where: { yearId: result.id } })).toBe(12);
    const last = await raw.fiscalPeriod.findUniqueOrThrow({
      where: { yearId_month: { yearId: result.id, month: 12 } },
    });
    expect(last.endsOn.getTime() - last.startsOn.getTime()).toBe(30 * 86400000);
  });

  it('rejects cross-facility periods, reversals, actors and lines even through raw Prisma', async () => {
    const local = await run(() => ledger.createJournal(actor, input()));
    const foreign = await requestContext.run(other, () =>
      ledger.createJournal(other, {
        ...input(),
        lines: [
          { accountId: otherCash, description: '', debit: '1', credit: '0' },
          { accountId: otherCash, description: '', debit: '0', credit: '1' },
        ],
      }),
    );
    const foreignPeriod = (
      await raw.financeJournal.findUniqueOrThrow({ where: { id: foreign.id } })
    ).periodId;
    for (const data of [
      { periodId: foreignPeriod },
      { reversalOfId: foreign.id },
      { createdBy: other.userId },
      { postedBy: other.userId },
    ])
      await expect(raw.financeJournal.update({ where: { id: local.id }, data })).rejects.toThrow();
    await expect(
      raw.financeJournalLine.create({
        data: {
          facilityId: actor.facilityId,
          journalId: local.id,
          accountId: otherCash,
          debit: '1',
          credit: '0',
        },
      }),
    ).rejects.toThrow();
    await expect(
      raw.financeJournalLine.create({
        data: {
          facilityId: other.facilityId,
          journalId: local.id,
          accountId: otherCash,
          debit: '1',
          credit: '0',
        },
      }),
    ).rejects.toThrow();
    await expect(
      run(() =>
        ledger.createJournal(actor, {
          ...input(),
          lines: input().lines.map((l) => ({ ...l, accountId: otherCash })),
        }),
      ),
    ).rejects.toThrow('active accounts');
    expect(
      (await operations.workspace(other.facilityId)).journals.some((j) => j.id === local.id),
    ).toBe(false);
  });

  it('uses Decimal for large balanced sums, rejects excess precision and nonfinite storage', async () => {
    const big = input('1404-09-01', '999999999999.99');
    const j = await run(() => ledger.createJournal(actor, big));
    const posted = await run(() =>
      ledger.postJournal(reviewer, j.id, { expectedVersion: 1, ...command() }),
    );
    expect(
      posted.lines[0].debit === '999999999999.99' || posted.lines[0].credit === '999999999999.99',
    ).toBe(true);
    await expect(
      run(() => ledger.createJournal(actor, input('1404-09-01', '1.005'))),
    ).rejects.toThrow('two places');
    const pending = await run(() => ledger.createJournal(actor, input('1404-09-02')));
    await expect(
      raw.$executeRaw`INSERT INTO finance_journal_line(id,facility_id,journal_id,account_id,debit,credit) VALUES(${randomUUID()},${actor.facilityId},${pending.id},${cash},'NaN'::numeric,0)`,
    ).rejects.toThrow();
  });

  it('requires non-null facility_id and UTC timestamps on every finance table', async () => {
    const columns = await raw.$queryRaw<
      Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>
    >`
      SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND (table_name LIKE 'finance_%' OR table_name='fiscal_year')`;
    for (const table of new Set(columns.map((c) => c.table_name))) {
      expect(
        columns.find((c) => c.table_name === table && c.column_name === 'facility_id')?.is_nullable,
      ).toBe('NO');
    }
    expect(
      columns.filter(
        (c) => c.data_type === 'timestamp without time zone' || c.data_type === 'date',
      ),
    ).toHaveLength(0);
    expect(
      columns.filter((c) => c.data_type === 'double precision' || c.data_type === 'real'),
    ).toHaveLength(0);
  });
});
