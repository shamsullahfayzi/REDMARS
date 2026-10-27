import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import * as c from '@redmars/shared';
import { AppModule } from '../src/app.module';
import {
  FinanceLedgerService,
  FinanceActor,
  day,
} from '../src/modules/finance/finance-ledger.service';
import { FinanceStatementsService } from '../src/modules/finance/finance-statements.service';
import { FinanceCloseService } from '../src/modules/finance/finance-close.service';
import { FinanceOperationsService } from '../src/modules/finance/finance-operations.service';
import { FinanceAssetsService } from '../src/modules/finance/finance-assets.service';
import { requestContext } from '../src/audit/request-context';

describe('Layer 6 statements and closing', () => {
  jest.setTimeout(60000);
  const raw = new PrismaClient(),
    key = () => ({ idempotencyKey: randomUUID() }),
    reason = () => ({ reason: 'Verified test reconciliation', ...key() });
  let app: INestApplication<App>,
    ledger: FinanceLedgerService,
    reports: FinanceStatementsService,
    closing: FinanceCloseService,
    ops: FinanceOperationsService;
  let actor: FinanceActor,
    reviewer: FinanceActor,
    foreign: FinanceActor,
    token: string,
    auditorToken: string,
    foreignToken: string;
  let cash: string,
    bank: string,
    expense: string,
    revenue: string,
    opening: string,
    centre: string,
    first: string,
    year: string;
  const query = { from: '2025-03-21', to: '2026-03-20' };
  const run = <T>(f: () => Promise<T>, who = actor) => requestContext.run(who, f);
  const post = (id: string) =>
    run(
      async () =>
        ledger.postJournal(reviewer, id, {
          expectedVersion: (await ledger.getJournal(actor.facilityId, id)).version,
          ...key(),
        }),
      reviewer,
    );
  const journal = async (
    lines: Array<{ accountId: string; debit: string; credit: string; costCentreId?: string }>,
    on = '2025-03-22',
    posted = true,
  ) => {
    const j = await run(() =>
      ledger.createJournal(actor, {
        date: on,
        memo: 'Layer 6 statement test',
        lines: lines.map((l) => ({ ...l, description: 'Test' })),
        ...key(),
      }),
    );
    if (posted) await post(j.id);
    return j;
  };
  const pack = () => reports.pack(actor, query);
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    await app.init();
    ledger = app.get(FinanceLedgerService);
    reports = app.get(FinanceStatementsService);
    closing = app.get(FinanceCloseService);
    ops = app.get(FinanceOperationsService);
    const f = await raw.facility.create({
        data: { code: randomUUID(), name: 'Layer 6 report test' },
      }),
      other = await raw.facility.create({
        data: { code: randomUUID(), name: 'Layer 6 group member' },
      });
    for (const facilityId of [f.id, other.id])
      await raw.facilityModule.create({ data: { facilityId, module: 'finance', enabled: true } });
    const user = async (facilityId: string, role: string) => {
      const u = await raw.appUser.create({
        data: {
          facilityId,
          username: randomUUID(),
          fullName: 'Layer 6 ' + role,
          passwordHash: await hash('isolated-reports-test'),
        },
      });
      await raw.userRole.create({
        data: {
          userId: u.id,
          roleId: (await raw.role.findUniqueOrThrow({ where: { code: role } })).id,
        },
      });
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: u.username, password: 'isolated-reports-test' })
        .expect(200);
      return {
        actor: { userId: u.id, facilityId },
        token: (login.body as { accessToken: string }).accessToken,
        username: u.username,
      };
    };
    const preparer = await user(f.id, 'accountant'),
      admin = await user(f.id, 'admin'),
      outsider = await user(other.id, 'admin'),
      auditor = await user(f.id, 'auditor');
    actor = preparer.actor;
    reviewer = admin.actor;
    foreign = outsider.actor;
    token = preparer.token;
    auditorToken = auditor.token;
    foreignToken = outsider.token;
    await run(() => ledger.setup(actor, { cutoverDate: query.from, ...key() }));
    await run(() => ledger.setup(foreign, { cutoverDate: query.from, ...key() }), foreign);
    const account = async (systemKey: string) =>
      (await raw.financeAccount.findFirstOrThrow({ where: { facilityId: f.id, systemKey } })).id;
    cash = await account('cash');
    bank = await account('bank');
    expense = await account('expense');
    opening = await account('opening');
    revenue = (
      await run(() =>
        ledger.createAccount(
          actor,
          c.financeAccountInputSchema.parse({
            code: '4998',
            name: 'Other test income',
            type: 'revenue',
            ...key(),
          }),
        ),
      )
    ).id;
    centre = (
      await raw.financeCostCentre.create({
        data: { facilityId: f.id, code: 'WARD', name: 'Ward A' },
      })
    ).id;
    const p = await raw.fiscalPeriod.findFirstOrThrow({
      where: { facilityId: f.id, label: '1404-01' },
    });
    first = p.id;
    year = p.yearId;
  });
  afterAll(async () => {
    await app?.close();
    await raw.$disconnect();
  });
  it('builds exact accrual, balance-sheet, department and cash totals; excludes drafts', async () => {
    await journal([
      { accountId: cash, debit: '2000', credit: '0' },
      { accountId: opening, debit: '0', credit: '2000' },
    ]);
    await journal([
      { accountId: cash, debit: '1000', credit: '0' },
      { accountId: revenue, debit: '0', credit: '1000', costCentreId: centre },
    ]);
    await journal([
      { accountId: expense, debit: '250', credit: '0', costCentreId: centre },
      { accountId: cash, debit: '0', credit: '250' },
    ]);
    const draft = await journal(
      [
        { accountId: cash, debit: '999', credit: '0' },
        { accountId: revenue, debit: '0', credit: '999' },
      ],
      '2025-03-22',
      false,
    );
    const p = await pack();
    expect(p.totals).toMatchObject({
      income: '1000.00',
      expenses: '250.00',
      netIncome: '750.00',
      assets: '2750.00',
      balanceDifference: '0.00',
    });
    expect(p.cash).toMatchObject({
      closing: '2750.00',
      operating: '750.00',
      financing: '2000.00',
      difference: '0.00',
      income: '1000.00',
      expenses: '250.00',
    });
    expect(p.departments).toEqual([
      {
        facility: 'Layer 6 report test',
        name: 'Ward A',
        income: '1000.00',
        expenses: '250.00',
        netIncome: '750.00',
      },
    ]);
    await run(() => ledger.deleteDraft(actor, draft.id, { expectedVersion: 1, ...key() }));
    const later = await reports.pack(actor, { from: '2025-04-21', to: '2025-05-21' });
    expect(later.totals.netIncome).toBe('0.00');
    expect(later.cash.opening).toBe('2750.00');
  });
  it('traces partial supplier payments and excludes internal cash transfers', async () => {
    const supplier = await run(() =>
      ops.createSupplier(actor, { name: 'Reporting supplier', reference: null, ...key() }),
    );
    const bill = await run(() =>
      ops.bill(actor, {
        date: '2025-03-23',
        dueOn: '2025-04-23',
        supplierId: supplier.id,
        reference: 'REP-1',
        memo: 'Supplies',
        expenseAccountId: expense,
        amount: '300',
        ...key(),
      }),
    );
    await post(bill.journalId);
    const paid = await run(() =>
      ops.settle(actor, bill.id, {
        date: '2025-03-24',
        memo: 'Partial payment',
        cashAccountId: cash,
        amount: '100',
        ...key(),
      }),
    );
    await post(paid.journalId);
    const before = await pack();
    expect(before.totals.payables).toBe('200.00');
    expect(before.cash.expenses).toBe('350.00');
    const transfer = await run(() =>
      app.get(FinanceAssetsService).transfer(actor, {
        date: '2025-03-25',
        fromAccountId: cash,
        toAccountId: bank,
        amount: '500',
        reference: 'T1',
        ...key(),
      }),
    );
    await post(transfer.id);
    const after = await pack();
    expect(after.cash.closing).toBe(before.cash.closing);
    expect(after.cash.receipts).toBe(before.cash.receipts);
    expect(after.cash.payments).toBe(before.cash.payments);
    expect(after.cash.rows.some((r) => r.journalId === transfer.id)).toBe(false);
  });
  it('supports versioned custom layouts and rejects cross-facility account mappings', async () => {
    const t = await run(() =>
      reports.template(actor, {
        name: 'Donor demonstration',
        authority: 'Hospital-approved layout required',
        definition: [
          {
            label: 'Ward income',
            accountIds: [revenue],
            measure: 'movement',
            sign: 'credit',
            costCentreId: centre,
          },
          { label: 'Cash at bank', accountIds: [bank], measure: 'closing', sign: 'debit' },
        ],
        expectedVersion: 0,
        ...key(),
      }),
    );
    expect((await reports.custom(actor, t.id, query)).rows.map((r) => r.amount)).toEqual([
      '1000.00',
      '500.00',
    ]);
    await expect(reports.custom(foreign, t.id, query)).rejects.toThrow('not found');
    await expect(
      run(
        () =>
          reports.template(foreign, {
            name: 'Bad',
            authority: 'Test',
            definition: [
              { label: 'Leaked', accountIds: [revenue], measure: 'closing', sign: 'credit' },
            ],
            expectedVersion: 0,
            ...key(),
          }),
        foreign,
      ),
    ).rejects.toThrow('this facility');
    await expect(
      run(() =>
        reports.template(actor, {
          name: t.name,
          authority: t.authority,
          definition: [],
          expectedVersion: 0,
          ...key(),
        }),
      ),
    ).rejects.toThrow('changed');
  });
  it('limits group reporting to explicit grants and immediately revokes access', async () => {
    const q = { ...query, facilityIds: actor.facilityId + ',' + foreign.facilityId };
    await expect(reports.pack(foreign, q)).rejects.toThrow('not granted');
    await run(
      () =>
        reports.grant(reviewer, {
          viewerId: foreign.userId,
          active: true,
          reason: 'Group review',
          expectedVersion: 0,
          ...key(),
        }),
      reviewer,
    );
    const combined = await reports.pack(foreign, q);
    expect(combined.facilities).toHaveLength(2);
    expect(combined.totals.netIncome).toBe((await pack()).totals.netIncome);
    expect(combined.warnings.join(' ')).toContain('without inter-facility eliminations');
    await raw.facilityModule.update({
      where: { facilityId_module: { facilityId: actor.facilityId, module: 'finance' } },
      data: { enabled: false },
    });
    await expect(reports.pack(foreign, q)).rejects.toThrow('disabled');
    await raw.facilityModule.update({
      where: { facilityId_module: { facilityId: actor.facilityId, module: 'finance' } },
      data: { enabled: true },
    });
    await run(
      () =>
        reports.grant(reviewer, {
          viewerId: foreign.userId,
          active: false,
          reason: 'Review ended',
          expectedVersion: 1,
          ...key(),
        }),
      reviewer,
    );
    await expect(reports.pack(foreign, q)).rejects.toThrow('not granted');
  });
  it('enforces auditor read-only access and exports a genuine Excel workbook', async () => {
    const server = app.getHttpServer(),
      url = '/finance/statements?' + new URLSearchParams(query).toString();
    await request(server).get(url).auth(auditorToken, { type: 'bearer' }).expect(200);
    await request(server)
      .post('/finance/statements/templates')
      .auth(auditorToken, { type: 'bearer' })
      .send({})
      .expect(403);
    await request(server)
      .post('/finance/statements/access')
      .auth(token, { type: 'bearer' })
      .send({})
      .expect(403);
    await request(server)
      .get(
        '/finance/statements?' +
          new URLSearchParams({ ...query, facilityIds: actor.facilityId }).toString(),
      )
      .auth(foreignToken, { type: 'bearer' })
      .expect(403);
    const exported = await request(server)
      .get('/finance/statements/excel?' + new URLSearchParams(query).toString())
      .auth(auditorToken, { type: 'bearer' })
      .expect(200);
    const b = Buffer.from((exported.body as { base64: string }).base64, 'base64');
    expect(b.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(b.toString()).toContain('xl/workbook.xml');
  });
  it('classifies mixed cash journals without losing offsetting receipts and payments', async () => {
    const j = await journal([
      { accountId: cash, debit: '10', credit: '0' },
      { accountId: revenue, debit: '0', credit: '10' },
      { accountId: expense, debit: '10', credit: '0' },
      { accountId: cash, debit: '0', credit: '10' },
    ]);
    expect(
      (await pack()).cash.rows.filter((r) => r.journalId === j.id).map((r) => r.category),
    ).toEqual(['unclassified', 'unclassified']);
    const allocation = {
      rows: [
        {
          category: 'operating' as const,
          accountId: revenue,
          amount: '10.00',
          label: 'Cash income',
        },
        {
          category: 'operating' as const,
          accountId: expense,
          amount: '-10.00',
          label: 'Cash expense',
        },
      ],
      reason: 'Verified cash allocations',
      expectedVersion: 0,
      ...key(),
    };
    await run(() => reports.classify(actor, j.id, allocation));
    expect(
      (await pack()).cash.rows.filter((r) => r.journalId === j.id).map((r) => r.amount),
    ).toEqual(['10.00', '-10.00']);
    await expect(
      run(() => reports.classify(actor, j.id, { ...allocation, ...key() })),
    ).rejects.toThrow('changed');
    const reversed = await run(() =>
      ledger.reverse(actor, j.id, { date: '2025-03-28', reason: 'Test reversal', ...key() }),
    );
    await post(reversed.id);
    expect(
      (await pack()).cash.rows.filter((r) => r.journalId === reversed.id).map((r) => r.amount),
    ).toEqual(['-10.00', '10.00']);
  });
  it('reports the full asset-disposal proceeds as investing cash', async () => {
    const assets = app.get(FinanceAssetsService);
    const a = await run(() =>
      assets.create(actor, {
        code: randomUUID(),
        name: 'Reporting equipment',
        category: 'Equipment',
        location: 'Ward',
        date: '2025-03-26',
        cost: '50',
        residual: '0',
        lifeMonths: 12,
        startPeriodId: first,
        cashAccountId: cash,
        ...key(),
      }),
    );
    await post(a.journalId);
    const disposed = await run(() =>
      assets.dispose(actor, a.id, {
        date: '2025-03-27',
        proceeds: '60',
        cashAccountId: cash,
        reason: 'Sale',
        ...key(),
      }),
    );
    await post(disposed.journalId);
    const rows = (await pack()).cash.rows.filter((r) => r.journalId === disposed.journalId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: 'investing', amount: '60.00', plType: null });
  });
  it('requires reconciliations before close and logs close, lock and reopen', async () => {
    const before = await closing.checklist(actor, first);
    expect(before.checks.find((c) => c.key === 'cash')?.passed).toBe(false);
    await expect(
      run(() => closing.action(reviewer, first, 'close', reason()), reviewer),
    ).rejects.toThrow('Cash and bank');
    for (const accountId of [cash, bank]) {
      const lines = await raw.financeJournalLine.findMany({
        where: { accountId, journal: { status: 'posted' } },
        include: { journal: true },
        orderBy: { id: 'asc' },
      });
      const balance = lines.reduce(
        (s, l) => s.add(l.baseDebit.toFixed(2)).minus(l.baseCredit.toFixed(2)),
        c.moneyDecimal('0'),
      );
      const statement = await run(() =>
        ops.statement(actor, {
          accountId,
          reference: 'Full year verification',
          startsOn: query.from,
          endsOn: query.to,
          openingBalance: '0',
          closingBalance: balance.toFixed(2),
          lines: lines.map((l) => ({
            date: day(l.journal.date),
            description: l.id,
            amount: c
              .moneyDecimal(l.baseDebit.toFixed(2))
              .minus(l.baseCredit.toFixed(2))
              .toFixed(2),
          })),
          ...key(),
        }),
      );
      const sl = await raw.financeStatementLine.findMany({ where: { statementId: statement.id } });
      for (const l of sl)
        await run(() => ops.match(actor, l.id, { journalLineId: l.description, ...key() }));
      await run(() => ops.reconcile(actor, statement.id, key()));
    }
    expect((await closing.checklist(actor, first)).canClose).toBe(true);
    await run(() => closing.action(reviewer, first, 'close', reason()), reviewer);
    await run(() => closing.action(reviewer, first, 'lock', reason()), reviewer);
    await expect(
      raw.fiscalPeriod.update({
        where: { id: first },
        data: { closedAt: null, closedBy: null, lockedAt: null, lockedBy: null },
      }),
    ).rejects.toThrow('logged');
    await run(() => closing.action(reviewer, first, 'reopen', reason()), reviewer);
    const reopened = await closing.checklist(actor, first);
    expect(reopened.state).toBe('open');
    expect(reopened.events.map((e) => e.action)).toEqual(['reopen', 'lock', 'close']);
    await expect(
      raw.financePeriodEvent.delete({ where: { id: reopened.events[0].id } }),
    ).rejects.toThrow();
  });
  it('prepares reviewed year-end earnings, preserves historical P&L and carries balances forward', async () => {
    const periods = await raw.fiscalPeriod.findMany({
      where: { yearId: year },
      orderBy: { month: 'asc' },
    });
    for (const p of periods.slice(0, 11))
      await run(() => closing.action(reviewer, p.id, 'close', reason()), reviewer);
    const before = await pack();
    const prepared = await run(() => closing.year(actor, year, 'prepare', reason()));
    expect('journalId' in prepared && prepared.journalId).toBeTruthy();
    const journalId = (prepared as { journalId: string }).journalId;
    await expect(
      run(() => ledger.postJournal(actor, journalId, { expectedVersion: 1, ...key() })),
    ).rejects.toThrow('different accountant');
    await expect(
      journal(
        [
          { accountId: expense, debit: '1', credit: '0' },
          { accountId: opening, debit: '0', credit: '1' },
        ],
        '2026-03-01',
      ),
    ).rejects.toThrow('freezes');
    const line = await raw.financeJournalLine.findFirstOrThrow({ where: { journalId } });
    await expect(
      raw.financeJournalLine.update({ where: { id: line.id }, data: { description: 'Tampered' } }),
    ).rejects.toThrow('freezes');
    await post(journalId);
    await expect(run(() => closing.year(actor, year, 'finalize', reason()))).rejects.toThrow(
      'independent',
    );
    await run(() => closing.year(reviewer, year, 'finalize', reason()), reviewer);
    const after = await pack();
    expect(after.totals.income).toBe(before.totals.income);
    expect(after.totals.netIncome).toBe(before.totals.netIncome);
    expect(after.totals.unclosedResult).toBe('0.00');
    expect(after.totals.balanceDifference).toBe('0.00');
    expect((await ledger.report(actor.facilityId, query.from, query.to)).netIncome).toBe(
      before.totals.netIncome,
    );
    expect(
      after.accounts
        .filter((a) => ['revenue', 'expense'].includes(a.type))
        .every((a) => a.closing === '0.00'),
    ).toBe(true);
    expect(await raw.fiscalPeriod.count({ where: { yearId: year, lockedAt: { not: null } } })).toBe(
      12,
    );
    expect(
      await raw.fiscalYear.count({ where: { facilityId: actor.facilityId, year: 1405 } }),
    ).toBe(1);
    const next = await reports.pack(actor, { from: '2026-03-21', to: '2026-04-20' });
    expect(next.cash.opening).toBe(before.cash.closing);
    expect(next.totals.netIncome).toBe('0.00');
    await expect(
      run(() => closing.action(reviewer, first, 'reopen', reason()), reviewer),
    ).rejects.toThrow('year-end');
    await expect(
      run(() => closing.year(reviewer, year, 'finalize', reason()), reviewer),
    ).rejects.toThrow('finalized');
  });
});
