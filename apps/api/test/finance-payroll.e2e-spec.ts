import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, Prisma } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import * as c from '@redmars/shared';
import { AppModule } from '../src/app.module';
import { FinanceLedgerService, FinanceActor } from '../src/modules/finance/finance-ledger.service';
import { FinancePayrollService } from '../src/modules/finance/finance-payroll.service';
import { FinancePayablesService } from '../src/modules/finance/finance-payables.service';
import { requestContext } from '../src/audit/request-context';

describe('Layer 4 payroll', () => {
  jest.setTimeout(60000);
  const raw = new PrismaClient(),
    key = () => ({ idempotencyKey: randomUUID() });
  let app: INestApplication<App>, ledger: FinanceLedgerService, payroll: FinancePayrollService;
  let actor: FinanceActor, reviewer: FinanceActor, foreign: FinanceActor;
  let officerToken: string, doctorToken: string, foreignToken: string, managementToken: string;
  let cash: string,
    centre: string,
    employeeId: string,
    period: string,
    nextPeriod: string,
    runId: string,
    loanId: string;
  const run = <T>(f: () => Promise<T>) => requestContext.run(actor, f);
  const post = (id: string) =>
    requestContext.run(reviewer, async () =>
      ledger.postJournal(reviewer, id, {
        expectedVersion: (await ledger.getJournal(actor.facilityId, id)).version,
        ...key(),
      }),
    );
  const calculate = (periodId = period, on = '2026-10-01') =>
    run(() =>
      payroll.calculate(actor, {
        periodId,
        date: on,
        adjustments: [
          c.payrollAdjustmentSchema.parse({
            employeeId,
            bonus: '1000',
            overtimeHours: '5',
            note: 'Manual attendance register',
          }),
        ],
        ...key(),
      }),
    );
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    await app.init();
    ledger = app.get(FinanceLedgerService);
    payroll = app.get(FinancePayrollService);
    const f = await raw.facility.create({
      data: { code: randomUUID(), name: 'Payroll isolated test' },
    });
    const other = await raw.facility.create({
      data: { code: randomUUID(), name: 'Payroll foreign test' },
    });
    for (const facilityId of [f.id, other.id])
      await raw.facilityModule.create({ data: { facilityId, module: 'finance', enabled: true } });
    const user = async (facilityId: string, roleCode: string) => {
      const password = 'isolated-test-password';
      const u = await raw.appUser.create({
        data: {
          facilityId,
          username: randomUUID(),
          fullName: 'Payroll ' + roleCode,
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
    const officer = await user(f.id, 'payroll_officer'),
      admin = await user(f.id, 'admin'),
      outside = await user(other.id, 'admin');
    actor = officer.actor;
    reviewer = admin.actor;
    foreign = outside.actor;
    officerToken = officer.token;
    foreignToken = outside.token;
    doctorToken = (await user(f.id, 'doctor')).token;
    managementToken = (await user(f.id, 'management')).token;
    await run(() => ledger.setup(actor, { cutoverDate: '2026-09-01', ...key() }));
    cash = (
      await raw.financeAccount.findFirstOrThrow({ where: { facilityId: f.id, systemKey: 'cash' } })
    ).id;
    centre = (
      await run(() =>
        app.get(FinancePayablesService).centre(actor, { code: 'WARD', name: 'Ward', ...key() }),
      )
    ).id;
    period = (
      await raw.fiscalPeriod.findFirstOrThrow({ where: { facilityId: f.id, label: '1405-07' } })
    ).id;
    nextPeriod = (
      await raw.fiscalPeriod.findFirstOrThrow({ where: { facilityId: f.id, label: '1405-08' } })
    ).id;
    await run(() =>
      payroll.configure(actor, {
        taxName: 'Afghan monthly',
        taxBands: c.AFGHAN_MONTHLY_TAX,
        ...key(),
      }),
    );
    employeeId = (
      await run(() =>
        payroll.saveEmployee(
          actor,
          null,
          c.payrollEmployeeInputSchema.parse({
            code: 'E001',
            name: 'Test employee',
            nameDari: 'کارمند آزمایشی',
            basic: '20000',
            allowance: '2000',
            overtimeRate: '100',
            costCentreId: centre,
            startsOn: '2026-09-01',
            ...key(),
          }),
        ),
      )
    ).id;
  });
  afterAll(async () => {
    await app?.close();
    await raw.$disconnect();
  });
  it('enforces payroll roles, module gates and facility isolation', async () => {
    const server = app.getHttpServer();
    await request(server).get('/finance/payroll').auth(doctorToken, { type: 'bearer' }).expect(403);
    const w = await request(server)
      .get('/finance/payroll')
      .auth(officerToken, { type: 'bearer' })
      .expect(200);
    expect(c.payrollWorkspaceSchema.parse(w.body).employees[0].code).toBe('E001');
    await request(server)
      .post('/finance/payroll/config')
      .auth(officerToken, { type: 'bearer' })
      .send({ taxName: 'x', taxBands: c.AFGHAN_MONTHLY_TAX, ...key() })
      .expect(403);
    await request(server)
      .post('/finance/payroll/employees')
      .auth(managementToken, { type: 'bearer' })
      .send({})
      .expect(403);
    expect(
      c.payrollWorkspaceSchema.parse(
        (
          await request(server)
            .get('/finance/payroll')
            .auth(foreignToken, { type: 'bearer' })
            .expect(200)
        ).body,
      ).employees,
    ).toHaveLength(0);
    await raw.facilityModule.update({
      where: { facilityId_module: { facilityId: actor.facilityId, module: 'finance' } },
      data: { enabled: false },
    });
    await request(server)
      .get('/finance/payroll')
      .auth(officerToken, { type: 'bearer' })
      .expect(403);
    await raw.facilityModule.update({
      where: { facilityId_module: { facilityId: actor.facilityId, module: 'finance' } },
      data: { enabled: true },
    });
  });
  it('issues an audited loan draft once, then deducts it in monthly payroll', async () => {
    const input = {
      employeeId,
      kind: 'loan' as const,
      reference: randomUUID(),
      amount: '1500',
      installment: '1000',
      date: '2026-09-25',
      firstPeriodId: period,
      cashAccountId: cash,
      ...key(),
    };
    const loan = await run(() => payroll.issueLoan(actor, input));
    loanId = loan.id;
    expect((await run(() => payroll.issueLoan(actor, input))).id).toBe(loan.id);
    await post(loan.journalId);
    runId = (await calculate()).id;
    const r = c.payrollRunSchema.parse(await payroll.detail(actor.facilityId, runId));
    expect(r.items[0]).toMatchObject({
      basic: '20000.00',
      allowance: '2000.00',
      overtime: '500.00',
      bonus: '1000.00',
      gross: '23500.00',
      tax: '1250.00',
      loanDeduction: '1000.00',
      net: '21250.00',
    });
    await request(app.getHttpServer())
      .get('/finance/payroll/runs/' + runId)
      .auth(foreignToken, { type: 'bearer' })
      .expect(404);
  });
  it('requires review, independent approval and a posted accrual before payment', async () => {
    let r = await payroll.detail(actor.facilityId, runId);
    const pay = {
      itemId: r.items[0].id,
      amount: '100',
      date: '2026-10-02',
      cashAccountId: cash,
      reference: randomUUID(),
      ...key(),
    };
    await expect(run(() => payroll.payment(actor, pay))).rejects.toThrow(/Approve/);
    await expect(
      run(() => payroll.action(actor, runId, 'approve', { version: r.version, ...key() })),
    ).rejects.toThrow(/changed/);
    await run(() => payroll.action(actor, runId, 'review', { version: r.version, ...key() }));
    r = await payroll.detail(actor.facilityId, runId);
    await expect(
      run(() => payroll.action(actor, runId, 'approve', { version: r.version, ...key() })),
    ).rejects.toThrow(/different/);
    const approved = await requestContext.run(reviewer, () =>
      payroll.action(reviewer, runId, 'approve', { version: r.version, ...key() }),
    );
    expect(approved.journalId).toBeTruthy();
    await expect(run(() => payroll.payment(actor, pay))).rejects.toThrow(/post/);
    await expect(calculate()).rejects.toThrow(/immutable/);
    await expect(
      raw.payrollItem.update({
        where: { id: r.items[0].id },
        data: { snapshot: { tampered: true } },
      }),
    ).rejects.toThrow(/immutable/);
    await post(approved.journalId!);
    const journal = await raw.financeJournal.findUniqueOrThrow({
      where: { id: approved.journalId! },
      include: { lines: { include: { account: true } } },
    });
    expect(journal.lines.find((l) => l.account.systemKey === 'salary_expense')?.costCentreId).toBe(
      centre,
    );
    expect(
      journal.lines
        .reduce((n, l) => n.add(l.debit).sub(l.credit), new Prisma.Decimal('0'))
        .toFixed(2),
    ).toBe('0.00');
    expect(
      await raw.financeAudit.count({
        where: { facilityId: actor.facilityId, entity: 'payroll_run' },
      }),
    ).toBeGreaterThan(0);
  });
  it('reserves salary drafts, blocks concurrent overpayment, and clears salary payable', async () => {
    const r = c.payrollRunSchema.parse(await payroll.detail(actor.facilityId, runId));
    const pay = () =>
      run(() =>
        payroll.payment(actor, {
          itemId: r.items[0].id,
          amount: '15000',
          date: '2026-10-02',
          cashAccountId: cash,
          reference: randomUUID(),
          ...key(),
        }),
      );
    const results = await Promise.allSettled([pay(), pay()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const first = results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
      Awaited<ReturnType<typeof payroll.payment>>
    >;
    await post(first.value.journalId);
    const second = await run(() =>
      payroll.payment(actor, {
        itemId: r.items[0].id,
        amount: '6250',
        date: '2026-10-02',
        cashAccountId: cash,
        reference: randomUUID(),
        ...key(),
      }),
    );
    await post(second.journalId);
    expect(
      c.payrollRunSchema.parse(await payroll.detail(actor.facilityId, runId)).items[0],
    ).toMatchObject({ paid: '21250.00', available: '0.00' });
    const lines = await raw.financeJournalLine.findMany({
      where: {
        facilityId: actor.facilityId,
        account: { systemKey: 'salary_payable' },
        journal: { status: 'posted' },
      },
    });
    expect(
      lines.reduce((n, l) => n.add(l.credit).sub(l.debit), lines[0].credit.mul('0')).toFixed(2),
    ).toBe('0.00');
  });
  it('caps the final loan installment and preserves prior payslips', async () => {
    const second = (await calculate(nextPeriod, '2026-11-01')).id;
    let r = c.payrollRunSchema.parse(await payroll.detail(actor.facilityId, second));
    expect(r.items[0].loanDeduction).toBe('500.00');
    await run(() => payroll.action(actor, second, 'review', { version: r.version, ...key() }));
    r = c.payrollRunSchema.parse(await payroll.detail(actor.facilityId, second));
    const approved = await requestContext.run(reviewer, () =>
      payroll.action(reviewer, second, 'approve', { version: r.version, ...key() }),
    );
    await post(approved.journalId!);
    const workspace = c.payrollWorkspaceSchema.parse(await payroll.workspace(actor.facilityId));
    expect(workspace.loans.find((l) => l.id === loanId)).toMatchObject({
      deducted: '1500.00',
      outstanding: '0.00',
    });
    expect(
      c.payrollRunSchema.parse(await payroll.detail(actor.facilityId, runId)).items[0]
        .loanDeduction,
    ).toBe('1000.00');
    await expect(calculate()).rejects.toThrow(/immutable/);
  });
  it('rejects cross-facility links and negative payroll without creating a run', async () => {
    await expect(
      run(() =>
        payroll.saveEmployee(
          actor,
          null,
          c.payrollEmployeeInputSchema.parse({
            code: 'BAD',
            name: 'Bad centre',
            basic: '1000',
            costCentreId: randomUUID(),
            startsOn: '2026-09-01',
            ...key(),
          }),
        ),
      ),
    ).rejects.toThrow(/cost centre/);
    const later = await raw.fiscalPeriod.findFirstOrThrow({
      where: { facilityId: actor.facilityId, label: '1405-09' },
    });
    await expect(
      run(() =>
        payroll.calculate(actor, {
          periodId: later.id,
          date: '2026-12-01',
          adjustments: [c.payrollAdjustmentSchema.parse({ employeeId, otherDeduction: '999999' })],
          ...key(),
        }),
      ),
    ).rejects.toThrow(/exceed/);
    expect(await raw.payrollRun.count({ where: { periodId: later.id } })).toBe(0);
    await expect(
      raw.payrollEmployee.update({
        where: { id: employeeId },
        data: { facilityId: foreign.facilityId },
      }),
    ).rejects.toThrow();
  });
  it('recalculates unapproved runs, invalidates review versions and blocks period close', async () => {
    const p = await raw.fiscalPeriod.findFirstOrThrow({
      where: { facilityId: actor.facilityId, label: '1405-09' },
    });
    const created = await calculate(p.id, '2026-12-01');
    let r = c.payrollRunSchema.parse(await payroll.detail(actor.facilityId, created.id));
    await run(() => payroll.action(actor, r.id, 'review', { version: r.version, ...key() }));
    const reviewed = await payroll.detail(actor.facilityId, r.id);
    await expect(run(() => ledger.closePeriod(actor, p.id, key()))).rejects.toThrow(/payroll/);
    await calculate(p.id, '2026-12-01');
    r = c.payrollRunSchema.parse(await payroll.detail(actor.facilityId, created.id));
    expect(r.status).toBe('calculated');
    expect(r.items).toHaveLength(1);
    await expect(
      requestContext.run(reviewer, () =>
        payroll.action(reviewer, r.id, 'approve', { version: reviewed.version, ...key() }),
      ),
    ).rejects.toThrow(/changed/);
    const closed = await raw.fiscalPeriod.findFirstOrThrow({
      where: { facilityId: actor.facilityId, label: '1405-12' },
    });
    await run(() => ledger.closePeriod(actor, closed.id, key()));
    await expect(calculate(closed.id, '2027-03-01')).rejects.toThrow(/closed/);
  });
  it('discards an unposted loan with an audit trail and prevents mismatched loan journals', async () => {
    const firstPeriod = await raw.fiscalPeriod.findFirstOrThrow({
      where: { facilityId: actor.facilityId, label: '1405-09' },
    });
    const loan = await run(() =>
      payroll.issueLoan(actor, {
        employeeId,
        kind: 'advance',
        reference: randomUUID(),
        amount: '100',
        installment: '100',
        date: '2026-12-01',
        firstPeriodId: firstPeriod.id,
        cashAccountId: cash,
        ...key(),
      }),
    );
    const journal = await raw.financeJournal.findUniqueOrThrow({
      where: { id: loan.journalId },
      include: { lines: true },
    });
    // Keep the altered journal balanced: the source guard must catch a wrong principal.
    for (const line of journal.lines)
      await raw.financeJournalLine.update({
        where: { id: line.id },
        data: line.debit.gt('0') ? { debit: '101' } : { credit: '101' },
      });
    await expect(post(journal.id)).rejects.toThrow(/mismatch/);
    await run(() =>
      ledger.deleteDraft(actor, journal.id, { expectedVersion: journal.version, ...key() }),
    );
    expect(await raw.payrollLoan.findUnique({ where: { id: loan.id } })).toBeNull();
    expect(
      await raw.financeAudit.count({
        where: {
          facilityId: actor.facilityId,
          entity: 'payroll_loan',
          action: 'delete',
          entityId: loan.id,
        },
      }),
    ).toBe(1);
  });
  it('reverses a salary payment, releases its balance and traces the originating payroll', async () => {
    const r = c.payrollRunSchema.parse(await payroll.detail(actor.facilityId, runId));
    const payment = r.payments[0];
    const reverse = await run(() =>
      ledger.reverse(actor, payment.journal.id, {
        date: '2026-12-01',
        reason: 'Payment returned',
        ...key(),
      }),
    );
    await post(reverse.id);
    const updated = c.payrollRunSchema.parse(await payroll.detail(actor.facilityId, runId));
    expect(updated.items[0].available).toBe(payment.amount);
    expect((await payroll.source(actor.facilityId, payment.journal.id)).runId).toBe(runId);
    const replacement = await run(() =>
      payroll.payment(actor, {
        itemId: r.items[0].id,
        amount: payment.amount,
        date: '2026-12-02',
        cashAccountId: cash,
        reference: randomUUID(),
        ...key(),
      }),
    );
    await run(() =>
      ledger.deleteDraft(actor, replacement.journalId, { expectedVersion: 1, ...key() }),
    );
    expect(
      c.payrollRunSchema.parse(await payroll.detail(actor.facilityId, runId)).items[0].reserved,
    ).toBe('0.00');
  });
});
