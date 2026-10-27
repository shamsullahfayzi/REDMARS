import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { requestContext } from '../src/audit/request-context';
import { PrismaService } from '../src/prisma/prisma.service';
import { FinanceActor, FinanceLedgerService } from '../src/modules/finance/finance-ledger.service';
import { FinanceRevenueService } from '../src/modules/finance/finance-revenue.service';
import { FinanceCloseService } from '../src/modules/finance/finance-close.service';

/** Synthetic cutover checks, including explicit evidence of unresolved legacy-AR limits. */
describe('Production readiness: finance cutover', () => {
  jest.setTimeout(60000);
  const raw = new PrismaClient();
  const key = () => ({ idempotencyKey: randomUUID() });
  const cutoverDate = '2025-03-21';
  let app: INestApplication;
  let ledger: FinanceLedgerService;
  let revenue: FinanceRevenueService;
  let closing: FinanceCloseService;
  let prisma: PrismaService;
  const run = <T>(actor: FinanceActor, work: () => Promise<T>) => requestContext.run(actor, work);

  async function books() {
    const facility = await raw.facility.create({
      data: { code: randomUUID(), name: 'Synthetic cutover verification only' },
    });
    const actor = {
      facilityId: facility.id,
      userId: (
        await raw.appUser.create({
          data: {
            facilityId: facility.id,
            username: randomUUID(),
            fullName: 'Synthetic preparer',
            passwordHash: 'no-login',
          },
        })
      ).id,
    };
    const reviewer = {
      ...actor,
      userId: (
        await raw.appUser.create({
          data: {
            facilityId: facility.id,
            username: randomUUID(),
            fullName: 'Synthetic reviewer',
            passwordHash: 'no-login',
          },
        })
      ).id,
    };
    await run(actor, () => ledger.setup(actor, { cutoverDate, ...key() }));
    return { actor, reviewer };
  }
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    await app.init();
    ledger = app.get(FinanceLedgerService);
    revenue = app.get(FinanceRevenueService);
    closing = app.get(FinanceCloseService);
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app?.close();
    await raw.$disconnect();
  });

  it('persists the selected cutover and refuses reset or pre-cutover journals', async () => {
    const { actor } = await books();
    await expect(
      run(actor, () => ledger.setup(actor, { cutoverDate: '2025-04-01', ...key() })),
    ).rejects.toThrow('cutover date cannot be reset');
    const accounts = await raw.financeAccount.findMany({ where: { facilityId: actor.facilityId } });
    const cash = accounts.find((a) => a.systemKey === 'cash')!;
    const equity = accounts.find((a) => a.systemKey === 'opening')!;
    await expect(
      run(actor, () =>
        ledger.createJournal(actor, {
          date: '2025-03-20',
          memo: 'Synthetic rejected backdate',
          ...key(),
          lines: [
            { accountId: cash.id, debit: '1', credit: '0', description: '' },
            { accountId: equity.id, debit: '0', credit: '1', description: '' },
          ],
        }),
      ),
    ).rejects.toThrow('cutover');
    expect(await raw.financeJournal.count({ where: { facilityId: actor.facilityId } })).toBe(0);
  });

  it('exposes unallocated opening receivables even when the trial balance balances', async () => {
    const { actor, reviewer } = await books();
    const account = await raw.financeAccount.findFirstOrThrow({
      where: { facilityId: actor.facilityId, systemKey: 'receivable' },
    });
    const equity = await raw.financeAccount.findFirstOrThrow({
      where: { facilityId: actor.facilityId, systemKey: 'opening' },
    });
    const draft = await run(actor, () =>
      ledger.importOpening(actor, {
        filename: 'synthetic-unallocated-ar.csv',
        csv: `accountCode,debit,credit,description\n${account.code},100,0,Synthetic opening AR\n${equity.code},0,100,Synthetic offset`,
        ...key(),
      }),
    );
    expect(draft.date).toBe(cutoverDate);
    await run(reviewer, () =>
      ledger.postJournal(reviewer, draft.id, { expectedVersion: draft.version, ...key() }),
    );
    expect((await ledger.report(actor.facilityId, cutoverDate, '2025-04-20')).balanced).toBe(true);
    const ar = await revenue.ar(actor.facilityId, '2025-04-20', 'patient');
    expect(ar.total).toBe('0.00');
    expect(ar.difference).not.toBe('0.00');
    const period = await raw.fiscalPeriod.findUniqueOrThrow({
      where: { facilityId_label: { facilityId: actor.facilityId, label: '1404-01' } },
    });
    const checklist = await closing.checklist(actor, period.id);
    expect(checklist.checks.find((check) => check.key === 'receivables')?.passed).toBe(false);
    await expect(
      run(reviewer, () =>
        closing.action(reviewer, period.id, 'close', {
          reason: 'Synthetic rejected close',
          ...key(),
        }),
      ),
    ).rejects.toThrow('Receivables allocated to invoices');
  });

  it('retains a post-cutover receipt on a legacy invoice as a visible pending failure', async () => {
    const { actor } = await books();
    const patient = await raw.patient.create({
      data: {
        facilityId: actor.facilityId,
        mrn: randomUUID(),
        firstName: 'Synthetic legacy AR',
        gender: 'unknown',
      },
    });
    const invoice = await raw.invoice.create({
      data: {
        facilityId: actor.facilityId,
        patientId: patient.id,
        invoiceNo: randomUUID(),
        createdAt: new Date('2025-03-20T00:00:00Z'),
        status: 'issued',
        subtotal: '100',
        total: '100',
      },
    });
    await run(actor, () =>
      prisma.db.payment.create({
        data: { invoiceId: invoice.id, amount: '25', method: 'cash', receivedBy: actor.userId },
      }),
    );
    const sync = await run(actor, () => revenue.sync(actor));
    expect(sync.drafted).toBe(0);
    expect(sync.failures).toHaveLength(1);
    expect(sync.failures[0].message).toContain('predates cutover');
    const event = await raw.integrationEvent.findUniqueOrThrow({
      where: { id: sync.failures[0].eventId },
      include: { receipts: true },
    });
    expect(event.receipts).toHaveLength(0);
    expect(await raw.financeJournal.count({ where: { facilityId: actor.facilityId } })).toBe(0);

    // The ordered outbox must not silently skip the failed legacy payment.
    // Document its effect on later, otherwise valid activity for the cutover plan.
    const currentInvoice = await raw.invoice.create({
      data: {
        facilityId: actor.facilityId,
        patientId: patient.id,
        invoiceNo: randomUUID(),
        status: 'issued',
        subtotal: '50',
        total: '50',
      },
    });
    await run(actor, () =>
      prisma.db.payment.create({
        data: {
          invoiceId: currentInvoice.id,
          amount: '10',
          method: 'cash',
          receivedBy: actor.userId,
        },
      }),
    );
    const blocked = await run(actor, () => revenue.sync(actor));
    expect(blocked.drafted).toBe(0);
    expect(blocked.failures).toHaveLength(1);
    expect(blocked.failures[0].message).toContain('predates cutover');
    expect(blocked.remaining).toBe(2);
    expect(await raw.integrationReceipt.count({ where: { event: { facilityId: actor.facilityId } } })).toBe(0);
  });
});
