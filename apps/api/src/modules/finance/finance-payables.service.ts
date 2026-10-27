import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import * as c from '@redmars/shared';
import { AuditedTx } from '../../prisma/prisma.service';
import {
  FinanceActor,
  FinanceLedgerService,
  date,
  day,
  nextDay,
  decimal,
} from './finance-ledger.service';

const billInclude = {
  supplier: true,
  receipt: true,
  journal: { include: { reversal: true } },
  settlements: { include: { journal: { include: { reversal: true } } } },
} satisfies Prisma.FinanceBillInclude;
type Bill = Prisma.FinanceBillGetPayload<{ include: typeof billInclude }>;
const live = (j: { status: string; date: Date }, until: Date) =>
  j.status === 'posted' && j.date < until;
const amountAt = (b: Bill, until: Date) => {
  const billed =
    live(b.journal, until) && !(b.journal.reversal && live(b.journal.reversal, until))
      ? b.amount
      : decimal('0');
  const paid = b.settlements
    .filter(
      (s) => live(s.journal, until) && !(s.journal.reversal && live(s.journal.reversal, until)),
    )
    .reduce((n, s) => n.add(s.amount), decimal('0'));
  const reserved = b.settlements
    .filter((s) => s.journal.status === 'draft')
    .reduce((n, s) => n.add(s.amount), decimal('0'));
  return { billed, paid, reserved, outstanding: billed.sub(paid) };
};

