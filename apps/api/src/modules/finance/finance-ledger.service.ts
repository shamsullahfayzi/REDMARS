import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  FinanceJournal,
  FinanceJournalInput,
  FinanceReport,
  financeAccountInputSchema,
  financeJournalEditSchema,
  fiscalYearInputSchema,
  fiscalYearCalendar,
  gregorianToShamsi,
  shamsiToGregorian,
  shamsiToUtc,
  utcToShamsi,
} from '@redmars/shared';
import { PrismaService, AuditedTx } from '../../prisma/prisma.service';
import { idempotentCommand } from '../../common/idempotent-command';
import { NumberSequenceService } from '../../services/number-sequence.service';
import { redact } from '../../prisma/transactional-audit';
import { openingCsv } from './finance-opening';
import { createHash } from 'node:crypto';

export type FinanceActor = { facilityId: string; userId: string };
export const day = (value: Date) => shamsiToGregorian(utcToShamsi(value));
export const date = (value: string) => shamsiToUtc(gregorianToShamsi(value));
export const nextDay = (value: string) => new Date(date(value).getTime() + 86400000);
export const endDay = (value: string) => new Date(nextDay(value).getTime() - 1);
const MoneyDecimal = Prisma.Decimal.clone({
  precision: 40,
  rounding: Prisma.Decimal.ROUND_HALF_UP,
});
export const decimal = (value: string | Prisma.Decimal) => {
  if (typeof value !== 'string' && !Prisma.Decimal.isDecimal(value))
    throw new TypeError('Money requires decimal text');
  const result = new MoneyDecimal(value);
  if (!result.isFinite()) throw new BadRequestException('Money must be finite.');
  return result;
};
export const journalInclude = {
  lines: { include: { account: true, costCentre: true }, orderBy: { id: 'asc' as const } },
  reversal: { select: { id: true, status: true } },
  creator: { select: { fullName: true } },
  poster: { select: { fullName: true } },
  period: { select: { label: true } },
} satisfies Prisma.FinanceJournalInclude;
type JournalRow = Prisma.FinanceJournalGetPayload<{ include: typeof journalInclude }>;
export const FINANCE_EVENTS = [
  'hmis.Invoice.create.v1',
  'hmis.Invoice.update.v1',
  'hmis.Invoice.delete.v1',
  'hmis.Payment.create.v1',
];
export const FINANCE_CONSUMER = 'finance.ledger.v1';

const CHART = [
  ['1000', 'Cash on hand', 'asset', 'cash', false, true],
  ['1010', 'Bank account', 'asset', 'bank', false, true],
  ['1020', 'Card clearing', 'asset', 'card', false, true],
  ['1030', 'Mobile money', 'asset', 'mobile_money', false, true],
  ['1100', 'Patient receivables', 'asset', 'receivable', true, false],
  ['1110', 'Panel receivables', 'asset', 'panel', true, false],
  ['2000', 'Supplier payables', 'liability', 'payable', true, false],
  ['3000', 'Opening equity', 'equity', 'opening', false, false],
  ['3100', 'Retained earnings', 'equity', 'retained', false, false],
  ['4000', 'Hospital service revenue', 'revenue', 'revenue', true, false],
  ['5000', 'General operating expenses', 'expense', 'expense', false, false],
  ['5100', 'Patient waivers', 'expense', 'waiver', true, false],
] as const;

@Injectable()
export class FinanceLedgerService {
  constructor(
    readonly prisma: PrismaService,
    private readonly sequence: NumberSequenceService,
  ) {}

