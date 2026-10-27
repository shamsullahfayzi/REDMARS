import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  FinanceWorkspace,
  financeBillInputSchema,
  financeExpenseInputSchema,
  financeSettlementInputSchema,
  financeStatementInputSchema,
  financeSupplierInputSchema,
} from '@redmars/shared';
import { AuditedTx } from '../../prisma/prisma.service';
import { FinanceRevenueService } from './finance-revenue.service';
import {
  FinanceActor,
  FinanceLedgerService,
  FINANCE_CONSUMER,
  FINANCE_EVENTS,
  date,
  day,
  endDay,
  decimal,
  journalInclude,
} from './finance-ledger.service';

@Injectable()
export class FinanceOperationsService {
  constructor(
    private readonly ledger: FinanceLedgerService,
    private readonly revenue: FinanceRevenueService,
  ) {}

  async workspace(facilityId: string): Promise<FinanceWorkspace> {
    return this.ledger.prisma.db.$transaction(async (tx) => {
      const [
        settings,
        accounts,
        periods,
        suppliers,
        journals,
        bills,
        statements,
        journalCount,
        pendingEvents,
      ] = await Promise.all([
        tx.financeSettings.findUnique({ where: { facilityId } }),
        tx.financeAccount.findMany({ where: { facilityId }, orderBy: { code: 'asc' } }),
        tx.fiscalPeriod.findMany({
          where: { facilityId },
          include: { fiscalYear: true },
          orderBy: { startsOn: 'asc' },
        }),
        tx.financeSupplier.findMany({ where: { facilityId }, orderBy: { name: 'asc' } }),
        tx.financeJournal.findMany({
          where: { facilityId },
          include: journalInclude,
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          take: 100,
        }),
        tx.financeBill.findMany({
          where: { facilityId },
          include: {
            supplier: true,
            journal: { include: { reversal: true } },
            settlements: { include: { journal: { include: { reversal: true } } } },
          },
          orderBy: { dueOn: 'asc' },
        }),
        tx.financeStatement.findMany({
          where: { facilityId },
          include: { lines: { orderBy: [{ date: 'asc' }, { id: 'asc' }] } },
          orderBy: { endsOn: 'desc' },
        }),
        tx.financeJournal.count({ where: { facilityId } }),
        tx.integrationEvent.count({
          where: {
            facilityId,
            type: { in: FINANCE_EVENTS },
            receipts: { none: { consumer: FINANCE_CONSUMER } },
          },
        }),
      ]);
      return {
        fiscalYears: (
          await tx.fiscalYear.findMany({ where: { facilityId }, orderBy: { year: 'asc' } })
        ).map((y) => ({
          id: y.id,
          year: y.year,
          label: y.label,
          startsAt: y.startsOn.toISOString(),
          endsAt: y.endsOn.toISOString(),
        })),
        legacyClosedPeriods: (
          await tx.financeLegacyPeriod.findMany({ where: { facilityId, closedAt: { not: null } } })
        ).map((p) => ({
          name: p.name,
          startsOn: day(p.startsOn),
          endsOn: day(new Date(p.endsOn.getTime() - 1)),
        })),
        settings: settings ? { currency: 'AFN', cutoverDate: day(settings.cutoverDate) } : null,
        accounts: accounts.map((a) => ({
          ...a,
          normalBalance: a.normalBalance as 'debit' | 'credit',
        })),
        periods: periods.map((p) => ({
          id: p.id,
          name: p.name,
          label: p.label,
          year: p.fiscalYear.year,
          month: p.month,
          startsAt: p.startsOn.toISOString(),
          endsAt: p.endsOn.toISOString(),
          startsOn: day(p.startsOn),
          endsOn: day(new Date(p.endsOn.getTime() - 1)),
          closedAt: p.closedAt?.toISOString() ?? null,
        })),
        suppliers,
        journals: journals.map((j) => this.ledger.serialize(j)),
        journalCount,
        pendingEvents,
        bills: bills.map((b) => {
          const paid = b.settlements
            .filter((s) => s.journal.status === 'posted' && s.journal.reversal?.status !== 'posted')
            .reduce((n, s) => n.add(s.amount), decimal('0'));
          return {
            id: b.id,
            supplierId: b.supplierId,
            supplierName: b.supplier.name,
            reference: b.reference,
            date: day(b.journal.date),
            dueOn: day(b.dueOn),
            amount: b.amount.toFixed(2),
            paid: paid.toFixed(2),
            reserved: b.settlements
              .filter((s) => s.journal.status === 'draft')
              .reduce((n, s) => n.add(s.amount), decimal('0'))
              .toFixed(2),
            available:
              b.journal.status !== 'posted' || b.journal.reversal
                ? '0.00'
                : b.amount
                    .sub(
                      b.settlements
                        .filter((s) => s.journal.reversal?.status !== 'posted')
                        .reduce((n, s) => n.add(s.amount), decimal('0')),
                    )
                    .toFixed(2),
            status: b.journal.status,
            outstanding:
              b.journal.status !== 'posted' || b.journal.reversal?.status === 'posted'
                ? '0.00'
                : b.amount.sub(paid).toFixed(2),
            reversed: b.journal.reversal?.status === 'posted',
            journalId: b.journalId,
            settlements: b.settlements.map((s) => ({
              id: s.id,
              journalId: s.journalId,
              date: day(s.journal.date),
              amount: s.amount.toFixed(2),
              reversed: s.journal.reversal?.status === 'posted',
              status: s.journal.status,
            })),
          };
        }),
        statements: statements.map((s) => ({
          id: s.id,
          accountId: s.accountId,
          reference: s.reference,
          startsOn: day(s.startsOn),
          endsOn: day(s.endsOn),
          openingBalance: s.openingBalance.toFixed(2),
          closingBalance: s.closingBalance.toFixed(2),
          reconciledAt: s.reconciledAt?.toISOString() ?? null,
          lines: s.lines.map((l) => ({
            id: l.id,
            date: day(l.date),
            description: l.description,
            amount: l.amount.toFixed(2),
            journalLineId: l.journalLineId,
          })),
        })),
      };
    });
  }

