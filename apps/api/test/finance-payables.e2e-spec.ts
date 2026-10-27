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
import { FinancePayablesService } from '../src/modules/finance/finance-payables.service';
import { FinanceOperationsService } from '../src/modules/finance/finance-operations.service';
import { requestContext } from '../src/audit/request-context';

describe('Layer 3 supplier and procurement accounting', () => {
  jest.setTimeout(60000);
  const raw = new PrismaClient(),
    key = () => ({ idempotencyKey: randomUUID() }),
    on = '2026-09-25';
  let app: INestApplication<App>,
    ledger: FinanceLedgerService,
    ap: FinancePayablesService,
    ops: FinanceOperationsService;
  let actor: FinanceActor,
    reviewer: FinanceActor,
    foreign: FinanceActor,
    token: string,
    doctorToken: string,
    foreignToken: string;
  let cash: string, expense: string, inventory: string, centre: string;
  const run = <T>(fn: () => Promise<T>) => requestContext.run(actor, fn);
  const post = async (id: string) =>
    requestContext.run(reviewer, async () =>
      ledger.postJournal(reviewer, id, {
        expectedVersion: (await ledger.getJournal(actor.facilityId, id)).version,
        ...key(),
      }),
    );
  const supplier = () =>
    run(() =>
      ops.createSupplier(actor, {
        name: 'Supplier ' + randomUUID(),
        termsDays: 15,
        terms: 'Net 15',
        contact: 'Test contact',
        ...key(),
      }),
    );
  const bill = (supplierId: string, amount = '100', dueOn = '2026-09-30') =>
    run(() =>
      ap.charge(actor, {
        mode: 'payable',
        supplierId,
        reference: randomUUID(),
        memo: 'Medical supplies',
        date: on,
        dueOn,
        accountId: expense,
        costCentreId: centre,
        amount,
        ...key(),
      }),
    );
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    await app.init();
    ledger = app.get(FinanceLedgerService);
    ap = app.get(FinancePayablesService);
    ops = app.get(FinanceOperationsService);
    const f = await raw.facility.create({
        data: { code: randomUUID(), name: 'Layer 3 isolated test' },
      }),
      other = await raw.facility.create({ data: { code: randomUUID(), name: 'Foreign AP test' } });
    for (const facilityId of [f.id, other.id])
      await raw.facilityModule.create({ data: { facilityId, module: 'finance', enabled: true } });
    const user = async (facilityId: string, roleCode: string) => {
      const password = 'isolated-test-password';
      const u = await raw.appUser.create({
        data: {
          facilityId,
          username: randomUUID(),
          fullName: 'AP test ' + roleCode,
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
    const admin = await user(f.id, 'admin'),
      accountant = await user(f.id, 'accountant'),
      doctor = await user(f.id, 'doctor'),
      outside = await user(other.id, 'admin');
    actor = admin.actor;
    reviewer = accountant.actor;
    token = accountant.token;
    doctorToken = doctor.token;
    foreign = outside.actor;
    foreignToken = outside.token;
    await run(() => ledger.setup(actor, { cutoverDate: '2026-09-01', ...key() }));
    await requestContext.run(foreign, () =>
      ledger.setup(foreign, { cutoverDate: '2026-09-01', ...key() }),
    );
    const accounts = await raw.financeAccount.findMany({ where: { facilityId: f.id } });
    cash = accounts.find((a) => a.systemKey === 'cash')!.id;
    expense = accounts.find((a) => a.systemKey === 'expense')!.id;
    inventory = accounts.find((a) => a.code === '1200')!.id;
    centre = (await run(() => ap.centre(actor, { code: 'PHARM', name: 'Pharmacy', ...key() }))).id;
    await run(() =>
      ap.mapping(actor, {
        category: 'Medical supplies',
        accountId: expense,
        costCentreId: centre,
        ...key(),
      }),
    );
    await run(() =>
      ap.mapping(actor, {
        category: 'Pharmacy inventory',
        accountId: inventory,
        costCentreId: centre,
        ...key(),
      }),
    );
  });
  afterAll(async () => {
    await app?.close();
    await raw.$disconnect();
  });

  it('enforces finance role/module/facility boundaries and validates Excel CSV', async () => {
    const server = app.getHttpServer();
    const w = await request(server)
      .get('/finance/payables')
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(c.payablesWorkspaceSchema.safeParse(w.body).success).toBe(true);
    await request(server)
      .get('/finance/payables')
      .set('Authorization', 'Bearer ' + doctorToken)
      .expect(403);
    await request(server)
      .post('/finance/payables/centres')
      .set('Authorization', 'Bearer ' + token)
      .send({ code: 'NO', name: 'No access', ...key() })
      .expect(403);
    const csv =
      '\uFEFFsourceLineId,description,quantity,unitCost,category\r\n1,"Gauze, sterile",3,0.10,Medical supplies\r\n';
    const preview = await request(server)
      .post('/finance/payables/receipts/preview')
      .set('Authorization', 'Bearer ' + token)
      .send({ csv })
      .expect(201);
    expect((preview.body as { lines: Array<{ description: string }> }).lines[0].description).toBe(
      'Gauze, sterile',
    );
    await request(server)
      .post('/finance/payables/receipts/preview')
      .set('Authorization', 'Bearer ' + token)
      .send({ csv: csv + '"unclosed' })
      .expect(400);
    await request(server)
      .post('/finance/payables/receipts/preview')
      .set('Authorization', 'Bearer ' + token)
      .send({ csv: csv.replace('0.10', 'NaN') })
      .expect(400);
    const s = await supplier();
    await request(server)
      .get(`/finance/payables/suppliers/${s.id}/statement?from=2026-09-01&to=2026-10-31`)
      .set('Authorization', 'Bearer ' + foreignToken)
      .expect(404);
    await raw.facilityModule.update({
      where: { facilityId_module: { facilityId: actor.facilityId, module: 'finance' } },
      data: { enabled: false },
    });
    await request(server)
      .get('/finance/payables')
      .set('Authorization', 'Bearer ' + token)
      .expect(403);
    await raw.facilityModule.update({
      where: { facilityId_module: { facilityId: actor.facilityId, module: 'finance' } },
      data: { enabled: true },
    });
  });

  it('uses supplier terms, retains edits in immutable audit and posts opening AP once', async () => {
    const s = await supplier();
    expect(s.termsDays).toBe(15);
    await run(() =>
      ap.updateSupplier(actor, s.id, {
        name: s.name,
        reference: 'Vendor-1',
        contact: 'Updated contact',
        termsDays: 30,
        terms: 'Net 30',
        isActive: true,
        ...key(),
      }),
    );
    const terms = await run(() =>
      ap.charge(actor, {
        mode: 'payable',
        supplierId: s.id,
        reference: 'TERMS',
        memo: 'Rent',
        date: on,
        category: 'Medical supplies',
        amount: '1',
        ...key(),
      }),
    );
    expect(
      (
        await raw.financeBill.findUniqueOrThrow({ where: { journalId: terms.journalId } })
      ).dueOn.toISOString(),
    ).toBe('2026-10-24T19:30:00.000Z');
    const input = {
      supplierId: s.id,
      reference: 'OPEN-1',
      dueOn: '2026-08-15',
      amount: '123.45',
      ...key(),
    };
    const opening = await run(() => ap.opening(actor, input));
    expect(await run(() => ap.opening(actor, input))).toEqual(opening);
    expect((await ap.report(actor.facilityId, '2026-09-01', s.id)).total).toBe('0.00');
    await post(opening.journalId);
    expect((await ap.report(actor.facilityId, '2026-09-01', s.id)).total).toBe('123.45');
    await expect(run(() => ap.opening(actor, { ...input, ...key() }))).rejects.toThrow();
    expect(
      await raw.financeAudit.count({ where: { facilityId: actor.facilityId, entityId: s.id } }),
    ).toBeGreaterThanOrEqual(2);
  });

  it('maps expenses and asset purchases to accounts and preserves cost centres on reversal', async () => {
    const before = await ledger.report(actor.facilityId, on, on);
    const paid = await run(() =>
      ap.charge(actor, {
        mode: 'cash',
        date: on,
        memo: 'Direct supplies',
        category: 'Medical supplies',
        cashAccountId: cash,
        amount: '10.25',
        ...key(),
      }),
    );
    const j = await ledger.getJournal(actor.facilityId, paid.journalId);
    expect(j.status).toBe('draft');
    expect(j.lines.find((l) => l.accountId === expense)?.costCentreId).toBe(centre);
    await post(j.id);
    expect((await ledger.report(actor.facilityId, on, on)).expenses).toBe(
      c.moneyDecimal(before.expenses).add('10.25').toFixed(2),
    );
    const r = await run(() =>
      ledger.reverse(actor, j.id, { date: on, reason: 'Correction', ...key() }),
    );
    expect(r.lines.find((l) => l.accountId === expense)?.costCentreId).toBe(centre);
    await post(r.id);
    expect((await ledger.report(actor.facilityId, on, on)).expenses).toBe(before.expenses);
    const s = await supplier();
    const asset = await run(() =>
      ap.charge(actor, {
        mode: 'payable',
        supplierId: s.id,
        reference: 'ASSET',
        date: on,
        memo: 'Stock purchase',
        category: 'Pharmacy inventory',
        amount: '50',
        ...key(),
      }),
    );
    await post(asset.journalId);
    expect(
      (await ledger.getJournal(actor.facilityId, asset.journalId)).lines.find(
        (l) => l.accountId === inventory,
      )?.debit,
    ).toBe('50.00');
    await expect(
      run(() => ap.mapping(actor, { category: 'Invalid cash', accountId: cash, ...key() })),
    ).rejects.toThrow('expense or non-cash');
  });

  it('clears multiple bills with one partial payment and honors historical cutoffs', async () => {
    const s = await supplier(),
      a = await bill(s.id, '100'),
      b = await bill(s.id, '200');
    await post(a.journalId);
    await post(b.journalId);
    const bills = await raw.financeBill.findMany({
      where: { supplierId: s.id },
      orderBy: { amount: 'asc' },
    });
    const input = {
      supplierId: s.id,
      date: '2026-10-01',
      reference: 'MULTI',
      cashAccountId: cash,
      allocations: [
        { billId: bills[0].id, amount: '40' },
        { billId: bills[1].id, amount: '80' },
      ],
      ...key(),
    };
    const p = await run(() => ap.payment(actor, input));
    expect(p.amount).toBe('120.00');
    expect(await run(() => ap.payment(actor, input))).toEqual(p);
    expect((await ap.report(actor.facilityId, '2026-10-01', s.id)).total).toBe('300.00');
    await expect(
      run(() =>
        ap.payment(actor, {
          ...input,
          allocations: [{ billId: bills[0].id, amount: '61' }],
          ...key(),
        }),
      ),
    ).rejects.toThrow('reserved');
    await post(p.journalId);
    expect((await ap.report(actor.facilityId, '2026-09-30', s.id)).total).toBe('300.00');
    const report = await ap.report(actor.facilityId, '2026-10-31', s.id);
    expect(report.total).toBe('180.00');
    expect(report.difference).toBe('0.00');
    expect(report.rows.every((r) => r.days === 31 && r.days31to60 === r.outstanding)).toBe(true);
    expect(c.payablesReportSchema.safeParse(report).success).toBe(true);
    const stmt = await ap.statement(actor.facilityId, s.id, '2026-10-01', '2026-10-31');
    expect(stmt.opening).toBe('300.00');
    expect(stmt.closing).toBe('180.00');
    expect(stmt.lines).toHaveLength(2);
    expect(c.supplierStatementSchema.safeParse(stmt).success).toBe(true);
    const source = await ap.source(actor.facilityId, p.journalId);
    expect(source.bills).toHaveLength(2);
    expect(c.payableSourceSchema.safeParse(source).success).toBe(true);
    const reversal = await run(() =>
      ledger.reverse(actor, p.journalId, {
        date: '2026-10-02',
        reason: 'Return payment',
        ...key(),
      }),
    );
    await post(reversal.id);
    expect((await ap.report(actor.facilityId, '2026-10-01', s.id)).total).toBe('180.00');
    expect((await ap.report(actor.facilityId, '2026-10-02', s.id)).total).toBe('300.00');
  });

  it('handles aging boundaries and isolates open drafts from posted payables', async () => {
    const s = await supplier(),
      b = await bill(s.id);
    await post(b.journalId);
    for (const [asOf, bucket] of [
      ['2026-09-30', 'current'],
      ['2026-10-01', 'days1to30'],
      ['2026-10-30', 'days1to30'],
      ['2026-10-31', 'days31to60'],
      ['2026-11-29', 'days31to60'],
      ['2026-11-30', 'days61to90'],
      ['2026-12-29', 'days61to90'],
      ['2026-12-30', 'over90'],
    ] as const)
      expect((await ap.report(actor.facilityId, asOf, s.id)).rows[0][bucket]).toBe('100.00');
    const pending = await bill(s.id, '20');
    const source = await raw.financeBill.findUniqueOrThrow({
      where: { journalId: pending.journalId },
    });
    await expect(
      run(() =>
        ap.payment(actor, {
          supplierId: s.id,
          date: on,
          reference: 'NO DRAFT PAYMENT',
          cashAccountId: cash,
          allocations: [{ billId: source.id, amount: '10' }],
          ...key(),
        }),
      ),
    ).rejects.toThrow('Post the bill');
  });

  it('serializes simultaneous payments and rejects cross-supplier and foreign references atomically', async () => {
    const s = await supplier(),
      b = await bill(s.id);
    await post(b.journalId);
    const source = await raw.financeBill.findUniqueOrThrow({ where: { journalId: b.journalId } });
    const input = {
      supplierId: s.id,
      date: on,
      reference: 'Concurrent',
      cashAccountId: cash,
      allocations: [{ billId: source.id, amount: '80' }],
    };
    const results = await Promise.allSettled([
      run(() => ap.payment(actor, { ...input, ...key() })),
      run(() => ap.payment(actor, { ...input, ...key() })),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const other = await supplier();
    await expect(
      run(() => ap.payment(actor, { ...input, supplierId: other.id, ...key() })),
    ).rejects.toThrow('not found');
    await expect(
      requestContext.run(foreign, () =>
        ap.mapping(foreign, {
          category: 'Foreign',
          accountId: expense,
          costCentreId: centre,
          ...key(),
        }),
      ),
    ).rejects.toThrow();
    const foreignCentre = await requestContext.run(foreign, () =>
      ap.centre(foreign, { code: 'OTHER', name: 'Foreign centre', ...key() }),
    );
    await expect(
      run(() =>
        ap.charge(actor, {
          mode: 'cash',
          date: on,
          memo: 'Foreign',
          accountId: expense,
          costCentreId: foreignCentre.id,
          cashAccountId: cash,
          amount: '1',
          ...key(),
        }),
      ),
    ).rejects.toThrow('cost centre');
    await expect(
      raw.financeJournalLine.update({
        where: {
          id: (await raw.financeJournalLine.findFirstOrThrow({ where: { journalId: b.journalId } }))
            .id,
        },
        data: { costCentreId: foreignCentre.id },
      }),
    ).rejects.toThrow();
  });

  it('rechecks all allocations at posting and prevents additions to a posted payment', async () => {
    const s = await supplier(),
      b = await bill(s.id);
    await post(b.journalId);
    const source = await raw.financeBill.findUniqueOrThrow({ where: { journalId: b.journalId } });
    const p = await run(() =>
      ap.payment(actor, {
        supplierId: s.id,
        date: on,
        reference: 'Tamper check',
        cashAccountId: cash,
        allocations: [{ billId: source.id, amount: '25' }],
        ...key(),
      }),
    );
    const lines = await raw.financeJournalLine.findMany({ where: { journalId: p.journalId } });
    for (const l of lines)
      await raw.financeJournalLine.update({
        where: { id: l.id },
        data: l.debit.gt(0) ? { debit: '26' } : { credit: '26' },
      });
    await expect(post(p.journalId)).rejects.toThrow();
    for (const l of lines)
      await raw.financeJournalLine.update({
        where: { id: l.id },
        data: l.debit.gt(0) ? { debit: '25' } : { credit: '25' },
      });
    await post(p.journalId);
    const another = await bill(s.id);
    await post(another.journalId);
    const second = await raw.financeBill.findUniqueOrThrow({
      where: { journalId: another.journalId },
    });
    await expect(
      raw.financeSettlement.create({
        data: {
          facilityId: actor.facilityId,
          billId: second.id,
          journalId: p.journalId,
          amount: '1',
        },
      }),
    ).rejects.toThrow('Invalid supplier payment source');
  });

  it('consumes immutable PO/GRN output exactly once with decimal rounding and full source trace', async () => {
    const s = await supplier();
    const input = {
      supplierId: s.id,
      sourceSystem: 'Excel register',
      poReference: 'PO-101',
      grnReference: 'GRN-101',
      receivedOn: on,
      lines: [
        {
          sourceLineId: '1',
          description: 'Tablets',
          quantity: '3',
          unitCost: '0.10',
          category: 'Pharmacy inventory',
        },
        {
          sourceLineId: '2',
          description: 'Gauze',
          quantity: '1.5',
          unitCost: '2.35',
          category: 'Medical supplies',
        },
      ],
      ...key(),
    };
    const r = await run(() => ap.receipt(actor, input));
    expect(r.amount.toFixed(2)).toBe('3.83');
    expect((await run(() => ap.receipt(actor, input))).id).toBe(r.id);
    await expect(run(() => ap.receipt(actor, { ...input, ...key() }))).rejects.toThrow();
    await expect(
      raw.financeProcurementReceipt.update({ where: { id: r.id }, data: { amount: '1' } }),
    ).rejects.toThrow('immutable');
    const b = await run(() =>
      ap.receiptBill(actor, r.id, { reference: 'INVOICE-101', date: on, ...key() }),
    );
    await expect(
      run(() => ap.receiptBill(actor, r.id, { reference: 'INVOICE-102', date: on, ...key() })),
    ).rejects.toThrow('already has a bill');
    await post(b.journalId);
    const j = await ledger.getJournal(actor.facilityId, b.journalId);
    expect(j.lines.find((l) => l.accountId === inventory)?.debit).toBe('0.30');
    expect(j.lines.find((l) => l.accountId === expense)?.debit).toBe('3.53');
    const source = await ap.source(actor.facilityId, j.id);
    expect(source.bills[0].procurement?.poReference).toBe('PO-101');
    expect(source.bills[0].procurement?.grnReference).toBe('GRN-101');
    const report = await ap.report(actor.facilityId, on, s.id);
    expect(report.total).toBe('3.83');
    expect(report.difference).toBe('0.00');
    expect(c.payablesWorkspaceSchema.safeParse(await ap.workspace(actor.facilityId)).success).toBe(
      true,
    );
  });

  it('discards draft allocations and receipts with an audit trail while preserving posted records', async () => {
    const s = await supplier(),
      b = await bill(s.id);
    await post(b.journalId);
    const source = await raw.financeBill.findUniqueOrThrow({ where: { journalId: b.journalId } });
    const p = await run(() =>
      ap.payment(actor, {
        supplierId: s.id,
        date: on,
        reference: 'Cancel draft',
        cashAccountId: cash,
        allocations: [{ billId: source.id, amount: '75' }],
        ...key(),
      }),
    );
    expect((await ap.report(actor.facilityId, on, s.id)).rows[0].available).toBe('25.00');
    await expect(
      raw.financeSettlement.deleteMany({ where: { journalId: p.journalId } }),
    ).rejects.toThrow('immutable');
    await run(() => ledger.deleteDraft(actor, p.journalId, { expectedVersion: 1, ...key() }));
    expect((await ap.report(actor.facilityId, on, s.id)).rows[0].available).toBe('100.00');
    expect(
      (await ledger.audit(actor.facilityId, p.journalId, 1)).rows.some(
        (r) => r.action === 'delete',
      ),
    ).toBe(true);
    await expect(
      run(() => ledger.deleteDraft(actor, b.journalId, { expectedVersion: 2, ...key() })),
    ).rejects.toThrow();
    const r = await run(() =>
      ap.receipt(actor, {
        supplierId: s.id,
        sourceSystem: 'Paper',
        poReference: 'PO-CANCEL',
        grnReference: 'GRN-CANCEL',
        receivedOn: on,
        lines: [
          {
            sourceLineId: '1',
            description: 'Correctable receipt',
            quantity: '1',
            unitCost: '5',
            category: 'Medical supplies',
          },
        ],
        ...key(),
      }),
    );
    const draft = await run(() =>
      ap.receiptBill(actor, r.id, { date: on, reference: 'DRAFT-CANCEL', ...key() }),
    );
    await expect(run(() => ap.discardReceipt(actor, r.id, key()))).rejects.toThrow(
      'Remove the unposted bill first',
    );
    await run(() => ledger.deleteDraft(actor, draft.journalId, { expectedVersion: 1, ...key() }));
    await run(() => ap.discardReceipt(actor, r.id, key()));
    expect(await raw.financeProcurementReceipt.findUnique({ where: { id: r.id } })).toBeNull();
    expect(
      await raw.financeAudit.count({
        where: { facilityId: actor.facilityId, entityId: r.id, action: 'delete' },
      }),
    ).toBe(1);
  });

  it('rolls back procurement billing if any category is unmapped', async () => {
    const s = await supplier();
    const r = await run(() =>
      ap.receipt(actor, {
        supplierId: s.id,
        sourceSystem: 'Paper',
        poReference: 'PO-ERR',
        grnReference: 'GRN-ERR',
        receivedOn: on,
        lines: [
          {
            sourceLineId: '1',
            description: 'Unknown',
            quantity: '1',
            unitCost: '5',
            category: 'Missing category',
          },
        ],
        ...key(),
      }),
    );
    const count = await raw.financeJournal.count({ where: { facilityId: actor.facilityId } });
    await expect(
      run(() => ap.receiptBill(actor, r.id, { reference: 'UNMAPPED', date: on, ...key() })),
    ).rejects.toThrow('Configure expense mapping');
    expect(await raw.financeBill.count({ where: { receiptId: r.id } })).toBe(0);
    expect(await raw.financeJournal.count({ where: { facilityId: actor.facilityId } })).toBe(count);
    await expect(
      ap.source(
        foreign.facilityId,
        (await raw.financeJournal.findFirstOrThrow({ where: { facilityId: actor.facilityId } })).id,
      ),
    ).rejects.toThrow('not found');
  });
});
