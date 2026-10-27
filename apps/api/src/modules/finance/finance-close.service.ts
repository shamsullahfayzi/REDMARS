import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import * as c from '@redmars/shared';
import { AuditedTx } from '../../prisma/prisma.service';
import {
  FinanceActor,
  FinanceLedgerService,
  FINANCE_CONSUMER,
  FINANCE_EVENTS,
  day,
  decimal as d,
} from './finance-ledger.service';

@Injectable()
export class FinanceCloseService {
  constructor(private readonly ledger: FinanceLedgerService) {}
  async checklist(actor: FinanceActor, id: string, tx: AuditedTx = this.ledger.prisma.db) {
    const p = await tx.fiscalPeriod.findFirst({ where: { id, facilityId: actor.facilityId } });
    if (!p) throw new NotFoundException('Period not found.');
    const checks: Array<{ key: string; label: string; passed: boolean; detail: string }> = [];
    const add = (key: string, label: string, passed: boolean, detail: string) =>
      checks.push({ key, label, passed, detail });
    add(
      'elapsed',
      'Accounting month has ended',
      p.endsOn <= new Date(),
      day(new Date(p.endsOn.getTime() - 1)),
    );
    const drafts = await tx.financeJournal.count({ where: { periodId: id, status: 'draft' } });
    add('drafts', 'All journals reviewed and posted', drafts === 0, `${drafts} drafts remain`);
    const payroll = await tx.payrollRun.count({
      where: { periodId: id, status: { not: 'approved' } },
    });
    add('payroll', 'Payroll approved', payroll === 0, `${payroll} payroll runs await approval`);
    const settings = await tx.financeSettings.findUniqueOrThrow({
      where: { facilityId: actor.facilityId },
    });
    const pending = await tx.integrationEvent.count({
      where: {
        facilityId: actor.facilityId,
        type: { in: FINANCE_EVENTS },
        occurredAt: {
          gte: p.startsOn > settings.cutoverDate ? p.startsOn : settings.cutoverDate,
          lt: p.endsOn,
        },
        receipts: { none: { consumer: FINANCE_CONSUMER } },
      },
    });
    add('hospital', 'Hospital billing events posted', pending === 0, `${pending} events remain`);
    const tills = await tx.financeTillClose.count({
      where: {
        facilityId: actor.facilityId,
        startsAt: { gte: p.startsOn, lt: p.endsOn },
        approvedAt: null,
      },
    });
    add('tills', 'Submitted till counts approved', tills === 0, `${tills} counts await approval`);
    const lines = await tx.financeJournalLine.findMany({
      where: {
        facilityId: actor.facilityId,
        journal: { status: 'posted', date: { lt: p.endsOn } },
      },
      include: { account: true, journal: { select: { date: true } } },
    });
    const total = (key?: string) =>
      lines
        .filter((l) => !key || l.account.systemKey === key)
        .reduce((s, l) => s.add(l.baseDebit).minus(l.baseCredit), d('0'));
    add(
      'balance',
      'Trial balance balances',
      total().isZero(),
      `Difference ${total().toFixed(2)} AFN`,
    );
    const cashIds = [...new Set(lines.filter((l) => l.account.isCash).map((l) => l.accountId))];
    const statements = await tx.financeStatement.findMany({
      where: {
        facilityId: actor.facilityId,
        reconciledAt: { not: null },
        endsOn: { gte: new Date(p.endsOn.getTime() - 1) },
      },
    });
    const missing = cashIds.filter((a) => {
      const rows = lines.filter((l) => l.accountId === a);
      return (
        (rows.some((l) => l.journal.date >= p.startsOn) ||
          !rows.reduce((s, l) => s.add(l.baseDebit).minus(l.baseCredit), d('0')).isZero()) &&
        !statements.some((s) => s.accountId === a && s.startsOn < p.endsOn)
      );
    });
    add(
      'cash',
      'Cash and bank reconciled through month end',
      missing.length === 0,
      missing.length
        ? missing.map((a) => lines.find((l) => l.accountId === a)!.account.name).join(', ')
        : 'All active balances covered by finalized statements',
    );
    const bills = await tx.financeBill.findMany({
      where: { facilityId: actor.facilityId },
      include: {
        journal: { include: { reversal: true } },
        settlements: { include: { journal: { include: { reversal: true } } } },
      },
    });
    const alive = (j: {
      status: string;
      date: Date;
      reversal: { status: string; date: Date } | null;
    }) =>
      j.status === 'posted' &&
      j.date < p.endsOn &&
      !(j.reversal?.status === 'posted' && j.reversal.date < p.endsOn);
    const ap = bills.reduce(
      (s, b) =>
        s
          .add(alive(b.journal) ? b.amount : d('0'))
          .minus(
            b.settlements.reduce((v, x) => v.add(alive(x.journal) ? x.amount : d('0')), d('0')),
          ),
      d('0'),
    );
    const apDiff = total('payable').negated().minus(ap);
    add(
      'payables',
      'Supplier subledger matches control',
      apDiff.isZero(),
      `Difference ${apDiff.toFixed(2)} AFN`,
    );
    const items = await tx.payrollItem.findMany({
      where: {
        facilityId: actor.facilityId,
        run: { status: 'approved', journal: { status: 'posted', date: { lt: p.endsOn } } },
      },
      include: { payments: { include: { journal: { include: { reversal: true } } } } },
    });
    const salary = items.reduce(
      (s, item) =>
        s
          .add(item.net)
          .minus(
            item.payments.reduce(
              (v, payment) => v.add(alive(payment.journal) ? payment.amount : d('0')),
              d('0'),
            ),
          ),
      d('0'),
    );
    const salaryDiff = total('salary_payable').negated().minus(salary);
    add(
      'salary',
      'Employee balances match salary control',
      salaryDiff.isZero(),
      `Difference ${salaryDiff.toFixed(2)} AFN`,
    );
    const ar = await tx.financeJournalLine.aggregate({
      where: {
        facilityId: actor.facilityId,
        account: { systemKey: { in: ['receivable', 'panel'] } },
        journal: { status: 'posted', date: { lt: p.endsOn }, invoiceId: null },
      },
      _sum: { baseDebit: true, baseCredit: true },
    });
    const arDiff = d(ar._sum.baseDebit ?? '0').minus(ar._sum.baseCredit ?? '0');
    add(
      'receivables',
      'Receivables allocated to invoices',
      arDiff.isZero(),
      `Unallocated control balance ${arDiff.toFixed(2)} AFN`,
    );
    const depreciation = await tx.$queryRaw<
      Array<{ code: string }>
    >`SELECT code FROM finance_missing_depreciation(${id})`;
    add(
      'assets',
      'Depreciation posted',
      depreciation.length === 0,
      depreciation.length
        ? depreciation.map((a) => a.code).join(', ')
        : 'No depreciation outstanding',
    );
    const events = await tx.financePeriodEvent.findMany({
      where: { periodId: id, facilityId: actor.facilityId },
      orderBy: { createdAt: 'desc' },
    });
    const actors = await tx.appUser.findMany({
      where: { id: { in: events.map((e) => e.actorId) } },
      select: { id: true, fullName: true },
    });
    return {
      periodId: id,
      label: p.label,
      state: p.lockedAt
        ? ('locked' as const)
        : p.closedAt
          ? ('closed' as const)
          : ('open' as const),
      canClose: !p.closedAt && checks.every((x) => x.passed),
      checks,
      events: events.map((e) => ({
        id: e.id,
        action: e.action,
        reason: e.reason,
        actor: actors.find((a) => a.id === e.actorId)?.fullName ?? e.actorId,
        at: e.createdAt.toISOString(),
      })),
    };
  }
  private async event(
    tx: AuditedTx,
    actor: FinanceActor,
    id: string,
    action: string,
    reason: string,
    details: object,
  ) {
    await tx.financePeriodEvent.create({
      data: {
        facilityId: actor.facilityId,
        periodId: id,
        actorId: actor.userId,
        action,
        reason,
        details: JSON.parse(JSON.stringify(details)) as Prisma.InputJsonValue,
      },
    });
    await tx.$executeRaw`SELECT set_config('app.finance_period_action',${id + ':' + action},true)`;
  }
  action(
    actor: FinanceActor,
    id: string,
    action: 'close' | 'lock' | 'reopen',
    input: z.infer<typeof c.periodActionSchema>,
  ) {
    return this.ledger.command(actor, 'period.' + action + ':' + id, input, async (tx) => {
      await tx.$queryRaw`SELECT id FROM facility WHERE id=${actor.facilityId} FOR UPDATE`;
      const p = await tx.fiscalPeriod.findFirst({ where: { id, facilityId: actor.facilityId } });
      if (!p) throw new NotFoundException('Period not found.');
      if (await tx.financeYearClosing.count({ where: { yearId: p.yearId } }))
        throw new ConflictException(
          'Use the year-end workflow while a year closing is prepared or finalized.',
        );
      const checklist = await this.checklist(actor, id, tx);
      if (action === 'close' && !checklist.canClose)
        throw new ConflictException(
          checklist.checks
            .filter((c) => !c.passed)
            .map((c) => c.label + ': ' + c.detail)
            .join('; ') || 'Period is already closed.',
        );
      if (action === 'lock' && (!p.closedAt || p.lockedAt))
        throw new ConflictException('Close the period before locking it.');
      if (action === 'reopen' && !p.closedAt)
        throw new ConflictException('Period is already open.');
      await this.event(tx, actor, id, action, input.reason, checklist);
      await tx.fiscalPeriod.update({
        where: { id },
        data:
          action === 'close'
            ? { closedAt: new Date(), closedBy: actor.userId }
            : action === 'lock'
              ? { lockedAt: new Date(), lockedBy: actor.userId }
              : { closedAt: null, closedBy: null, lockedAt: null, lockedBy: null },
      });
      return { id, action };
    });
  }
  year(
    actor: FinanceActor,
    id: string,
    action: 'prepare' | 'finalize' | 'cancel',
    input: z.infer<typeof c.periodActionSchema>,
  ) {
    return this.ledger.command(actor, 'year.' + action + ':' + id, input, async (tx) => {
      await tx.$queryRaw`SELECT id FROM facility WHERE id=${actor.facilityId} FOR UPDATE`;
      const y = await tx.fiscalYear.findFirst({
        where: { id, facilityId: actor.facilityId },
        include: {
          periods: { orderBy: { month: 'asc' } },
          closing: { include: { journal: true } },
        },
      });
      if (!y) throw new NotFoundException('Fiscal year not found.');
      if (y.closing?.finalizedAt) throw new ConflictException('This fiscal year is finalized.');
      if (action === 'cancel') {
        if (!y.closing || y.closing.journal?.status === 'posted')
          throw new ConflictException('Only an unposted year closing can be cancelled.');
        const journalId = y.closing.journalId;
        await tx.financeYearClosing.delete({ where: { id: y.closing.id } });
        if (journalId) {
          await tx.financeJournalLine.deleteMany({ where: { journalId } });
          await tx.financeJournal.delete({ where: { id: journalId } });
        }
        await this.event(tx, actor, y.periods[11].id, 'year_cancel', input.reason, {
          year: y.label,
        });
        return { cancelled: true };
      }
      if (y.endsOn > new Date()) throw new ConflictException('The fiscal year has not ended.');
      if (y.periods.slice(0, 11).some((p) => !p.closedAt))
        throw new ConflictException('Close months 1–11 first.');
      const last = y.periods[11];
      if (action === 'prepare') {
        if (y.closing || last.closedAt)
          throw new ConflictException('Reopen month 12 before preparing a new year closing.');
        const check = await this.checklist(actor, last.id, tx);
        if (!check.canClose)
          throw new ConflictException(
            check.checks
              .filter((c) => !c.passed)
              .map((c) => c.label + ': ' + c.detail)
              .join('; '),
          );
        if (
          await tx.fiscalYear.count({
            where: {
              facilityId: actor.facilityId,
              endsOn: { lte: y.startsOn },
              OR: [{ closing: { is: null } }, { closing: { is: { finalizedAt: null } } }],
              periods: { some: { journals: { some: { status: 'posted' } } } },
            },
          })
        )
          throw new ConflictException('Finalize earlier fiscal years with posted activity first.');
        const balances = await tx.financeJournalLine.groupBy({
          by: ['accountId', 'costCentreId'],
          where: {
            facilityId: actor.facilityId,
            account: { type: { in: ['revenue', 'expense'] } },
            journal: { status: 'posted', date: { lt: y.endsOn } },
          },
          _sum: { baseDebit: true, baseCredit: true },
        });
        const lines = balances
          .map((b) => {
            const v = d(b._sum.baseDebit ?? '0').minus(b._sum.baseCredit ?? '0');
            return {
              accountId: b.accountId,
              costCentreId: b.costCentreId,
              description: 'Year-end closing ' + y.label,
              debit: v.lt(0) ? v.negated().toFixed(2) : '0.00',
              credit: v.gt(0) ? v.toFixed(2) : '0.00',
            };
          })
          .filter((l) => l.debit !== '0.00' || l.credit !== '0.00');
        const net = lines.reduce((s, l) => s.add(l.debit).minus(l.credit), d('0'));
        if (!net.isZero()) {
          const retained = await this.ledger.systemAccount(tx, actor.facilityId, 'retained');
          lines.push({
            accountId: retained.id,
            costCentreId: null,
            description: 'Transfer result to retained earnings',
            debit: net.lt(0) ? net.negated().toFixed(2) : '0.00',
            credit: net.gt(0) ? net.toFixed(2) : '0.00',
          });
        }
        const closingId = randomUUID();
        const journal = lines.length
          ? await this.ledger.draftIn(
              tx,
              actor,
              {
                date: day(new Date(y.endsOn.getTime() - 86400000)),
                memo: 'Year-end closing ' + y.label,
                lines,
                idempotencyKey: input.idempotencyKey,
              },
              'year_close',
              closingId,
            )
          : null;
        await tx.financeYearClosing.create({
          data: {
            id: closingId,
            facilityId: actor.facilityId,
            yearId: id,
            journalId: journal?.id ?? null,
            preparedBy: actor.userId,
            snapshot: lines,
          },
        });
        await this.event(tx, actor, last.id, 'year_prepare', input.reason, {
          year: y.label,
          journalId: journal?.id ?? null,
        });
        return { journalId: journal?.id ?? null };
      }
      if (!y.closing || (y.closing.journal && y.closing.journal.status !== 'posted'))
        throw new ConflictException(
          'An independent reviewer must post the year-end journal first.',
        );
      if (y.closing.preparedBy === actor.userId)
        throw new ConflictException('An independent reviewer must finalize the fiscal year.');
      if (!last.closedAt) {
        const check = await this.checklist(actor, last.id, tx);
        if (!check.canClose)
          throw new ConflictException(
            check.checks
              .filter((c) => !c.passed)
              .map((c) => c.label)
              .join('; '),
          );
        await this.event(tx, actor, last.id, 'close', input.reason, check);
        await tx.fiscalPeriod.update({
          where: { id: last.id },
          data: { closedAt: new Date(), closedBy: actor.userId },
        });
      }
      for (const p of y.periods)
        if (!p.lockedAt) {
          await this.event(tx, actor, p.id, 'lock', input.reason, { year: y.label });
          await tx.fiscalPeriod.update({
            where: { id: p.id },
            data: { lockedAt: new Date(), lockedBy: actor.userId },
          });
        }
      await tx.financeYearClosing.update({
        where: { id: y.closing.id },
        data: { finalizedAt: new Date(), finalizedBy: actor.userId },
      });
      if (
        !(await tx.fiscalYear.count({ where: { facilityId: actor.facilityId, year: y.year + 1 } }))
      ) {
        const { periods, ...calendar } = c.fiscalYearCalendar(y.year + 1);
        await tx.fiscalYear.create({
          data: { ...calendar, facilityId: actor.facilityId, periods: { create: periods } },
        });
      }
      return { finalized: true, nextYear: y.year + 1 };
    });
  }
}