  createSupplier(actor: FinanceActor, input: z.infer<typeof financeSupplierInputSchema>) {
    return this.ledger.command(actor, 'supplier.create', input, async (tx) => {
      await this.ledger.settings(tx, actor.facilityId);
      return tx.financeSupplier.create({
        data: {
          facilityId: actor.facilityId,
          name: input.name,
          reference: input.reference ?? null,
          termsDays: input.termsDays ?? 0,
          terms: input.terms ?? '',
          contact: input.contact ?? '',
        },
      });
    });
  }

  private async account(
    tx: AuditedTx,
    facilityId: string,
    id: string,
    cash: boolean,
    assets = false,
  ) {
    const row = await tx.financeAccount.findFirst({ where: { id, facilityId, isActive: true } });
    if (
      !row ||
      !row.isPosting ||
      row.isControl ||
      (cash
        ? !row.isCash
        : row.type !== 'expense' && !(assets && row.type === 'asset' && !row.isCash))
    )
      throw new BadRequestException(
        cash ? 'Choose an active cash/bank account.' : 'Choose an active expense account.',
      );
    return row;
  }

  expense(actor: FinanceActor, input: z.infer<typeof financeExpenseInputSchema>) {
    return this.ledger.command(actor, 'expense', input, async (tx) => {
      await this.account(tx, actor.facilityId, input.expenseAccountId, false);
      await this.account(tx, actor.facilityId, input.cashAccountId, true);
      return this.ledger.automatic(
        tx,
        actor,
        {
          date: input.date,
          memo: input.memo,
          idempotencyKey: input.idempotencyKey,
          lines: [
            {
              accountId: input.expenseAccountId,
              costCentreId: input.costCentreId,
              description: input.memo,
              debit: input.amount,
              credit: '0',
            },
            {
              accountId: input.cashAccountId,
              description: input.memo,
              debit: '0',
              credit: input.amount,
            },
          ],
        },
        'expense',
        randomUUID(),
      );
    });
  }