@Injectable()
export class FinancePayablesService {
  constructor(private readonly ledger: FinanceLedgerService) {}
  async workspace(facilityId: string) {
    const tx = this.ledger.prisma.db;
    const [centres, mappings, receipts] = await Promise.all([
      tx.financeCostCentre.findMany({ where: { facilityId }, orderBy: { code: 'asc' } }),
      tx.financeExpenseMapping.findMany({ where: { facilityId }, orderBy: { category: 'asc' } }),
      tx.financeProcurementReceipt.findMany({
        where: { facilityId },
        include: { supplier: true, bill: true },
        orderBy: { receivedOn: 'desc' },
      }),
    ]);
    return {
      centres,
      mappings,
      receipts: receipts.map((r) => ({
        ...r,
        supplierName: r.supplier.name,
        receivedOn: day(r.receivedOn),
        amount: r.amount.toFixed(2),
        billId: r.bill?.id ?? null,
        journalId: r.bill?.journalId ?? null,
      })),
    };
  }
  centre(actor: FinanceActor, input: z.infer<typeof c.costCentreInputSchema>) {
    return this.ledger.command(actor, 'centre.create', input, async (tx) => {
      await this.ledger.settings(tx, actor.facilityId);
      return tx.financeCostCentre.create({
        data: { facilityId: actor.facilityId, code: input.code, name: input.name },
      });
    });
  }
  async account(
    tx: AuditedTx,
    facilityId: string,
    id: string,
    kind: 'charge' | 'cash' | 'opening',
  ) {
    const a = await tx.financeAccount.findFirst({
      where: { id, facilityId, isActive: true, isPosting: true },
    });
    if (
      !a ||
      a.isControl ||
      (kind === 'cash'
        ? !a.isCash
        : kind === 'opening'
          ? a.systemKey !== 'opening'
          : a.isCash || !['expense', 'asset'].includes(a.type))
    )
      throw new BadRequestException(
        kind === 'cash'
          ? 'Choose an active cash/bank account.'
          : 'Choose an active expense or non-cash asset account.',
      );
    return a;
  }
  private async centreCheck(tx: AuditedTx, facilityId: string, id?: string | null) {
    if (
      id &&
      !(await tx.financeCostCentre.findFirst({ where: { id, facilityId, isActive: true } }))
    )
      throw new BadRequestException('Choose an active cost centre in this facility.');
  }
  mapping(actor: FinanceActor, input: z.infer<typeof c.expenseMappingInputSchema>) {
    return this.ledger.command(actor, 'expense.mapping', input, async (tx) => {
      await this.account(tx, actor.facilityId, input.accountId, 'charge');
      await this.centreCheck(tx, actor.facilityId, input.costCentreId);
      const data = { accountId: input.accountId, costCentreId: input.costCentreId ?? null };
      return tx.financeExpenseMapping.upsert({
        where: { facilityId_category: { facilityId: actor.facilityId, category: input.category } },
        create: { facilityId: actor.facilityId, category: input.category, ...data },
        update: data,
      });
    });
  }
  updateSupplier(actor: FinanceActor, id: string, input: z.infer<typeof c.supplierUpdateSchema>) {
    return this.ledger.command(actor, 'supplier.update:' + id, input, async (tx) => {
      if (!(await tx.financeSupplier.findFirst({ where: { id, facilityId: actor.facilityId } })))
        throw new NotFoundException('Supplier not found.');
      const { name, reference, termsDays, terms, contact, isActive } = input;
      const data = { name, reference, termsDays, terms, contact, isActive };
      return tx.financeSupplier.update({ where: { id }, data });
    });
  }
  private async supplier(tx: AuditedTx, facilityId: string, id: string) {
    const supplier = await tx.financeSupplier.findFirst({
      where: { id, facilityId, isActive: true },
    });
    if (!supplier) throw new NotFoundException('Active supplier not found.');
    return supplier;
  }
  private async mapped(
    tx: AuditedTx,
    facilityId: string,
    input: { category?: string; accountId?: string; costCentreId?: string | null },
  ) {
    const map = input.category
      ? await tx.financeExpenseMapping.findUnique({
          where: { facilityId_category: { facilityId, category: input.category } },
        })
      : null;
    if (input.category && !map)
      throw new BadRequestException(`Configure expense mapping for ${input.category}.`);
    const accountId = input.accountId ?? map?.accountId;
    if (!accountId) throw new BadRequestException('Choose an account or mapped category.');
    await this.account(tx, facilityId, accountId, 'charge');
    const costCentreId =
      input.costCentreId === undefined ? (map?.costCentreId ?? null) : input.costCentreId;
    await this.centreCheck(tx, facilityId, costCentreId);
    return { accountId, costCentreId };
  }
  private due(on: string, terms: number) {
    return day(new Date(date(on).getTime() + terms * 86400000));
  }
  private async billIn(
    tx: AuditedTx,
    actor: FinanceActor,
    input: {
      supplierId: string;
      reference: string;
      date: string;
      dueOn: string;
      memo: string;
      amount: string;
      kind?: string;
      receiptId?: string;
      lines: c.FinanceJournalInput['lines'];
      idempotencyKey: string;
    },
  ) {
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
          ...input.lines,
          { accountId: payable.id, description: input.reference, debit: '0', credit: input.amount },
        ],
      },
      'supplier_bill',
      id,
    );
    await tx.financeBill.create({
      data: {
        id,
        facilityId: actor.facilityId,
        supplierId: input.supplierId,
        reference: input.reference,
        dueOn: date(input.dueOn),
        amount: input.amount,
        journalId: journal.id,
        kind: input.kind ?? 'bill',
        receiptId: input.receiptId,
      },
    });
    return { id, journalId: journal.id };
  }
  opening(actor: FinanceActor, input: z.infer<typeof c.supplierOpeningSchema>) {
    return this.ledger.command(actor, 'supplier.opening', input, async (tx) => {
      await this.supplier(tx, actor.facilityId, input.supplierId);
      const settings = await this.ledger.settings(tx, actor.facilityId);
      const opening = await this.ledger.systemAccount(tx, actor.facilityId, 'opening');
      return this.billIn(tx, actor, {
        ...input,
        date: day(settings.cutoverDate),
        memo: `Opening supplier balance: ${input.reference}`.slice(0, 240),
        kind: 'opening',
        lines: [
          { accountId: opening.id, description: input.reference, debit: input.amount, credit: '0' },
        ],
      });
    });
  }
  charge(actor: FinanceActor, input: z.infer<typeof c.payableChargeSchema>) {
    return this.ledger.command(actor, 'payable.charge', input, async (tx) => {
      const mapped = await this.mapped(tx, actor.facilityId, input);
      const line = { ...mapped, description: input.memo, debit: input.amount, credit: '0' };
      if (input.mode === 'payable') {
        const supplier = await this.supplier(tx, actor.facilityId, input.supplierId!);
        return this.billIn(tx, actor, {
          ...input,
          supplierId: supplier.id,
          reference: input.reference!,
          dueOn: input.dueOn ?? this.due(input.date, supplier.termsDays),
          lines: [line],
        });
      }
      await this.account(tx, actor.facilityId, input.cashAccountId!, 'cash');
      const j = await this.ledger.automatic(
        tx,
        actor,
        {
          date: input.date,
          memo: input.memo,
          idempotencyKey: input.idempotencyKey,
          lines: [
            line,
            {
              accountId: input.cashAccountId!,
              description: input.memo,
              debit: '0',
              credit: input.amount,
            },
          ],
        },
        'expense',
        randomUUID(),
      );
      return { journalId: j.id };
    });
  }
  payment(actor: FinanceActor, input: z.infer<typeof c.supplierPaymentSchema>) {
    return this.ledger.command(actor, 'supplier.payment', input, async (tx) => {
      await this.supplier(tx, actor.facilityId, input.supplierId);
      await this.account(tx, actor.facilityId, input.cashAccountId, 'cash');
      const sorted = [...input.allocations].sort((a, b) => a.billId.localeCompare(b.billId));
      if (new Set(sorted.map((a) => a.billId)).size !== sorted.length)
        throw new BadRequestException('Duplicate bill allocation.');
      let total = decimal('0');
      for (const a of sorted) {
        await tx.$queryRaw`SELECT id FROM finance_bill WHERE id=${a.billId} AND facility_id=${actor.facilityId} FOR UPDATE`;
        const b = await tx.financeBill.findFirst({
          where: { id: a.billId, facilityId: actor.facilityId, supplierId: input.supplierId },
          include: billInclude,
        });
        if (!b) throw new NotFoundException('Supplier bill not found.');
        if (b.journal.status !== 'posted' || b.journal.reversal)
          throw new ConflictException('Post the bill and resolve reversals before paying.');
        if (date(input.date) < b.journal.date)
          throw new BadRequestException('Payment cannot precede the bill.');
        const reserved = b.settlements
          .filter((s) => s.journal.reversal?.status !== 'posted')
          .reduce((n, s) => n.add(s.amount), decimal('0'));
        if (decimal(a.amount).gt(b.amount.sub(reserved)))
          throw new ConflictException(
            `Allocation exceeds available balance for ${b.reference}, including reserved drafts.`,
          );
        total = total.add(a.amount);
      }
      const ap = await this.ledger.systemAccount(tx, actor.facilityId, 'payable');
      const j = await this.ledger.automatic(
        tx,
        actor,
        {
          date: input.date,
          memo: input.reference,
          idempotencyKey: input.idempotencyKey,
          lines: [
            {
              accountId: ap.id,
              description: input.reference,
              debit: total.toFixed(2),
              credit: '0',
            },
            {
              accountId: input.cashAccountId,
              description: input.reference,
              debit: '0',
              credit: total.toFixed(2),
            },
          ],
        },
        'supplier_payment',
        input.idempotencyKey,
      );
      for (const a of sorted)
        await tx.financeSettlement.create({
          data: {
            facilityId: actor.facilityId,
            billId: a.billId,
            amount: a.amount,
            journalId: j.id,
          },
        });
      return { journalId: j.id, amount: total.toFixed(2) };
    });
  }
  receipt(actor: FinanceActor, input: z.infer<typeof c.procurementReceiptSchema>) {
    return this.ledger.command(actor, 'procurement.receive', input, async (tx) => {
      await this.supplier(tx, actor.facilityId, input.supplierId);
      const lines = input.lines.map((l) => ({
        ...l,
        amount: decimal(l.quantity).mul(l.unitCost).toDecimalPlaces(2).toFixed(2),
      }));
      const total = lines.reduce((n, l) => n.add(l.amount), decimal('0'));
      if (total.lte(0) || total.gte('1000000000000') || lines.some((l) => decimal(l.amount).lte(0)))
        throw new BadRequestException(
          'Received line amounts must be positive and total below one trillion AFN.',
        );
      return tx.financeProcurementReceipt.create({
        data: {
          facilityId: actor.facilityId,
          supplierId: input.supplierId,
          sourceSystem: input.sourceSystem,
          poReference: input.poReference,
          grnReference: input.grnReference,
          receivedOn: date(input.receivedOn),
          lines,
          amount: total,
          createdBy: actor.userId,
        },
      });
    });
  }
  receiptBill(actor: FinanceActor, id: string, input: z.infer<typeof c.procurementBillSchema>) {
    return this.ledger.command(actor, 'procurement.bill:' + id, input, async (tx) => {
      await tx.$queryRaw`SELECT id FROM finance_procurement_receipt WHERE id=${id} AND facility_id=${actor.facilityId} FOR UPDATE`;
      const r = await tx.financeProcurementReceipt.findFirst({
        where: { id, facilityId: actor.facilityId },
        include: { bill: true },
      });
      if (!r) throw new NotFoundException('Goods receipt not found.');
      if (r.bill) throw new ConflictException('This goods receipt already has a bill.');
      if (date(input.date) < r.receivedOn)
        throw new BadRequestException('Bill date cannot precede the goods receipt.');
      const supplier = await this.supplier(tx, actor.facilityId, r.supplierId);
      const snapshot = z
        .array(z.object({ description: z.string(), amount: z.string(), category: z.string() }))
        .parse(r.lines);
      const lines: c.FinanceJournalInput['lines'] = [];
      for (const l of snapshot)
        lines.push({
          ...(await this.mapped(tx, actor.facilityId, l)),
          description: l.description,
          debit: l.amount,
          credit: '0',
        });
      return this.billIn(tx, actor, {
        ...input,
        supplierId: r.supplierId,
        dueOn: input.dueOn ?? this.due(input.date, supplier.termsDays),
        receiptId: id,
        kind: 'procurement',
        amount: r.amount.toFixed(2),
        memo: `PO ${r.poReference} / GRN ${r.grnReference}`.slice(0, 240),
        lines,
      });
    });
  }
  discardReceipt(actor: FinanceActor, id: string, input: { idempotencyKey: string }) {
    return this.ledger.command(actor, 'procurement.discard:' + id, input, async (tx) => {
      await tx.$queryRaw`SELECT id FROM finance_procurement_receipt WHERE id=${id} AND facility_id=${actor.facilityId} FOR UPDATE`;
      const receipt = await tx.financeProcurementReceipt.findFirst({
        where: { id, facilityId: actor.facilityId },
        include: { bill: true },
      });
      if (!receipt) throw new NotFoundException('Goods receipt not found.');
      if (receipt.bill)
        throw new ConflictException(
          'Remove the unposted bill first. Posted procurement records cannot be removed.',
        );
      await tx.$queryRaw`SELECT set_config('redmars.finance_discard', ${id}, true)`;
      await tx.financeProcurementReceipt.delete({ where: { id } });
      return { deleted: true };
    });
  }
  async report(facilityId: string, asOf: string, supplierId?: string) {
    return this.ledger.prisma.db.$transaction(
      async (tx) => {
        const until = nextDay(asOf),
          bills = await tx.financeBill.findMany({
            where: { facilityId },
            include: billInclude,
            orderBy: [{ dueOn: 'asc' }, { id: 'asc' }],
          });
        const payable = await this.ledger.systemAccount(tx, facilityId, 'payable');
        const sums = await tx.financeJournalLine.aggregate({
          where: {
            facilityId,
            accountId: payable.id,
            journal: { status: 'posted', date: { lt: until } },
          },
          _sum: { baseDebit: true, baseCredit: true },
        });
        const control = decimal(sums._sum.baseCredit ?? '0').sub(sums._sum.baseDebit ?? '0');
        let allocated = decimal('0');
        const rows = bills.flatMap((b) => {
          const a = amountAt(b, until);
          allocated = allocated.add(a.outstanding);
          if ((supplierId && b.supplierId !== supplierId) || a.outstanding.isZero()) return [];
          const days = Math.max(
            0,
            Math.floor((date(asOf).getTime() - date(day(b.dueOn)).getTime()) / 86400000),
          );
          return [
            {
              billId: b.id,
              journalId: b.journalId,
              supplierId: b.supplierId,
              supplierName: b.supplier.name,
              reference: b.reference,
              kind: b.kind,
              date: day(b.journal.date),
              dueOn: day(b.dueOn),
              amount: a.billed.toFixed(2),
              paid: a.paid.toFixed(2),
              outstanding: a.outstanding.toFixed(2),
              reserved: a.reserved.toFixed(2),
              available: b.journal.reversal
                ? '0.00'
                : Prisma.Decimal.max(0, a.outstanding.sub(a.reserved)).toFixed(2),
              days,
              current: days === 0 ? a.outstanding.toFixed(2) : '0.00',
              days1to30: days > 0 && days <= 30 ? a.outstanding.toFixed(2) : '0.00',
              days31to60: days > 30 && days <= 60 ? a.outstanding.toFixed(2) : '0.00',
              days61to90: days > 60 && days <= 90 ? a.outstanding.toFixed(2) : '0.00',
              over90: days > 90 ? a.outstanding.toFixed(2) : '0.00',
            },
          ];
        });
        return {
          asOf,
          rows,
          total: rows.reduce((n, r) => n.add(r.outstanding), decimal('0')).toFixed(2),
          controlBalance: control.toFixed(2),
          allocatedBalance: allocated.toFixed(2),
          difference: control.sub(allocated).toFixed(2),
          pending: bills.filter(
            (b) => (!supplierId || b.supplierId === supplierId) && b.journal.status === 'draft',
          ).length,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async statement(facilityId: string, supplierId: string, from: string, to: string) {
    return this.ledger.prisma.db.$transaction(
      async (tx) => {
        const supplier = await tx.financeSupplier.findFirst({
          where: { id: supplierId, facilityId },
        });
        if (!supplier) throw new NotFoundException('Supplier not found.');
        const bills = await tx.financeBill.findMany({
          where: { facilityId, supplierId },
          include: billInclude,
        });
        const events: Array<{
          journalId: string;
          date: Date;
          number: string | null;
          reference: string;
          kind: string;
          movement: Prisma.Decimal;
        }> = [];
        for (const b of bills) {
          const add = (
            j: { id: string; date: Date; status: string; number: string | null },
            movement: Prisma.Decimal,
            kind: string,
          ) => {
            if (live(j, nextDay(to)))
              events.push({
                journalId: j.id,
                date: j.date,
                number: j.number,
                reference: b.reference,
                kind,
                movement,
              });
          };
          add(b.journal, b.amount, b.kind);
          if (b.journal.reversal) add(b.journal.reversal, b.amount.neg(), 'Bill reversal');
          for (const s of b.settlements) {
            add(s.journal, s.amount.neg(), 'Payment');
            if (s.journal.reversal) add(s.journal.reversal, s.amount, 'Payment reversal');
          }
        }
        events.sort(
          (a, b) => a.date.getTime() - b.date.getTime() || a.journalId.localeCompare(b.journalId),
        );
        let balance = decimal('0'),
          opening = decimal('0');
        const lines: z.infer<typeof c.supplierStatementSchema>['lines'] = [];
        for (const e of events) {
          balance = balance.add(e.movement);
          if (e.date < date(from)) {
            opening = balance;
            continue;
          }
          lines.push({
            ...e,
            date: day(e.date),
            movement: e.movement.toFixed(2),
            balance: balance.toFixed(2),
          });
        }
        return {
          supplierName: supplier.name,
          opening: opening.toFixed(2),
          closing: balance.toFixed(2),
          lines,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async source(facilityId: string, journalId: string) {
    const journal = await this.ledger.requireJournal(this.ledger.prisma.db, facilityId, journalId);
    const id = journal.reversalOfId ?? journal.id;
    const bills = await this.ledger.prisma.db.financeBill.findMany({
      where: { facilityId, OR: [{ journalId: id }, { settlements: { some: { journalId: id } } }] },
      include: billInclude,
    });
    return {
      bills: bills.map((b) => ({
        id: b.id,
        reference: b.reference,
        supplierName: b.supplier.name,
        kind: b.kind,
        amount: b.amount.toFixed(2),
        dueOn: day(b.dueOn),
        allocation: b.settlements.find((s) => s.journalId === id)?.amount.toFixed(2) ?? null,
        procurement: b.receipt
          ? {
              poReference: b.receipt.poReference,
              grnReference: b.receipt.grnReference,
              sourceSystem: b.receipt.sourceSystem,
              receivedOn: day(b.receipt.receivedOn),
              lines: b.receipt.lines,
            }
          : null,
      })),
    };
  }
}
