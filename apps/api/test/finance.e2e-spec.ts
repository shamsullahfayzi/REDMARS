import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { financeWorkspaceSchema, FinanceJournalInput, financeReportSchema } from '@redmars/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FinanceActor, FinanceLedgerService } from '../src/modules/finance/finance-ledger.service';
import { FinanceOperationsService } from '../src/modules/finance/finance-operations.service';
import { requestContext } from '../src/audit/request-context';

describe('Finance accounting integrity', () => {
  jest.setTimeout(60000);
  const raw = new PrismaClient();
  let app: INestApplication<App>,
    server: App,
    prisma: PrismaService,
    ledger: FinanceLedgerService,
    operations: FinanceOperationsService;
  let actor: FinanceActor, adminToken: string, accountantToken: string, outsiderToken: string;
  let reviewer: FinanceActor;
  let cash: string,
    bank: string,
    expense: string,
    equity: string,
    receivable: string,
    periodId: string;
  const password = 'finance-test-only-password';
  const on = '2026-09-21';
  const command = () => ({ idempotencyKey: randomUUID() });
  const asActor = <T>(run: () => Promise<T>) => requestContext.run(actor, run);
  const draft = (amount = '100.00'): FinanceJournalInput => ({
    date: on,
    memo: 'Test balanced journal',
    ...command(),
    lines: [
      { accountId: cash, description: 'Opening cash', debit: amount, credit: '0' },
      { accountId: equity, description: 'Opening equity', debit: '0', credit: amount },
    ],
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    ledger = app.get(FinanceLedgerService);
    operations = app.get(FinanceOperationsService);
    const facility = await raw.facility.create({
      data: { code: 'finance_' + randomUUID(), name: 'Finance test only' },
    });
    await raw.facilityModule.create({
      data: { facilityId: facility.id, module: 'finance', enabled: true },
    });
    async function user(roleCode: string) {
      const user = await raw.appUser.create({
        data: {
          facilityId: facility.id,
          username: randomUUID(),
          fullName: 'Finance test',
          passwordHash: await hash(password),
        },
      });
      const role = await raw.role.findUniqueOrThrow({ where: { code: roleCode } });
      await raw.userRole.create({ data: { userId: user.id, roleId: role.id } });
      const login = await request(server)
        .post('/auth/login')
        .send({ username: user.username, password })
        .expect(200);
      return { id: user.id, token: (login.body as { accessToken: string }).accessToken };
    }
    const admin = await user('admin'),
      accountant = await user('accountant'),
      outsider = await user('doctor');
    actor = { facilityId: facility.id, userId: admin.id };
    reviewer = { facilityId: facility.id, userId: accountant.id };
    adminToken = admin.token;
    accountantToken = accountant.token;
    outsiderToken = outsider.token;
    await asActor(() => ledger.setup(actor, { cutoverDate: '2026-09-01', ...command() }));
    const accounts = await raw.financeAccount.findMany({ where: { facilityId: facility.id } });
    const id = (key: string) => accounts.find((a) => a.systemKey === key)!.id;
    cash = id('cash');
    bank = id('bank');
    expense = id('expense');
    equity = id('opening');
    receivable = id('receivable');
    periodId = (
      await raw.fiscalPeriod.findFirstOrThrow({
        where: { facilityId: actor.facilityId, label: '1405-06' },
      })
    ).id;
  });
  // Posted journals deliberately survive in this disposable *_test database.
  // Production immutability is not disabled to make teardown convenient.
  afterAll(async () => {
    await app?.close();
    await raw.$disconnect();
  });

  it('enforces finance permissions, module access and clinical separation', async () => {
    const response = await request(server)
      .get('/finance')
      .set('Authorization', 'Bearer ' + accountantToken)
      .expect(200);
    expect(financeWorkspaceSchema.safeParse(response.body).success).toBe(true);
    await request(server)
      .post('/finance/accounts')
      .set('Authorization', 'Bearer ' + accountantToken)
      .send({
        date: on,
        memo: 'No posting right',
        expenseAccountId: expense,
        cashAccountId: cash,
        amount: '5',
        ...command(),
      })
      .expect(403);
    await request(server)
      .get('/finance')
      .set('Authorization', 'Bearer ' + outsiderToken)
      .expect(403);
    await request(server)
      .get('/patients')
      .set('Authorization', 'Bearer ' + accountantToken)
      .expect(403);
    await raw.facilityModule.update({
      where: { facilityId_module: { facilityId: actor.facilityId, module: 'finance' } },
      data: { enabled: false },
    });
    await request(server)
      .get('/finance')
      .set('Authorization', 'Bearer ' + adminToken)
      .expect(403);
    await raw.facilityModule.update({
      where: { facilityId_module: { facilityId: actor.facilityId, module: 'finance' } },
      data: { enabled: true },
    });
  });

  it('refuses overlapping periods and foreign/control accounts', async () => {
    await expect(
      asActor(() => ledger.createFiscalYear(actor, { year: 1405, ...command() })),
    ).rejects.toThrow('already exists');
    const bad = draft();
    bad.lines[0].accountId = receivable;
    await expect(asActor(() => ledger.createJournal(actor, bad))).rejects.toThrow(
      'Control accounts',
    );
    bad.lines[0].accountId = randomUUID();
    await expect(asActor(() => ledger.createJournal(actor, bad))).rejects.toThrow(
      'active accounts',
    );
    await expect(ledger.getJournal(randomUUID(), randomUUID())).rejects.toThrow('not found');
  });

  it('keeps drafts out of reports and rejects unbalanced posting without issuing a number', async () => {
    const input = draft();
    input.lines[1].credit = '99';
    const j = await asActor(() => ledger.createJournal(actor, input));
    await expect(
      asActor(() => ledger.postJournal(reviewer, j.id, { expectedVersion: j.version, ...command() })),
    ).rejects.toThrow('Total debits');
    expect((await ledger.getJournal(actor.facilityId, j.id)).number).toBeNull();
    const report = await ledger.report(actor.facilityId, '2026-09-01', '2026-09-30');
    expect(report.debit).toBe('0.00');
    await asActor(() =>
      ledger.deleteDraft(actor, j.id, { expectedVersion: j.version, ...command() }),
    );
  });

  it('posts once, rejects stale edits, and prevents direct edits to posted journals and lines', async () => {
    const j = await asActor(() => ledger.createJournal(actor, draft('1000')));
    const edited = await asActor(() =>
      ledger.editJournal(actor, j.id, { ...draft('1000'), expectedVersion: 1 }),
    );
    await expect(
      asActor(() => ledger.editJournal(actor, j.id, { ...draft(), expectedVersion: 1 })),
    ).rejects.toThrow('current version');
    const key = { expectedVersion: edited.version, ...command() };
    const posted = await asActor(() => ledger.postJournal(reviewer, j.id, key));
    expect(await asActor(() => ledger.postJournal(reviewer, j.id, key))).toEqual(posted);
    expect(posted.number).toMatch(/^JRN-2026-/);
    await expect(
      raw.financeJournal.update({ where: { id: j.id }, data: { memo: 'Tampered' } }),
    ).rejects.toThrow();
    await expect(
      raw.financeJournalLine.update({ where: { id: posted.lines[0].id }, data: { debit: '9999' } }),
    ).rejects.toThrow();
    await expect(
      raw.financeJournalLine.delete({ where: { id: posted.lines[0].id } }),
    ).rejects.toThrow();
    const report = financeReportSchema.parse(
      await ledger.report(actor.facilityId, '2026-09-01', '2026-09-30'),
    );
    expect(report.balanced).toBe(true);
    expect(report.assets).toBe('1000.00');
    expect(report.equity).toBe('1000.00');
    expect(report.balanceSheetDifference).toBe('0.00');
    expect(
      await raw.auditLog.count({ where: { entity: 'FinanceJournal', entityId: j.id } }),
    ).toBeGreaterThanOrEqual(3);
  });

  it('rejects raw unbalanced posting at the database boundary', async () => {
    const input = draft();
    input.lines[1].credit = '99';
    const j = await asActor(() => ledger.createJournal(actor, input));
    await expect(
      raw.financeJournal.update({
        where: { id: j.id },
        data: { status: 'posted', number: 'INVALID', postedBy: actor.userId, postedAt: new Date() },
      }),
    ).rejects.toThrow();
    await asActor(() =>
      ledger.deleteDraft(actor, j.id, { expectedVersion: j.version, ...command() }),
    );
  });

  it('records expenses and corrects them by a linked reversal without mutating originals', async () => {
    const j = await asActor(() =>
      operations.expense(actor, {
        date: on,
        memo: 'Supplies',
        expenseAccountId: expense,
        cashAccountId: cash,
        amount: '35.50',
        ...command(),
      }),
    );
    await ledger.postJournal(reviewer,j.id,{expectedVersion:j.version,...command()});
    const reversed = await asActor(() =>
      ledger.reverse(actor, j.id, { date: on, reason: 'Duplicate receipt', ...command() }),
    );
    expect(reversed.reversalOfId).toBe(j.id);
    await ledger.postJournal(reviewer,reversed.id,{expectedVersion:reversed.version,...command()});
    await expect(
      asActor(() => ledger.reverse(actor, j.id, { date: on, reason: 'Again', ...command() })),
    ).rejects.toThrow('unreversed');
    expect((await ledger.report(actor.facilityId, '2026-09-01', '2026-09-30')).expenses).toBe(
      '0.00',
    );
  });

  it('prevents supplier overpayment under concurrent settlement and reverses the subledger correctly', async () => {
    const supplier = await asActor(() =>
      operations.createSupplier(actor, { name: 'Supplier ' + randomUUID(), ...command() }),
    );
    const bill = await asActor(() =>
      operations.bill(actor, {
        date: on,
        dueOn: '2026-09-25',
        supplierId: supplier.id,
        reference: 'B-001',
        memo: 'Service invoice',
        expenseAccountId: expense,
        amount: '100',
        ...command(),
      }),
    );
    await ledger.postJournal(reviewer,bill.journalId,{expectedVersion:1,...command()});
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        asActor(() =>
          operations.settle(actor, bill.id, {
            date: on,
            memo: 'Pay supplier',
            cashAccountId: cash,
            amount: '75',
            ...command(),
          }),
        ),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const row = (await operations.workspace(actor.facilityId)).bills.find((b) => b.id === bill.id)!;
    expect(row.available).toBe('25.00');
    await ledger.postJournal(reviewer,row.settlements[0].journalId,{expectedVersion:1,...command()});
    await expect(
      asActor(() =>
        ledger.reverse(actor, bill.journalId, { date: on, reason: 'Cancel bill', ...command() }),
      ),
    ).rejects.toThrow('payments');
    const reversedPayment = await asActor(() =>
      ledger.reverse(actor, row.settlements[0].journalId, {
        date: on,
        reason: 'Reverse payment',
        ...command(),
      }),
    );
    await ledger.postJournal(reviewer,reversedPayment.id,{expectedVersion:1,...command()});
    const reversedBill = await asActor(() =>
      ledger.reverse(actor, bill.journalId, { date: on, reason: 'Cancel bill', ...command() }),
    );
    await ledger.postJournal(reviewer,reversedBill.id,{expectedVersion:1,...command()});
    expect(
      (await operations.workspace(actor.facilityId)).bills.find((b) => b.id === bill.id)!.reversed,
    ).toBe(true);
    const report = await ledger.report(actor.facilityId, '2026-09-01', '2026-09-30');
    expect(report.liabilities).toBe('0.00');
    expect(report.balanceSheetDifference).toBe('0.00');
  });

  it('imports invoice, payment and refund events exactly once and keeps failures pending', async () => {
    const patient = await raw.patient.create({
      data: {
        facilityId: actor.facilityId,
        mrn: randomUUID(),
        firstName: 'Test',
        gender: 'unknown',
      },
    });
    const invoice = await asActor(() =>
      prisma.db.invoice.create({
        data: {
          facilityId: actor.facilityId,
          patientId: patient.id,
          invoiceNo: randomUUID(),
          status: 'issued',
          subtotal: '100',
          total: '100',
          items: { create: [{refType:'service',description:'Test consultation',unitPrice:'100',total:'100'}] },
        },
      }),
    );
    const payment = await asActor(() =>
      prisma.db.payment.create({
        data: { invoiceId: invoice.id, amount: '100', method: 'cash', receivedBy: actor.userId },
      }),
    );
    // Fixed event dates make the regression independent of the workstation clock.
    await raw.integrationEvent.updateMany({
      where: { facilityId: actor.facilityId, aggregateId: { in: [invoice.id, payment.id] } },
      data: { occurredAt: new Date(on + 'T12:00:00Z') },
    });
    const first = await asActor(() => operations.sync(actor));
    expect(first.failures).toHaveLength(0);
    expect(first.drafted).toBe(2);
    expect((await asActor(() => operations.sync(actor))).drafted).toBe(0);
    for (const j of await raw.financeJournal.findMany({where:{facilityId:actor.facilityId,sourceType:'hospital',status:'draft'}})) await ledger.postJournal(reviewer,j.id,{expectedVersion:j.version,...command()});
    const refund = await asActor(() =>
      prisma.db.payment.create({
        data: { invoiceId: invoice.id, amount: '-100', method: 'cash', receivedBy: actor.userId },
      }),
    );
    await asActor(() =>
      prisma.db.payment.update({ where: { id: payment.id }, data: { isReversed: true } }),
    );
    await asActor(() =>
      prisma.db.invoice.update({ where: { id: invoice.id }, data: { status: 'cancelled' } }),
    );
    await raw.integrationEvent.updateMany({
      where: { facilityId: actor.facilityId, aggregateId: { in: [invoice.id, refund.id] } },
      data: { occurredAt: new Date(on + 'T13:00:00Z') },
    });
    const second = await asActor(() => operations.sync(actor));
    expect(second.drafted).toBe(2);
    expect(second.failures).toHaveLength(0);
    for (const j of await raw.financeJournal.findMany({where:{facilityId:actor.facilityId,sourceType:'hospital',status:'draft'}})) await ledger.postJournal(reviewer,j.id,{expectedVersion:j.version,...command()});
    const report = await ledger.report(actor.facilityId, '2026-09-01', '2026-09-30');
    expect(report.income).toBe('0.00');
    expect(report.balanceSheetDifference).toBe('0.00');
    const foreignCurrency = await asActor(() =>
      prisma.db.invoice.create({
        data: {
          facilityId: actor.facilityId,
          patientId: patient.id,
          invoiceNo: randomUUID(),
          currency: 'USD',
          status: 'issued',
          subtotal: '10',
          total: '10',
        },
      }),
    );
    const event = await raw.integrationEvent.findFirstOrThrow({
      where: { aggregateId: foreignCurrency.id },
    });
    await raw.integrationEvent.update({
      where: { id: event.id },
      data: { occurredAt: new Date(on + 'T13:00:00Z') },
    });
    expect((await asActor(() => operations.sync(actor))).failures).toHaveLength(1);
    expect(await raw.integrationReceipt.count({ where: { eventId: event.id } })).toBe(0);
  });

  it('matches bank movements once and makes finalized statements immutable', async () => {
    const input = draft('200');
    input.lines[0].accountId = bank;
    const draftRow = await asActor(() => ledger.createJournal(actor, input));
    const posted = await asActor(() =>
      ledger.postJournal(reviewer, draftRow.id, { expectedVersion: 1, ...command() }),
    );
    const bankLine = posted.lines.find((l) => l.accountId === bank)!;
    const statement = await asActor(() =>
      operations.statement(actor, {
        accountId: bank,
        reference: 'BANK-SEP',
        startsOn: '2026-09-01',
        endsOn: '2026-09-30',
        openingBalance: '0',
        closingBalance: '200',
        lines: [{ date: on, description: 'Opening deposit', amount: '200' }],
        ...command(),
      }),
    );
    const line = await raw.financeStatementLine.findFirstOrThrow({
      where: { statementId: statement.id },
    });
    await expect(
      asActor(() => operations.reconcile(actor, statement.id, command())),
    ).rejects.toThrow('Match every');
    await expect(
      raw.financeStatement.update({
        where: { id: statement.id },
        data: { reconciledAt: new Date(), reconciledBy: actor.userId },
      }),
    ).rejects.toThrow();
    await asActor(() =>
      operations.match(actor, line.id, { journalLineId: bankLine.id, ...command() }),
    );
    expect(
      (await asActor(() => operations.reconcile(actor, statement.id, command()))).reconciled,
    ).toBe(true);
    await expect(
      asActor(() => operations.match(actor, line.id, { journalLineId: null, ...command() })),
    ).rejects.toThrow('finalized');
    await expect(
      raw.financeStatementLine.update({
        where: { id: line.id },
        data: { description: 'Tampered' },
      }),
    ).rejects.toThrow();
    await expect(
      asActor(() =>
        ledger.reverse(actor, posted.id, { date: on, reason: 'Backdated reversal', ...command() }),
      ),
    ).rejects.toThrow('finalized statement');
  });

  it('rejects a second supplier reference and backdating into finalized bank statements', async () => {
    const supplier = await asActor(() =>
      operations.createSupplier(actor, { name: 'Duplicate test ' + randomUUID(), ...command() }),
    );
    const input = {
      date: on,
      dueOn: on,
      supplierId: supplier.id,
      reference: 'DUPLICATE',
      memo: 'Duplicate guard',
      expenseAccountId: expense,
      amount: '1',
      ...command(),
    };
    await asActor(() => operations.bill(actor, input));
    await expect(asActor(() => operations.bill(actor, { ...input, ...command() }))).rejects.toThrow(
      'already exists',
    );
    const inputJournal = draft('5');
    inputJournal.lines[0].accountId = bank;
    const pending = await asActor(() => ledger.createJournal(actor, inputJournal));
    await expect(
      asActor(() => ledger.postJournal(reviewer, pending.id, { expectedVersion: 1, ...command() })),
    ).rejects.toThrow('reconciliation covers');
    await asActor(() =>
      ledger.deleteDraft(actor, pending.id, { expectedVersion: 1, ...command() }),
    );
  });

  it('enforces account facility ownership at both service and database boundaries', async () => {
    const other = await raw.facility.create({
      data: { code: 'finance_other_' + randomUUID(), name: 'Other test facility' },
    });
    const otherAccount = await raw.financeAccount.create({
      data: { facilityId: other.id, code: '1000', name: 'Other cash', type: 'asset' },
    });
    const bad = draft();
    bad.lines[0].accountId = otherAccount.id;
    await expect(asActor(() => ledger.createJournal(actor, bad))).rejects.toThrow(
      'active accounts',
    );
    const pending = await asActor(() => ledger.createJournal(actor, draft()));
    await expect(
      raw.financeJournalLine.create({
        data: {
          facilityId: actor.facilityId,
          journalId: pending.id,
          accountId: otherAccount.id,
          debit: '1',
          credit: '0',
        },
      }),
    ).rejects.toThrow();
    await asActor(() =>
      ledger.deleteDraft(actor, pending.id, { expectedVersion: 1, ...command() }),
    );
    await raw.financeAccount.delete({ where: { id: otherAccount.id } });
    await expect(raw.facility.delete({ where: { id: other.id } })).rejects.toThrow();
  });

  it('blocks closing with pending hospital events and blocks posting into a closed period', async () => {
    await expect(asActor(() => ledger.closePeriod(actor, periodId, command()))).rejects.toThrow('draft journals');
    for (const j of await raw.financeJournal.findMany({where:{facilityId:actor.facilityId,periodId,status:'draft'}})) await ledger.postJournal(reviewer,j.id,{expectedVersion:j.version,...command()});
    await expect(asActor(() => ledger.closePeriod(actor, periodId, command()))).rejects.toThrow(
      'outstanding hospital',
    );
    const october = await raw.fiscalPeriod.findFirstOrThrow({
      where: { facilityId: actor.facilityId, label: '1405-08' },
    });
    await asActor(() => ledger.closePeriod(actor, october.id, command()));
    await expect(
      asActor(() => ledger.createJournal(actor, { ...draft(), date: '2026-11-05' })),
    ).rejects.toThrow('closed');
    await expect(
      raw.fiscalPeriod.update({ where: { id: october.id }, data: { closedAt: null } }),
    ).rejects.toThrow();
  });
});