  bill(actor: FinanceActor, input: z.infer<typeof financeBillInputSchema>) {
    return this.ledger.command(actor, 'bill.create', input, async (tx) => {
      const supplier = await tx.financeSupplier.findFirst({
        where: { id: input.supplierId, facilityId: actor.facilityId, isActive: true },
      });
      if (!supplier) throw new NotFoundException('Active supplier not found');
      await this.account(tx, actor.facilityId, input.expenseAccountId, false, true);
      const payable = await this.ledger.systemAccount(tx, actor.facilityId, 'payable');
      const id = randomUUID();
      const journal = await this.ledger.automatic(
        tx,
        actor,
        {
          date: input.date,
          memo: input.memo,
          idempotencyKey: input.idempotencyKey,
          lines: [
            {
              accountId: input.expenseAccountId,
              costCentreId: input.costCentreId,
              description: input.reference,
              debit: input.amount,
              credit: '0',
            },
            {
              accountId: payable.id,
              description: input.reference,
              debit: '0',
              credit: input.amount,
            },
          ],
        },
        'supplier_bill',
        id,
      );
      await tx.financeBill.create({
        data: {
          id,
          facilityId: actor.facilityId,
          supplierId: supplier.id,
          reference: input.reference,
          dueOn: date(input.dueOn),
          amount: input.amount,
          journalId: journal.id,
        },
      });
      return { id, journalId: journal.id };
    });
  }

  settle(actor: FinanceActor, billId: string, input: z.infer<typeof financeSettlementInputSchema>) {
    return this.ledger.command(actor, 'bill.pay:' + billId, input, async (tx) => {
      await tx.$queryRaw`SELECT id FROM finance_bill WHERE id=${billId} AND facility_id=${actor.facilityId} FOR UPDATE`;
      const bill = await tx.financeBill.findFirst({
        where: { id: billId, facilityId: actor.facilityId },
        include: {
          journal: { include: { reversal: true } },
          settlements: { include: { journal: { include: { reversal: true } } } },
        },
      });
      if (!bill) throw new NotFoundException('Supplier bill not found');
      if (bill.journal.status !== 'posted')
        throw new ConflictException('Post the bill before preparing payment.');
      if (bill.journal.reversal) throw new ConflictException('This bill has been reversed.');
      if (date(input.date) < bill.journal.date)
        throw new BadRequestException('Payment date cannot precede the bill date.');
      const paid = bill.settlements
        .filter((s) => s.journal.reversal?.status !== 'posted')
        .reduce((n, s) => n.add(s.amount), decimal('0'));
      if (decimal(input.amount).gt(bill.amount.sub(paid)))
        throw new BadRequestException('Payment exceeds the outstanding supplier balance.');
      await this.account(tx, actor.facilityId, input.cashAccountId, true);
      const payable = await this.ledger.systemAccount(tx, actor.facilityId, 'payable');
      const id = randomUUID();
      const journal = await this.ledger.automatic(
        tx,
        actor,
        {
          date: input.date,
          memo: input.memo,
          idempotencyKey: input.idempotencyKey,
          lines: [
            {
              accountId: payable.id,
              description: bill.reference,
              debit: input.amount,
              credit: '0',
            },
            {
              accountId: input.cashAccountId,
              description: bill.reference,
              debit: '0',
              credit: input.amount,
            },
          ],
        },
        'supplier_payment',
        id,
      );
      await tx.financeSettlement.create({
        data: {
          id,
          facilityId: actor.facilityId,
          billId,
          amount: input.amount,
          journalId: journal.id,
        },
      });
      return { id, journalId: journal.id };
    });
  }

  sync(actor: FinanceActor) {
    return this.revenue.sync(actor);
  }

  statement(actor: FinanceActor, input: z.infer<typeof financeStatementInputSchema>) {
    return this.ledger.command(actor, 'statement.create', input, async (tx) => {
      await this.account(tx, actor.facilityId, input.accountId, true);
      const movement = input.lines.reduce((n, l) => n.add(l.amount), decimal('0'));
      if (!decimal(input.openingBalance).add(movement).eq(input.closingBalance))
        throw new BadRequestException(
          'Statement opening balance plus movements must equal its closing balance.',
        );
      const overlap = await tx.financeStatement.findFirst({
        where: {
          facilityId: actor.facilityId,
          accountId: input.accountId,
          startsOn: { lte: date(input.endsOn) },
          endsOn: { gte: date(input.startsOn) },
        },
      });
      if (overlap) throw new ConflictException('Statements for the same account must not overlap.');
      const row = await tx.financeStatement.create({
        data: {
          facilityId: actor.facilityId,
          accountId: input.accountId,
          reference: input.reference,
          startsOn: date(input.startsOn),
          endsOn: endDay(input.endsOn),
          openingBalance: input.openingBalance,
          closingBalance: input.closingBalance,
          lines: {
            create: input.lines.map((l) => ({
              date: date(l.date),
              description: l.description,
              amount: l.amount,
            })),
          },
        },
      });
      return { id: row.id };
    });
  }