  async command<T>(
    actor: FinanceActor,
    operation: string,
    input: { idempotencyKey: string },
    run: (tx: AuditedTx) => Promise<T>,
  ) {
    try {
      return await this.prisma.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('redmars.finance_actor', ${actor.userId}, true)`;
        return idempotentCommand(
          tx,
          {
            ...actor,
            operation: 'finance.' + operation,
            key: input.idempotencyKey,
            input,
          },
          () => run(tx),
        );
      });
    } catch (error) {
      const journalId = operation.startsWith('journal.') ? operation.split(':')[1] : undefined;
      const before = journalId
        ? await this.prisma.financeJournal.findFirst({
            where: { id: journalId, facilityId: actor.facilityId },
            include: { lines: true },
          })
        : null;
      await this.prisma.financeAudit.create({
        data: {
          facilityId: actor.facilityId,
          actorId: actor.userId,
          journalId: before?.id ?? null,
          action: 'rejected',
          entity: 'finance_command',
          entityId: before?.id ?? operation,
          before: before ? redact(before) : Prisma.DbNull,
          after: redact({
            operation,
            input,
            reason: error instanceof Error ? error.message : 'Rejected',
          }),
        },
      });
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException(
          'A record with this reference already exists. Reload before retrying.',
        );
      throw error;
    }
  }

  async settings(tx: AuditedTx, facilityId: string) {
    const settings = await tx.financeSettings.findUnique({ where: { facilityId } });
    if (!settings)
      throw new BadRequestException('Initialize finance before entering transactions.');
    if (settings.currency !== 'AFN')
      throw new BadRequestException('This release supports AFN books only.');
    return settings;
  }

  setup(actor: FinanceActor, input: { cutoverDate: string; idempotencyKey: string }) {
    return this.command(actor, 'setup', input, async (tx) => {
      const facility = await tx.facility.findUniqueOrThrow({ where: { id: actor.facilityId } });
      if (facility.currency !== 'AFN')
        throw new BadRequestException('The facility must use AFN for this finance release.');
      if (await tx.financeSettings.findUnique({ where: { facilityId: actor.facilityId } }))
        throw new ConflictException(
          'Finance is already initialized; its cutover date cannot be reset.',
        );
      await tx.financeSettings.create({
        data: {
          facilityId: actor.facilityId,
          currency: 'AFN',
          cutoverDate: date(input.cutoverDate),
        },
      });
      for (const [code, name, type, systemKey, isControl, isCash] of CHART)
        await tx.financeAccount.create({
          data: { facilityId: actor.facilityId, code, name, type, systemKey, isControl, isCash },
        });
      await tx.$queryRaw`SELECT finance_install_chart(${actor.facilityId})::text`;
      await tx.$queryRaw`SELECT finance_install_revenue(${actor.facilityId})::text`;
      for (const year of new Set([1404, Number(gregorianToShamsi(input.cutoverDate).slice(0, 4))]))
        await this.createYearIn(tx, actor.facilityId, year);
      return { initialized: true };
    });
  }

  createAccount(actor: FinanceActor, input: z.infer<typeof financeAccountInputSchema>) {
    return this.command(actor, 'account.create', input, async (tx) => {
      await this.settings(tx, actor.facilityId);
      return tx.financeAccount.create({
        data: {
          code: input.code,
          name: input.name,
          type: input.type,
          parentId: input.parentId ?? null,
          normalBalance:
            input.normalBalance ?? (['asset', 'expense'].includes(input.type) ? 'debit' : 'credit'),
          isPosting: input.isPosting,
          isCash: input.isCash,
          facilityId: actor.facilityId,
        },
      });
    });
  }

  private async createYearIn(tx: AuditedTx, facilityId: string, year: number) {
    const calendar = fiscalYearCalendar(year);
    const { periods, ...data } = calendar;
    return tx.fiscalYear.create({
      data: { ...data, facilityId, periods: { create: periods } },
    });
  }

  createFiscalYear(actor: FinanceActor, input: z.infer<typeof fiscalYearInputSchema>) {
    return this.command(actor, 'year.create', input, async (tx) => {
      await this.settings(tx, actor.facilityId);
      await tx.$queryRaw`SELECT id FROM facility WHERE id = ${actor.facilityId} FOR UPDATE`;
      const year = await this.createYearIn(tx, actor.facilityId, input.year);
      return { id: year.id };
    });
  }

  closePeriod(actor: FinanceActor, id: string, input: { idempotencyKey: string }) {
    return this.command(actor, 'period.close:' + id, input, async (tx) => {
      await tx.$queryRaw`SELECT id FROM facility WHERE id=${actor.facilityId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM finance_period WHERE id = ${id} AND facility_id = ${actor.facilityId} FOR UPDATE`;
      const period = await tx.fiscalPeriod.findFirst({
        where: { id, facilityId: actor.facilityId },
      });
      if (!period) throw new NotFoundException('Period not found');
      if (period.closedAt) throw new ConflictException('Period is already closed.');
      if (await tx.financeJournal.count({ where: { periodId: id, status: 'draft' } }))
        throw new ConflictException('Post or remove draft journals before closing the period.');
      if (await tx.payrollRun.count({ where: { periodId: id, status: { not: 'approved' } } }))
        throw new ConflictException(
          'Complete payroll review and approval before closing the period.',
        );
      const settings = await this.settings(tx, actor.facilityId);
      // Kabul local dates: source instants must be compared against the same calendar as posting.
      const from = period.startsOn > settings.cutoverDate ? period.startsOn : settings.cutoverDate;
      const until = period.endsOn;
      if (
        await tx.integrationEvent.count({
          where: {
            facilityId: actor.facilityId,
            type: { in: FINANCE_EVENTS },
            occurredAt: { gte: from, lt: until },
            receipts: { none: { consumer: FINANCE_CONSUMER } },
          },
        })
      )
        throw new ConflictException(
          'Process the outstanding hospital billing events before closing this period.',
        );
      await tx.fiscalPeriod.update({
        where: { id },
        data: { closedAt: new Date(), closedBy: actor.userId },
      });
      return { closed: true };
    });
  }

  async periodFor(tx: AuditedTx, facilityId: string, on: string | Date) {
    const instant = typeof on === 'string' ? date(on) : on;
    const settings = await this.settings(tx, facilityId);
    if (instant < settings.cutoverDate)
      throw new BadRequestException('The date precedes the finance cutover date.');
    if (
      await tx.financeLegacyPeriod.count({
        where: {
          facilityId,
          closedAt: { not: null },
          startsOn: { lte: instant },
          endsOn: { gt: instant },
        },
      })
    )
      throw new ConflictException('This date belongs to a closed legacy accounting period.');
    const period = await tx.fiscalPeriod.findFirst({
      where: { facilityId, startsOn: { lte: instant }, endsOn: { gt: instant } },
    });
    if (!period)
      throw new BadRequestException(
        `Create Shamsi fiscal year ${utcToShamsi(instant).slice(0, 4)} before posting.`,
      );
    await tx.$queryRaw`SELECT id FROM finance_period WHERE id = ${period.id} FOR UPDATE`;
    if (period.closedAt) throw new ConflictException('The accounting period is closed.');
    return period;
  }

  async validateLines(
    tx: AuditedTx,
    facilityId: string,
    lines: FinanceJournalInput['lines'],
    controls: boolean,
    limit = 100,
  ) {
    if (lines.length < 2 || lines.length > limit)
      throw new BadRequestException(`A journal requires 2–${limit} lines.`);
    const ids = [...new Set(lines.map((l) => l.accountId))];
    const accounts = await tx.financeAccount.findMany({
      where: { facilityId, id: { in: ids }, isActive: true, isPosting: true },
    });
    if (accounts.length !== ids.length)
      throw new BadRequestException('Choose active accounts from this facility.');
    if (!controls && accounts.some((a) => a.isControl))
      throw new BadRequestException(
        'Control accounts are reserved for hospital and supplier transactions.',
      );
    const centres = [...new Set(lines.flatMap((l) => (l.costCentreId ? [l.costCentreId] : [])))];
    if (
      (await tx.financeCostCentre.count({
        where: { facilityId, id: { in: centres }, isActive: true },
      })) !== centres.length
    )
      throw new BadRequestException('Choose active cost centres from this facility.');
    for (const line of lines) {
      if (
        ![line.debit, line.credit].every(
          (v) => typeof v === 'string' && /^\d{1,12}(\.\d{1,2})?$/.test(v),
        )
      )
        throw new BadRequestException(
          'Use decimal money with at most two places and twelve whole digits.',
        );
      const d = decimal(line.debit),
        c = decimal(line.credit);
      if (d.isNegative() || c.isNegative() || d.greaterThan(0) === c.greaterThan(0))
        throw new BadRequestException('Each line requires one positive debit or credit.');
    }
  }

  async draftIn(
    tx: AuditedTx,
    actor: FinanceActor,
    input: FinanceJournalInput,
    sourceType = 'manual',
    sourceId: string | null = null,
    effectiveAt?: Date,
  ) {
    const instant = effectiveAt ?? date(input.date);
    if (day(instant) !== input.date)
      throw new BadRequestException('Posting date and source instant disagree.');
    const period = await this.periodFor(tx, actor.facilityId, instant);
    await this.validateLines(
      tx,
      actor.facilityId,
      input.lines,
      sourceType !== 'manual',
      ['opening_import','year_close'].includes(sourceType) ? 1000 : 100,
    );
    return tx.financeJournal.create({
      data: {
        facilityId: actor.facilityId,
        periodId: period.id,
        date: instant,
        currency: 'AFN',
        memo: input.memo,
        createdBy: actor.userId,
        sourceType,
        sourceId,
        lines: { create: input.lines },
      },
    });
  }

  createJournal(actor: FinanceActor, input: FinanceJournalInput) {
    return this.command(actor, 'journal.create', input, async (tx) => {
      const journal = await this.draftIn(tx, actor, input);
      return this.getJournal(actor.facilityId, journal.id, tx);
    });
  }

  editJournal(actor: FinanceActor, id: string, input: z.infer<typeof financeJournalEditSchema>) {
    return this.command(actor, 'journal.edit:' + id, input, async (tx) => {
      const journal = await this.requireJournal(tx, actor.facilityId, id);
      if (
        journal.status !== 'draft' ||
        journal.sourceType !== 'manual' ||
        journal.version !== input.expectedVersion
      )
        throw new ConflictException('Only the current version of a manual draft can be edited.');
      const period = await this.periodFor(tx, actor.facilityId, input.date);
      await this.validateLines(tx, actor.facilityId, input.lines, false);
      await tx.financeJournalLine.deleteMany({ where: { journalId: id } });
      await tx.financeJournal.update({
        where: { id },
        data: {
          date: date(input.date),
          memo: input.memo,
          periodId: period.id,
          createdBy: actor.userId,
          version: { increment: 1 },
          lines: { create: input.lines },
        },
      });
      return this.getJournal(actor.facilityId, id, tx);
    });
  }

  deleteDraft(
    actor: FinanceActor,
    id: string,
    input: { expectedVersion: number; idempotencyKey: string },
  ) {
    return this.command(actor, 'journal.delete:' + id, input, async (tx) => {
      await tx.$queryRaw`SELECT id FROM facility WHERE id=${actor.facilityId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM finance_journal WHERE id=${id} AND facility_id=${actor.facilityId} FOR UPDATE`;
      const journal = await this.requireJournal(tx, actor.facilityId, id);
      if (
        journal.status !== 'draft' ||
        ![
          'manual',
          'opening_import',
          'expense',
          'supplier_bill',
          'supplier_payment',
          'payroll_payment',
          'payroll_loan',
          'bank_transfer',
          'asset_acquisition',
          'asset_depreciation',
          'asset_disposal',
        ].includes(journal.sourceType) ||
        journal.version !== input.expectedVersion
      )
        throw new ConflictException(
          'Only the current version of an eligible draft can be removed.',
        );
      await tx.$queryRaw`SELECT set_config('redmars.finance_discard', ${id}, true)`;
      if (journal.sourceType.startsWith('asset_')) {
        const entry = await tx.financeAssetEntry.findUniqueOrThrow({ where: { journalId: id } });
        const others = await tx.financeAssetEntry.findMany({
          where: {
            assetId: entry.assetId,
            journalId: { not: id },
            journal: { OR: [{ reversal: null }, { reversal: { status: 'draft' } }] },
          },
          include: { journal: true },
        });
        if (
          others.some(
            (e) =>
              e.journal.date > journal.date ||
              (e.journal.date.getTime() === journal.date.getTime() &&
                (entry.kind === 'acquisition' || e.kind === 'disposal')),
          )
        )
          throw new ConflictException('Remove or reverse later asset entries first.');
        await tx.financeAssetEntry.delete({ where: { id: entry.id } });
        if (entry.kind === 'acquisition')
          await tx.financeAsset.delete({ where: { id: entry.assetId } });
      }
      if (journal.sourceType.startsWith('payroll_')) {
        await tx.$queryRaw`SELECT id FROM facility WHERE id=${actor.facilityId} FOR UPDATE`;
        if (await tx.payrollRepayment.count({ where: { loan: { journalId: id } } }))
          throw new ConflictException('Recalculate affected payroll before removing this loan.');
        await tx.payrollPayment.deleteMany({
          where: { facilityId: actor.facilityId, journalId: id },
        });
        await tx.payrollLoan.deleteMany({ where: { facilityId: actor.facilityId, journalId: id } });
      }
      await tx.financeSettlement.deleteMany({
        where: { facilityId: actor.facilityId, journalId: id },
      });
      await tx.financeBill.deleteMany({ where: { facilityId: actor.facilityId, journalId: id } });
      await tx.financeJournalLine.deleteMany({ where: { journalId: id } });
      await tx.financeJournal.delete({ where: { id } });
      return { deleted: true };
    });
  }

  async postIn(tx: AuditedTx, actor: FinanceActor, id: string, version: number) {
    await tx.$queryRaw`SELECT id FROM facility WHERE id=${actor.facilityId} FOR UPDATE`;
    const journal = await this.requireJournal(tx, actor.facilityId, id);
    if (journal.status !== 'draft' || journal.version !== version)
      throw new ConflictException('Journal changed or is already posted.');
    if (journal.createdBy === actor.userId)
      throw new ConflictException('A different accountant must review and post this entry.');
    const period = await this.periodFor(tx, actor.facilityId, journal.date);
    if (period.id !== journal.periodId)
      throw new ConflictException('Journal period does not match its date.');
    const lines = journal.lines.map((l) => ({
      accountId: l.accountId,
      costCentreId: l.costCentreId,
      description: l.description,
      debit: l.debit.toFixed(2),
      credit: l.credit.toFixed(2),
    }));
    await this.validateLines(
      tx,
      actor.facilityId,
      lines,
      journal.sourceType !== 'manual',
      ['opening_import','year_close'].includes(journal.sourceType) ? 1000 : 100,
    );
    const finalized = await tx.financeStatement.findFirst({
      where: {
        facilityId: actor.facilityId,
        accountId: { in: lines.map((l) => l.accountId) },
        reconciledAt: { not: null },
        endsOn: { gte: journal.date },
      },
    });
    if (finalized)
      throw new ConflictException(
        'A finalized cash/bank reconciliation covers this date. Use a later open date for the adjustment.',
      );
    const debits = journal.lines.reduce((sum, l) => sum.add(l.baseDebit), decimal('0'));
    const credits = journal.lines.reduce((sum, l) => sum.add(l.baseCredit), decimal('0'));
    if (!debits.eq(credits) || debits.isZero())
      throw new BadRequestException(
        'Total debits must equal total credits and be greater than zero.',
      );
    const number = await this.sequence.next(actor.facilityId, 'finance_journal', journal.date, tx);
    await tx.financeJournal.update({
      where: { id },
      data: {
        status: 'posted',
        number: number.formatted,
        postedBy: actor.userId,
        postedAt: new Date(),
        version: { increment: 1 },
      },
    });
    return this.getJournal(actor.facilityId, id, tx);
  }

  postJournal(
    actor: FinanceActor,
    id: string,
    input: { expectedVersion: number; idempotencyKey: string },
  ) {
    return this.command(actor, 'journal.post:' + id, input, (tx) =>
      this.postIn(tx, actor, id, input.expectedVersion),
    );
  }

  async automatic(
    tx: AuditedTx,
    actor: FinanceActor,
    input: FinanceJournalInput,
    sourceType: string,
    sourceId: string,
    effectiveAt?: Date,
  ) {
    const journal = await this.draftIn(tx, actor, input, sourceType, sourceId, effectiveAt);
    return this.getJournal(actor.facilityId, journal.id, tx);
  }

  reverse(
    actor: FinanceActor,
    id: string,
    input: { date: string; reason: string; idempotencyKey: string },
  ) {
    return this.command(actor, 'journal.reverse:' + id, input, async (tx) => {
      await tx.$queryRaw`SELECT id FROM facility WHERE id=${actor.facilityId} FOR UPDATE`;
      const original = await this.requireJournal(tx, actor.facilityId, id);
      if (original.status !== 'posted' || original.reversal || original.reversalOfId)
        throw new ConflictException('Only an unreversed posted journal can be reversed.');
      const assetEntry = await tx.financeAssetEntry.findUnique({ where: { journalId: id } });
      if (assetEntry) {
        const later = await tx.financeAssetEntry.findMany({
          where: {
            assetId: assetEntry.assetId,
            journalId: { not: id },
            journal: { OR: [{ reversal: null }, { reversal: { status: 'draft' } }] },
          },
          include: { journal: true },
        });
        if (
          later.some(
            (e) =>
              e.journal.date > original.date ||
              (e.journal.date.getTime() === original.date.getTime() &&
                (assetEntry.kind === 'acquisition' || e.kind === 'disposal')),
          )
        )
          throw new ConflictException('Reverse later asset entries before this one.');
      }
      if (
        await tx.financeAsset.count({
          where: {
            billLine: { journalId: id },
            entries: {
              some: {
                kind: 'acquisition',
                journal: { OR: [{ reversal: null }, { reversal: { status: 'draft' } }] },
              },
            },
          },
        })
      )
        throw new ConflictException('Reverse capitalized assets before their supplier bill.');
      if (original.sourceType === 'hospital')
        throw new BadRequestException(
          'Correct hospital charges or payments in their source workflow, then synchronize finance.',
        );
      if (original.sourceType === 'payroll_accrual')
        throw new ConflictException(
          'Approved payroll accrual is immutable. Record corrections in a subsequent payroll period.',
        );
      if (
        original.sourceType === 'payroll_loan' &&
        (await tx.payrollRepayment.count({ where: { loan: { journalId: id } } }))
      )
        throw new ConflictException('This loan has payroll deductions and cannot be reversed.');
      if (date(input.date) < original.date)
        throw new BadRequestException('Reversal date must not precede the original posting.');
      const bill = await tx.financeBill.findUnique({
        where: { journalId: id },
        include: { settlements: { include: { journal: { include: { reversal: true } } } } },
      });
      if (bill?.settlements.some((s) => s.journal.reversal?.status !== 'posted'))
        throw new ConflictException('Reverse supplier payments before reversing the bill.');
      if (
        await tx.financeJournalLine.count({
          where: { journalId: id, statementLine: { statement: { reconciledAt: { not: null } } } },
        })
      )
        throw new ConflictException(
          'This transaction is in a finalized statement. Enter an adjusting journal in an open period.',
        );
      const draft = await this.draftIn(
        tx,
        actor,
        {
          date: input.date,
          memo: `Reversal ${original.number}: ${input.reason}`.slice(0, 240),
          idempotencyKey: input.idempotencyKey,
          lines: original.lines.map((l) => ({
            accountId: l.accountId,
            costCentreId: l.costCentreId,
            description: input.reason,
            debit: l.credit.toFixed(2),
            credit: l.debit.toFixed(2),
          })),
        },
        'reversal',
        id,
      );
      await tx.financeJournal.update({
        where: { id: draft.id },
        data: { reversalOfId: id, invoiceId: original.invoiceId, panelId: original.panelId },
      });
      return this.getJournal(actor.facilityId, draft.id, tx);
    });
  }

  async systemAccount(tx: AuditedTx, facilityId: string, systemKey: string) {
    const account = await tx.financeAccount.findUnique({
      where: { facilityId_systemKey: { facilityId, systemKey } },
    });
    if (!account?.isActive)
      throw new BadRequestException(`Missing active system account: ${systemKey}`);
    return account;
  }

  async requireJournal(tx: AuditedTx, facilityId: string, id: string) {
    const journal = await tx.financeJournal.findFirst({
      where: { id, facilityId },
      include: journalInclude,
    });
    if (!journal) throw new NotFoundException('Journal not found');
    return journal;
  }

  async getJournal(
    facilityId: string,
    id: string,
    tx: AuditedTx = this.prisma.db,
  ): Promise<FinanceJournal> {
    return this.serialize(await this.requireJournal(tx, facilityId, id));
  }

  serialize(row: JournalRow): FinanceJournal {
    return {
      id: row.id,
      number: row.number,
      date: day(row.date),
      effectiveAt: row.date.toISOString(),
      periodLabel: row.period.label,
      currency: 'AFN',
      memo: row.memo,
      status: row.status,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      version: row.version,
      reversalOfId: row.reversalOfId,
      reversalId: row.reversal?.id ?? null,
      postedAt: row.postedAt?.toISOString() ?? null,
      createdBy: row.createdBy,
      createdByName: row.creator.fullName,
      postedByName: row.poster?.fullName ?? null,
      reversalStatus: row.reversal?.status ?? null,
      lines: row.lines.map((l) => ({
        id: l.id,
        accountId: l.accountId,
        accountCode: l.account.code,
        accountName: l.account.name,
        costCentreId: l.costCentreId,
        costCentreName: l.costCentre?.name ?? null,
        description: l.description,
        debit: l.debit.toFixed(2),
        credit: l.credit.toFixed(2),
        currency: l.currency,
        exchangeRate: l.exchangeRate.toFixed(10),
        baseDebit: l.baseDebit.toFixed(2),
        baseCredit: l.baseCredit.toFixed(2),
      })),
    };
  }

  report(facilityId: string, from: string, to: string): Promise<FinanceReport> {
    return this.prisma.db.$transaction(async (tx) => {
      await this.settings(tx, facilityId);
      const accounts = await tx.financeAccount.findMany({
        where: { facilityId, isPosting: true },
        orderBy: { code: 'asc' },
      });
      const [opening, movement] = await Promise.all([
        tx.financeJournalLine.groupBy({
          by: ['accountId'],
          where: { facilityId, journal: { status: 'posted', date: { lt: date(from) } } },
          _sum: { debit: true, credit: true },
        }),
        tx.financeJournalLine.groupBy({
          by: ['accountId'],
          where: {
            facilityId,
            journal: { status: 'posted', date: { gte: date(from), lt: nextDay(to) } },
          },
          _sum: { debit: true, credit: true },
        }),
      ]);
      const rows = accounts.map((a) => {
        const o = opening.find((r) => r.accountId === a.id),
          m = movement.find((r) => r.accountId === a.id);
        const start = decimal(o?._sum.debit ?? '0').sub(o?._sum.credit ?? '0'),
          debit = decimal(m?._sum.debit ?? '0'),
          credit = decimal(m?._sum.credit ?? '0');
        return {
          accountId: a.id,
          code: a.code,
          name: a.name,
          type: a.type,
          opening: start.toFixed(2),
          debit: debit.toFixed(2),
          credit: credit.toFixed(2),
          closing: start.add(debit).sub(credit).toFixed(2),
        };
      });
      const sum = (type: string, field: 'closing' | 'debit' | 'credit') =>
        rows.filter((r) => r.type === type).reduce((n, r) => n.add(r[field]), decimal('0'));
      const debits = rows.reduce((n, r) => n.add(r.debit), decimal('0')),
        credits = rows.reduce((n, r) => n.add(r.credit), decimal('0'));
      const closingDebit = rows.reduce(
        (n, r) => n.add(Prisma.Decimal.max(r.closing, '0')),
        decimal('0'),
      );
      const closingCredit = rows.reduce(
        (n, r) => n.add(Prisma.Decimal.max(decimal(r.closing).negated(), '0')),
        decimal('0'),
      );
      const closingLines = await tx.financeJournalLine.findMany({where:{facilityId,journal:{status:'posted',sourceType:'year_close',date:{gte:date(from),lt:nextDay(to)}}},include:{account:true}});
      const closingNet=(type:string)=>closingLines.filter(l=>l.account.type===type).reduce((v,l)=>v.add(l.baseDebit).minus(l.baseCredit),decimal('0'));
      const income = sum('revenue', 'credit').sub(sum('revenue', 'debit')).add(closingNet('revenue')),
        expenses = sum('expense', 'debit').sub(sum('expense', 'credit')).sub(closingNet('expense'));
      const assets = sum('asset', 'closing'),
        liabilities = sum('liability', 'closing').negated(),
        equity = sum('equity', 'closing').negated();
      const retainedResult = sum('revenue', 'closing').add(sum('expense', 'closing')).negated();
      return {
        from,
        to,
        currency: 'AFN',
        accounts: rows,
        debit: debits.toFixed(2),
        credit: credits.toFixed(2),
        balanced: debits.eq(credits) && closingDebit.eq(closingCredit),
        closingDebit: closingDebit.toFixed(2),
        closingCredit: closingCredit.toFixed(2),
        income: income.toFixed(2),
        expenses: expenses.toFixed(2),
        netIncome: income.sub(expenses).toFixed(2),
        assets: assets.toFixed(2),
        liabilities: liabilities.toFixed(2),
        equity: equity.toFixed(2),
        retainedResult: retainedResult.toFixed(2),
        balanceSheetDifference: assets.sub(liabilities).sub(equity).sub(retainedResult).toFixed(2),
      };
    });
  }

  async journalPage(facilityId: string, page: number, status?: 'draft' | 'posted') {
    return this.prisma.db.$transaction(async (tx) => {
      const where = { facilityId, ...(status ? { status } : {}) };
      const total = await tx.financeJournal.count({ where });
      const rows = await tx.financeJournal.findMany({
        where,
        include: journalInclude,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * 50,
        take: 50,
      });
      return { journals: rows.map((row) => this.serialize(row)), total, page, pageSize: 50 };
    });
  }

  async previewOpening(
    facilityId: string,
    input: { filename: string; csv: string },
    tx: AuditedTx = this.prisma.db,
  ) {
    const settings = await this.settings(tx, facilityId);
    const parsed = openingCsv(input.csv);
    const accounts = await tx.financeAccount.findMany({
      where: {
        facilityId,
        isActive: true,
        isPosting: true,
        code: { in: parsed.map((r) => r.accountCode) },
      },
    });
    const rows = parsed.map((r) => {
      const a = accounts.find((a) => a.code === r.accountCode);
      if (!a) throw new BadRequestException(`Unknown or nonposting account: ${r.accountCode}`);
      return {
        accountId: a.id,
        code: a.code,
        name: a.name,
        debit: r.debit,
        credit: r.credit,
        description: r.description,
      };
    });
    await this.validateLines(tx, facilityId, rows, true, 1000);
    const debit = rows.reduce((n, r) => n.add(r.debit), decimal('0')),
      credit = rows.reduce((n, r) => n.add(r.credit), decimal('0'));
    if (debit.isZero() || !debit.eq(credit))
      throw new BadRequestException('Opening debits and credits must balance exactly.');
    return {
      date: day(settings.cutoverDate),
      filename: input.filename,
      debit: debit.toFixed(2),
      credit: credit.toFixed(2),
      rows,
    };
  }

  importOpening(
    actor: FinanceActor,
    input: { filename: string; csv: string; idempotencyKey: string },
  ) {
    return this.command(actor, 'opening.import', input, async (tx) => {
      await tx.$queryRaw`SELECT id FROM facility WHERE id=${actor.facilityId} FOR UPDATE`;
      const existing = await tx.financeJournal.findMany({
        where: { facilityId: actor.facilityId, sourceType: 'opening_import' },
        include: { reversal: true },
      });
      if (existing.some((j) => j.reversal?.status !== 'posted'))
        throw new ConflictException(
          'An opening import already exists. Reverse the posted import before replacing it.',
        );
      const preview = await this.previewOpening(actor.facilityId, input, tx);
      const hash = createHash('sha256').update(input.csv).digest('hex');
      const journal = await this.draftIn(
        tx,
        actor,
        {
          date: preview.date,
          memo: `Opening ${input.filename} · SHA256 ${hash}`.slice(0, 240),
          idempotencyKey: input.idempotencyKey,
          lines: preview.rows.map(({ accountId, debit, credit, description }) => ({
            accountId,
            debit,
            credit,
            description,
          })),
        },
        'opening_import',
        input.idempotencyKey,
      );
      return this.getJournal(actor.facilityId, journal.id, tx);
    });
  }

  async audit(facilityId: string, id: string, page: number) {
    const where = { facilityId, journalId: id };
    return this.prisma.db.$transaction(async (tx) => {
      const total = await tx.financeAudit.count({ where });
      const rows = await tx.financeAudit.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
        take: 50,
        skip: (page - 1) * 50,
      });
      const users = await tx.appUser.findMany({
        where: { facilityId, id: { in: rows.flatMap((r) => (r.actorId ? [r.actorId] : [])) } },
        select: { id: true, fullName: true },
      });
      return {
        total,
        page,
        rows: rows.map((r) => ({
          ...r,
          occurredAt: r.occurredAt.toISOString(),
          actorName: users.find((u) => u.id === r.actorId)?.fullName ?? 'Database / migration',
        })),
      };
    });
  }

  ledger(facilityId: string, accountId: string, from: string, to: string, page = 1) {
    return this.prisma.db.$transaction(async (tx) => {
      if (!(await tx.financeAccount.findFirst({ where: { id: accountId, facilityId } })))
        throw new NotFoundException('Account not found');
      const before = await tx.financeJournalLine.aggregate({
        where: { facilityId, accountId, journal: { status: 'posted', date: { lt: date(from) } } },
        _sum: { debit: true, credit: true },
      });
      const where = {
        facilityId,
        accountId,
        journal: { status: 'posted' as const, date: { gte: date(from), lt: nextDay(to) } },
      };
      const total = await tx.financeJournalLine.count({ where });
      const movement = await tx.financeJournalLine.aggregate({
        where,
        _sum: { baseDebit: true, baseCredit: true },
      });
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          journal_id: string;
          number: string;
          date: Date;
          memo: string;
          debit: Prisma.Decimal;
          credit: Prisma.Decimal;
          running: Prisma.Decimal;
          matched: boolean;
        }>
      >`
        SELECT l.id,l.journal_id,j.number,j.date,j.memo,l.base_debit AS debit,l.base_credit AS credit,
          sum(l.base_debit-l.base_credit) OVER (ORDER BY j.date,j.number,l.id ROWS UNBOUNDED PRECEDING) AS running,
          EXISTS(SELECT 1 FROM finance_statement_line s WHERE s.journal_line_id=l.id) AS matched
        FROM finance_journal_line l JOIN finance_journal j ON j.id=l.journal_id
        WHERE l.facility_id=${facilityId} AND l.account_id=${accountId} AND j.status='posted'
          AND j.date>=${date(from)} AND j.date<${nextDay(to)}
        ORDER BY j.date,j.number,l.id LIMIT 200 OFFSET ${(page - 1) * 200}`;
      const opening = decimal(before._sum.debit ?? '0').sub(before._sum.credit ?? '0');
      const lines = rows.map((l) => {
        return {
          id: l.id,
          journalId: l.journal_id,
          number: l.number,
          date: day(l.date),
          memo: l.memo,
          debit: l.debit.toFixed(2),
          credit: l.credit.toFixed(2),
          balance: opening.add(l.running).toFixed(2),
          matched: l.matched,
        };
      });
      return {
        opening: opening.toFixed(2),
        closing: opening
          .add(movement._sum.baseDebit ?? '0')
          .sub(movement._sum.baseCredit ?? '0')
          .toFixed(2),
        truncated: total > page * 200,
        page,
        pageSize: 200,
        total,
        lines,
      };
    });
  }
}
