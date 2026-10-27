import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import * as c from '@redmars/shared';
import { AppModule } from '../src/app.module';
import { FinanceLedgerService, FinanceActor } from '../src/modules/finance/finance-ledger.service';
import { FinanceAssetsService } from '../src/modules/finance/finance-assets.service';
import { FinanceOperationsService } from '../src/modules/finance/finance-operations.service';
import { FinancePayablesService } from '../src/modules/finance/finance-payables.service';
import { requestContext } from '../src/audit/request-context';

describe('Layer 5 assets, banking and budgets', () => {
  jest.setTimeout(60000);
  const raw = new PrismaClient(),
    key = () => ({ idempotencyKey: randomUUID() });
  let app: INestApplication<App>,
    ledger: FinanceLedgerService,
    assets: FinanceAssetsService,
    ops: FinanceOperationsService;
  let actor: FinanceActor, reviewer: FinanceActor, foreign: FinanceActor;
  let token: string,
    doctorToken: string,
    foreignToken: string,
    cash: string,
    bank: string,
    expense: string,
    centre: string,
    first: string,
    second: string;
  const run = <T>(f: () => Promise<T>) => requestContext.run(actor, f);
  const post = (id: string) =>
    requestContext.run(reviewer, async () =>
      ledger.postJournal(reviewer, id, {
        expectedVersion: (await ledger.getJournal(actor.facilityId, id)).version,
        ...key(),
      }),
    );
  const create = (extra: Record<string, unknown> = {}) =>
    run(() =>
      assets.create(
        actor,
        c.assetInputSchema.parse({
          code: randomUUID(),
          name: 'Ultrasound',
          category: 'Medical equipment',
          location: 'Ward A',
          date: '2025-03-21',
          cost: '100',
          residual: '0',
          lifeMonths: 3,
          startPeriodId: first,
          cashAccountId: cash,
          costCentreId: centre,
          ...extra,
          ...key(),
        }),
      ),
    );
  const view = async (id: string) =>
    (await assets.workspace(actor.facilityId)).assets.find((a) => a.id === id)!;
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    await app.init();
    ledger = app.get(FinanceLedgerService);
    assets = app.get(FinanceAssetsService);
    ops = app.get(FinanceOperationsService);
    const f = await raw.facility.create({ data: { code: randomUUID(), name: 'Layer 5 test' } }),
      other = await raw.facility.create({ data: { code: randomUUID(), name: 'Foreign layer 5' } });
    for (const facilityId of [f.id, other.id])
      await raw.facilityModule.create({ data: { facilityId, module: 'finance', enabled: true } });
    const user = async (facilityId: string, roleCode: string) => {
      const password = 'isolated-assets-test';
      const u = await raw.appUser.create({
        data: {
          facilityId,
          username: randomUUID(),
          fullName: 'Layer 5 ' + roleCode,
          passwordHash: await hash(password),
        },
      });
      await raw.userRole.create({
        data: {
          userId: u.id,
          roleId: (await raw.role.findUniqueOrThrow({ where: { code: roleCode } })).id,
        },
      });
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: u.username, password })
        .expect(200);
      return {
        actor: { facilityId, userId: u.id },
        token: (login.body as { accessToken: string }).accessToken,
      };
    };
    const preparer = await user(f.id, 'accountant'),
      admin = await user(f.id, 'admin'),
      outside = await user(other.id, 'admin');
    actor = preparer.actor;
    reviewer = admin.actor;
    foreign = outside.actor;
    token = preparer.token;
    foreignToken = outside.token;
    doctorToken = (await user(f.id, 'doctor')).token;
    await run(() => ledger.setup(actor, { cutoverDate: '2025-03-21', ...key() }));
    const account = async (systemKey: string) =>
      (await raw.financeAccount.findFirstOrThrow({ where: { facilityId: f.id, systemKey } })).id;
    cash = await account('cash');
    bank = await account('bank');
    expense = await account('expense');
    centre = (
      await run(() =>
        app.get(FinancePayablesService).centre(actor, { code: 'WARD', name: 'Ward A', ...key() }),
      )
    ).id;
    first = (
      await raw.fiscalPeriod.findFirstOrThrow({ where: { facilityId: f.id, label: '1404-01' } })
    ).id;
    second = (
      await raw.fiscalPeriod.findFirstOrThrow({ where: { facilityId: f.id, label: '1404-02' } })
    ).id;
  });
  afterAll(async () => {
    await app?.close();
    await raw.$disconnect();
  });
  it('enforces permissions, module gates, contracts and facility isolation', async () => {
    const server = app.getHttpServer();
    await request(server).get('/finance/assets').auth(doctorToken, { type: 'bearer' }).expect(403);
    const w = await request(server)
      .get('/finance/assets')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(c.assetsWorkspaceSchema.parse(w.body).assets).toEqual([]);
    await request(server)
      .post('/finance/assets/budgets')
      .auth(token, { type: 'bearer' })
      .send({})
      .expect(403);
    expect((await assets.workspace(foreign.facilityId)).assets).toEqual([]);
    await request(server)
      .post('/finance/assets')
      .auth(foreignToken, { type: 'bearer' })
      .send({
        code: 'X',
        name: 'x',
        category: 'x',
        location: 'x',
        date: '2025-03-21',
        cost: '1',
        residual: '0',
        lifeMonths: 1,
        startPeriodId: first,
        cashAccountId: cash,
        ...key(),
      })
      .expect(400);
    await raw.facilityModule.update({
      where: { facilityId_module: { facilityId: actor.facilityId, module: 'finance' } },
      data: { enabled: false },
    });
    await request(server).get('/finance/assets').auth(token, { type: 'bearer' }).expect(403);
    await raw.facilityModule.update({
      where: { facilityId_module: { facilityId: actor.facilityId, module: 'finance' } },
      data: { enabled: true },
    });
  });
  it('posts acquisition only after independent review; rounds monthly depreciation to the exact residual', async () => {
    const a = await create();
    expect((await view(a.id)).netBookValue).toBe('0.00');
    await expect(
      run(() => ledger.postJournal(actor, a.journalId, { expectedVersion: 1, ...key() })),
    ).rejects.toThrow('different accountant');
    await post(a.journalId);
    expect((await view(a.id)).netBookValue).toBe('100.00');
    const r = await run(() => assets.generate(actor, { through: '2025-06-22', ...key() }));
    expect(r.errors).toEqual([]);
    expect(r.created).toBe(3);
    const v = await view(a.id);
    expect(v.entries.filter((e) => e.kind === 'depreciation').map((e) => e.amount)).toEqual([
      '33.33',
      '33.33',
      '33.34',
    ]);
    expect(v.depreciation).toBe('0.00');
    for (const e of v.entries.filter((e) => e.kind === 'depreciation')) await post(e.journalId);
    expect((await view(a.id)).netBookValue).toBe('0.00');
    const rerun = await run(() => assets.generate(actor, { through: '2025-06-22', ...key() }));
    expect(rerun.created).toBe(0);
    expect(await assets.source(actor.facilityId, a.journalId)).toMatchObject({ assetId: a.id });
    expect(await assets.source(foreign.facilityId, a.journalId)).toBeNull();
    await expect(
      raw.financeAsset.update({ where: { id: a.id }, data: { cost: '101' } }),
    ).rejects.toThrow('immutable');
  });
  it('serializes concurrent depreciation runs and computes disposal gain with reversals', async () => {
    const a = await create({ cost: '1200', residual: '200', lifeMonths: 10 });
    await post(a.journalId);
    const rs = await Promise.all([
      run(() => assets.generate(actor, { through: '2025-04-21', ...key() })),
      run(() => assets.generate(actor, { through: '2025-04-21', ...key() })),
    ]);
    expect(rs.flatMap((r) => r.errors)).toEqual([]);
    let v = await view(a.id);
    expect(v.entries.filter((e) => e.kind === 'depreciation')).toHaveLength(1);
    const dep = v.entries.find((e) => e.kind === 'depreciation')!;
    await expect(
      run(() =>
        assets.dispose(actor, a.id, {
          date: '2025-04-22',
          proceeds: '1200',
          cashAccountId: bank,
          reason: 'Sale',
          ...key(),
        }),
      ),
    ).rejects.toThrow('Post acquisition');
    await post(dep.journalId);
    const disposal = await run(() =>
      assets.dispose(actor, a.id, {
        date: '2025-04-22',
        proceeds: '1200',
        cashAccountId: bank,
        reason: 'Sale',
        ...key(),
      }),
    );
    expect(disposal).toMatchObject({ netBookValue: '1100.00', gainLoss: '100.00' });
    await post(disposal.journalId);
    v = await view(a.id);
    expect(v.status).toBe('disposed');
    expect(v.netBookValue).toBe('0.00');
    await expect(
      run(() =>
        ledger.reverse(actor, a.journalId, { date: '2025-04-22', reason: 'wrong order', ...key() }),
      ),
    ).rejects.toThrow();
    const reversal = await run(() =>
      ledger.reverse(actor, disposal.journalId, {
        date: '2025-04-22',
        reason: 'Sale cancelled',
        ...key(),
      }),
    );
    await post(reversal.id);
    expect((await view(a.id)).netBookValue).toBe('1100.00');
    const loss = await run(() =>
      assets.dispose(actor, a.id, {
        date: '2025-04-22',
        proceeds: '0',
        reason: 'Write-off',
        ...key(),
      }),
    );
    expect(loss.gainLoss).toBe('-1100.00');
    await post(loss.journalId);
  });
  it('capitalizes part of a posted supplier bill without duplicating AP and reserves drafts', async () => {
    const s = await run(() =>
      ops.createSupplier(actor, { name: 'Asset vendor', reference: 'AV', ...key() }),
    );
    const b = await run(() =>
      ops.bill(actor, {
        supplierId: s.id,
        reference: randomUUID(),
        date: '2025-03-21',
        dueOn: '2025-04-21',
        expenseAccountId: expense,
        amount: '500',
        memo: 'Equipment purchase',
        ...key(),
      }),
    );
    await post(b.journalId);
    const l = await raw.financeJournalLine.findFirstOrThrow({
      where: { journalId: b.journalId, debit: { gt: 0 } },
    });
    const a = await create({ cost: '300', billLineId: l.id, cashAccountId: undefined });
    await expect(
      create({ cost: '201', billLineId: l.id, cashAccountId: undefined }),
    ).rejects.toThrow('remaining bill');
    const j = await ledger.getJournal(actor.facilityId, a.journalId);
    expect(j.lines.some((l) => l.accountId === expense && l.credit === '300.00')).toBe(true);
    await post(a.journalId);
    await expect(
      run(() =>
        ledger.reverse(actor, b.journalId, {
          date: '2025-03-22',
          reason: 'Cannot reverse allocated bill',
          ...key(),
        }),
      ),
    ).rejects.toThrow();
    expect((await view(a.id)).billReference).toBeTruthy();
    const pending = await create({ cost: '200', billLineId: l.id, cashAccountId: undefined });
    await run(() => ledger.deleteDraft(actor, pending.journalId, { expectedVersion: 1, ...key() }));
    expect((await assets.workspace(actor.facilityId)).assets.some((a) => a.id === pending.id)).toBe(
      false,
    );
  });
  it('rejects altered generated journal amounts at posting', async () => {
    const a = await create({ cost: '70' });
    // Existing ledger allows draft-line edits at the DB level; source guards must catch tampering.
    const lines = await raw.financeJournalLine.findMany({ where: { journalId: a.journalId } });
    for (const l of lines)
      await raw.financeJournalLine.update({
        where: { id: l.id },
        data: l.debit.gt(0) ? { debit: '71' } : { credit: '71' },
      });
    await expect(post(a.journalId)).rejects.toThrow('source amounts');
    await run(() => ledger.deleteDraft(actor, a.journalId, { expectedVersion: 1, ...key() }));
  });
  it('prepares idempotent same-facility transfers and reverses their cash effects', async () => {
    const input = {
      date: '2025-03-23',
      fromAccountId: cash,
      toAccountId: bank,
      amount: '45.67',
      reference: 'Bank transfer',
      ...key(),
    };
    const a = await run(() => assets.transfer(actor, input)),
      b = await run(() => assets.transfer(actor, input));
    expect(a.id).toBe(b.id);
    await post(a.id);
    const j = await ledger.getJournal(actor.facilityId, a.id);
    expect(j.lines.find((l) => l.accountId === bank)?.debit).toBe('45.67');
    expect(j.lines.find((l) => l.accountId === cash)?.credit).toBe('45.67');
    expect(c.transferInputSchema.safeParse({ ...input, toAccountId: cash }).success).toBe(false);
    await expect(
      requestContext.run(foreign, () => assets.transfer(foreign, { ...input, ...key() })),
    ).rejects.toThrow('cash/bank');
    const rev = await run(() =>
      ledger.reverse(actor, a.id, { date: '2025-03-24', reason: 'Transfer cancelled', ...key() }),
    );
    await post(rev.id);
  });
  it('supports 1404 departmental budgets, posted-only actuals and optimistic revisions', async () => {
    const input = {
      periodId: second,
      accountId: expense,
      costCentreId: centre,
      amount: '100',
      expectedVersion: 0,
      ...key(),
    };
    await run(() => assets.budget(actor, input));
    await expect(
      run(() => assets.budget(actor, { ...input, amount: '101', ...key() })),
    ).rejects.toThrow('changed');
    await expect(
      run(() => assets.budget(actor, { ...input, costCentreId: null, ...key() })),
    ).rejects.toThrow('whole-facility');
    const j = await run(() =>
      ledger.createJournal(actor, {
        date: '2025-04-22',
        memo: 'Department expense',
        lines: [
          { accountId: expense, costCentreId: centre, debit: '125', credit: '0', description: '' },
          { accountId: cash, debit: '0', credit: '125', description: '' },
        ],
        ...key(),
      }),
    );
    const row = async () =>
      (await assets.report(actor.facilityId, 1404)).rows.find(
        (r) => r.periodId === second && r.accountId === expense && r.costCentreId === centre,
      )!;
    expect((await row()).actual).toBe('0.00');
    await post(j.id);
    expect(await row()).toMatchObject({
      actual: '125.00',
      variance: '25.00',
      favorable: false,
      version: 1,
    });
    await run(() =>
      assets.budget(actor, { ...input, amount: '150', expectedVersion: 1, ...key() }),
    );
    expect(await row()).toMatchObject({ variance: '-25.00', favorable: true, version: 2 });
    const rev = await run(() =>
      ledger.reverse(actor, j.id, { date: '2025-04-23', reason: 'Correction', ...key() }),
    );
    await post(rev.id);
    expect((await row()).actual).toBe('0.00');
    expect(
      c.budgetReportSchema.safeParse(await assets.report(actor.facilityId, 1404)).success,
    ).toBe(true);
    expect((await assets.report(foreign.facilityId, 1404)).rows).toEqual([]);
    const report = await assets.report(actor.facilityId, 1404);
    expect(report.rows.some((r) => r.budget === null && r.actual !== '0.00')).toBe(true);
  });
  it('does not schedule a current month and exposes blocked historical periods', async () => {
    await expect(
      run(() => assets.generate(actor, { through: '2090-01-01', ...key() })),
    ).rejects.toThrow('completed months');
    const p = await raw.fiscalPeriod.findFirstOrThrow({
      where: { facilityId: actor.facilityId, label: '1404-12' },
    });
    const a = await create({ startPeriodId: p.id, date: '2026-03-01', lifeMonths: 1, cost: '1' });
    await post(a.journalId);
    const r = await run(() => assets.generate(actor, { through: '2026-03-10', ...key() }));
    expect((await view(a.id)).entries).toHaveLength(1);
    expect(r.errors).toEqual([]);
  });
  it('blocks period close until depreciation is posted, then locks the budget', async () => {
    const p = await raw.fiscalPeriod.findFirstOrThrow({
      where: { facilityId: actor.facilityId, label: '1404-10' },
    });
    const a = await create({ startPeriodId: p.id, date: '2025-12-23', lifeMonths: 1, cost: '10' });
    await post(a.journalId);
    await expect(run(() => ledger.closePeriod(actor, p.id, key()))).rejects.toThrow('depreciation');
    await assets.scheduled();
    const v = await view(a.id),
      dep = v.entries.find((e) => e.kind === 'depreciation')!;
    expect(dep.amount).toBe('10.00');
    expect(dep.status).toBe('draft');
    await post(dep.journalId);
    await run(() => ledger.closePeriod(actor, p.id, key()));
    await expect(
      run(() =>
        assets.budget(actor, {
          periodId: p.id,
          accountId: expense,
          amount: '100',
          expectedVersion: 0,
          ...key(),
        }),
      ),
    ).rejects.toThrow('open Shamsi');
    const before = await raw.financeAssetEntry.count({ where: { assetId: a.id } });
    await assets.scheduled();
    expect(await raw.financeAssetEntry.count({ where: { assetId: a.id } })).toBe(before);
    expect((await assets.workspace(actor.facilityId)).scheduler.lastRun).toBeTruthy();
  });
});