  match(
    actor: FinanceActor,
    lineId: string,
    input: { journalLineId: string | null; idempotencyKey: string },
  ) {
    return this.ledger.command(actor, 'statement.match:' + lineId, input, async (tx) => {
      const line = await tx.financeStatementLine.findFirst({
        where: { id: lineId, facilityId: actor.facilityId },
        include: { statement: true },
      });
      if (!line) throw new NotFoundException('Statement line not found');
      if (line.statement.reconciledAt) throw new ConflictException('The statement is finalized.');
      if (input.journalLineId) {
        const entry = await tx.financeJournalLine.findFirst({
          where: { id: input.journalLineId, facilityId: actor.facilityId },
          include: { journal: { include: { reversal: true } }, statementLine: true },
        });
        if (
          !entry ||
          entry.accountId !== line.statement.accountId ||
          entry.journal.status !== 'posted' ||
          entry.journal.date > line.statement.endsOn ||
          !entry.debit.sub(entry.credit).eq(line.amount)
        )
          throw new BadRequestException(
            'Match a posted entry in the same account with the same signed amount and a date no later than the statement end.',
          );
        if (entry.statementLine && entry.statementLine.id !== lineId)
          throw new ConflictException('This ledger entry is already matched.');
      }
      await tx.financeStatementLine.update({
        where: { id: lineId },
        data: { journalLineId: input.journalLineId },
      });
      return { matched: input.journalLineId !== null };
    });
  }

  reconcile(actor: FinanceActor, id: string, input: { idempotencyKey: string }) {
    return this.ledger.command(actor, 'statement.reconcile:' + id, input, async (tx) => {
      const statement = await tx.financeStatement.findFirst({
        where: { id, facilityId: actor.facilityId },
        include: { lines: true },
      });
      if (!statement) throw new NotFoundException('Statement not found');
      if (statement.reconciledAt) throw new ConflictException('Statement is already finalized.');
      if (statement.lines.some((l) => !l.journalLineId))
        throw new ConflictException('Match every statement line before finalizing.');
      const previous = await tx.financeStatement.findFirst({
        where: {
          facilityId: actor.facilityId,
          accountId: statement.accountId,
          endsOn: { lt: statement.startsOn },
        },
        orderBy: { endsOn: 'desc' },
      });
      if (
        previous &&
        (!previous.reconciledAt || !previous.closingBalance.eq(statement.openingBalance))
      )
        throw new ConflictException(
          'Finalize the preceding statement and carry forward its closing balance.',
        );
      const entries = await tx.financeJournalLine.findMany({
        where: {
          facilityId: actor.facilityId,
          accountId: statement.accountId,
          journal: { status: 'posted', date: { lte: statement.endsOn } },
        },
        include: { statementLine: { include: { statement: true } } },
      });
      let book = decimal('0'),
        outstanding = decimal('0');
      for (const line of entries) {
        const amount = line.debit.sub(line.credit);
        book = book.add(amount);
        if (
          !line.statementLine ||
          (line.statementLine.statementId !== id && !line.statementLine.statement.reconciledAt)
        )
          outstanding = outstanding.add(amount);
      }
      if (!book.sub(outstanding).eq(statement.closingBalance))
        throw new ConflictException(
          'Bank and ledger do not reconcile. Check opening balances and outstanding entries.',
        );
      await tx.financeStatement.update({
        where: { id },
        data: { reconciledAt: new Date(), reconciledBy: actor.userId },
      });
      return {
        reconciled: true,
        bookBalance: book.toFixed(2),
        outstanding: outstanding.toFixed(2),
      };
    });
  }
}
