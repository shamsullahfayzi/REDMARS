import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import * as c from '@redmars/shared';
import {
  FinanceActor,
  FinanceLedgerService,
  date,
  day,
  nextDay,
  decimal as d,
} from './finance-ledger.service';
import { AuditedTx } from '../../prisma/prisma.service';
const include = {
  lines: { include: { account: true, costCentre: true } },
  bill: true,
  settlements: true,
  cashClassification: true,
  payrollPayment: true,
  assetEntry: true,
} as const;
type Account = Prisma.FinanceAccountGetPayload<object>;
const sum = (values: (string | Prisma.Decimal)[]) =>
  values.reduce<Prisma.Decimal>((s, v) => s.add(v), d('0'));
const net = (l: { baseDebit: Prisma.Decimal; baseCredit: Prisma.Decimal }) =>
  d(l.baseDebit).minus(l.baseCredit);
const category = (a: Account): z.infer<typeof c.cashCategorySchema> =>
  a.type === 'revenue' || a.type === 'expense'
    ? 'operating'
    : a.type === 'equity'
      ? 'financing'
      : a.systemKey === 'asset_cost' ||
          a.systemKey === 'staff_loans' ||
          ['1500', '1510'].includes(a.code)
        ? 'investing'
        : a.systemKey === 'payable' ||
            a.systemKey === 'receivable' ||
            a.systemKey === 'panel' ||
            a.systemKey?.startsWith('payroll_') ||
            a.systemKey === 'salary_payable' ||
            ['1200', '1300', '2100', '2200'].includes(a.code)
          ? 'operating'
          : 'unclassified';
@Injectable()
export class FinanceStatementsService {
  constructor(readonly ledger: FinanceLedgerService) {}
  async scope(actor: FinanceActor, requested?: string, tx: AuditedTx = this.ledger.prisma.db) {
    const grants = await tx.financeReportGrant.findMany({
      where: { viewerId: actor.userId, viewerFacilityId: actor.facilityId, revokedAt: null },
    });
    const allowed = [actor.facilityId, ...grants.map((g) => g.facilityId)];
    const ids = requested ? [...new Set(requested.split(',').filter(Boolean))] : [actor.facilityId];
    if (!ids.length || ids.length > 30 || ids.some((id) => !allowed.includes(id)))
      throw new ForbiddenException(
        'Consolidated access is not granted for every selected facility.',
      );
    if (
      ids.some((id) => id !== actor.facilityId) &&
      !(await tx.appUser.count({
        where: {
          id: actor.userId,
          facilityId: actor.facilityId,
          isActive: true,
          deletedAt: null,
          userRoles: {
            some: { role: { code: { in: ['management', 'admin', 'auditor', 'finance_manager'] } } },
          },
        },
      }))
    )
      throw new ForbiddenException('Your current role does not permit consolidated reporting.');
    const rows = await tx.facility.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        modules: { some: { module: 'finance', enabled: true } },
      },
      select: { id: true, name: true, code: true },
    });
    if (rows.length !== ids.length)
      throw new ForbiddenException('A selected facility is inactive or finance is disabled.');
    return rows;
  }
  async workspace(actor: FinanceActor) {
    const tx = this.ledger.prisma.db;
    const eligible = await tx.appUser.count({
      where: {
        id: actor.userId,
        userRoles: {
          some: { role: { code: { in: ['management', 'admin', 'auditor', 'finance_manager'] } } },
        },
      },
    });
    const incoming = eligible
      ? await tx.financeReportGrant.findMany({
          where: {
            viewerId: actor.userId,
            viewerFacilityId: actor.facilityId,
            revokedAt: null,
            facility: { isActive: true, modules: { some: { module: 'finance', enabled: true } } },
          },
        })
      : [];
    const facilities = await this.scope(
      actor,
      [actor.facilityId, ...incoming.map((g) => g.facilityId)].join(','),
    );
    const [grants, templates, years, centres] = await Promise.all([
      tx.financeReportGrant.findMany({
        where: { facilityId: actor.facilityId },
        include: { viewer: { include: { facility: { select: { name: true } } } } },
      }),
      tx.financeReportTemplate.findMany({
        where: { facilityId: actor.facilityId },
        orderBy: { name: 'asc' },
      }),
      tx.fiscalYear.findMany({
        where: { facilityId: actor.facilityId },
        include: { closing: true },
        orderBy: { year: 'asc' },
      }),
      tx.financeCostCentre.findMany({
        where: { facilityId: actor.facilityId, isActive: true },
        select: { id: true, name: true },
      }),
    ]);
    return {
      viewerId: actor.userId,
      facilities,
      grants: grants.map((g) => ({
        viewerId: g.viewerId,
        name: g.viewer.fullName,
        facility: g.viewer.facility.name,
        active: !g.revokedAt,
        version: g.version,
        reason: g.reason,
      })),
      templates: templates.map((t) => ({
        ...t,
        definition: c.reportDefinitionSchema.parse(t.definition),
      })),
      years: years.map((y) => ({
        id: y.id,
        label: y.label,
        journalId: y.closing?.journalId ?? null,
        prepared: !!y.closing,
        finalized: !!y.closing?.finalizedAt,
      })),
      centres,
    };
  }
  grant(actor: FinanceActor, input: z.infer<typeof c.reportGrantInputSchema>) {
    return this.ledger.command(actor, 'reports.grant', input, async (tx) => {
      await tx.$queryRaw`SELECT id FROM facility WHERE id=${actor.facilityId} FOR UPDATE`;
      const viewer = await tx.appUser.findFirst({
        where: {
          id: input.viewerId,
          isActive: true,
          deletedAt: null,
          userRoles: {
            some: { role: { code: { in: ['management', 'admin', 'auditor', 'finance_manager'] } } },
          },
        },
      });
      if (!viewer || viewer.facilityId === actor.facilityId)
        throw new BadRequestException(
          'Use the exact report-access ID of an eligible user at another facility.',
        );
      const current = await tx.financeReportGrant.findUnique({
        where: { facilityId_viewerId: { facilityId: actor.facilityId, viewerId: viewer.id } },
      });
      if ((current?.version ?? 0) !== input.expectedVersion)
        throw new ConflictException('Access grant changed; reload.');
      const data = {
        viewerFacilityId: viewer.facilityId,
        grantedBy: actor.userId,
        reason: input.reason,
        revokedAt: input.active ? null : new Date(),
      };
      return current
        ? tx.financeReportGrant.update({
            where: { id: current.id },
            data: { ...data, version: { increment: 1 } },
          })
        : tx.financeReportGrant.create({
            data: { ...data, facilityId: actor.facilityId, viewerId: viewer.id },
          });
    });
  }
  async pack(actor: FinanceActor, q: z.infer<typeof c.statementQuerySchema>) {
    return this.ledger.prisma.db.$transaction(async (tx) => {
      const facilities = await this.scope(actor, q.facilityIds, tx),
        ids = facilities.map((f) => f.id),
        until = nextDay(q.to),
        from = date(q.from);
      if (
        q.costCentreId &&
        (ids.length !== 1 ||
          !(await tx.financeCostCentre.count({
            where: { id: q.costCentreId, facilityId: ids[0] },
          })))
      )
        throw new BadRequestException('Choose a department from the selected single facility.');
      const [accounts, journals, assets] = await Promise.all([
        tx.financeAccount.findMany({
          where: { facilityId: { in: ids }, isPosting: true },
          orderBy: { code: 'asc' },
        }),
        tx.financeJournal.findMany({
          where: { facilityId: { in: ids }, status: 'posted', date: { lt: until } },
          include,
          orderBy: [{ date: 'asc' }, { number: 'asc' }],
        }),
        tx.financeAsset.findMany({
          where: { facilityId: { in: ids }, billLineId: { not: null } },
          include: {
            entries: {
              where: { kind: 'acquisition' },
              include: { journal: { include: { reversal: true } } },
            },
          },
        }),
      ]);
      const journalMap = new Map(journals.map((j) => [j.id, j])),
        accountMap = new Map(accounts.map((a) => [a.id, a]));
      const facility = (id: string) => facilities.find((f) => f.id === id)!.name;
      const rows = accounts.map((a) => {
        let opening = d('0'),
          debit = d('0'),
          credit = d('0'),
          business = d('0');
        for (const j of journals)
          for (const l of j.lines)
            if (l.accountId === a.id) {
              if (j.date < from) opening = opening.add(net(l));
              else {
                debit = debit.add(l.baseDebit);
                credit = credit.add(l.baseCredit);
                if (
                  j.sourceType !== 'year_close' &&
                  (!q.costCentreId || l.costCentreId === q.costCentreId)
                )
                  business = business.add(net(l));
              }
            }
        return {
          facilityId: a.facilityId,
          facility: facility(a.facilityId),
          accountId: a.id,
          code: a.code,
          name: a.name,
          type: a.type,
          opening: opening.toFixed(2),
          debit: debit.toFixed(2),
          credit: credit.toFixed(2),
          closing: opening.add(debit).minus(credit).toFixed(2),
          result: (a.type === 'revenue' ? business.negated() : business).toFixed(2),
        };
      });
      const typed = (type: string, field: 'closing' | 'result') =>
        sum(rows.filter((r) => r.type === type).map((r) => r[field]));
      const income = typed('revenue', 'result'),
        expenses = typed('expense', 'result'),
        assetTotal = typed('asset', 'closing'),
        liabilities = typed('liability', 'closing').negated(),
        equity = typed('equity', 'closing').negated(),
        unclosed = typed('revenue', 'closing').add(typed('expense', 'closing')).negated();
      const departments = new Map<
        string,
        { facility: string; name: string; income: Prisma.Decimal; expenses: Prisma.Decimal }
      >();
      for (const j of journals)
        if (j.date >= from && j.sourceType !== 'year_close')
          for (const l of j.lines) {
            if (
              !['revenue', 'expense'].includes(l.account.type) ||
              (q.costCentreId && l.costCentreId !== q.costCentreId)
            )
              continue;
            const key = j.facilityId + '/' + (l.costCentreId ?? '');
            let r = departments.get(key);
            if (!r) {
              r = {
                facility: facility(j.facilityId),
                name: l.costCentre?.name ?? 'Unassigned',
                income: d('0'),
                expenses: d('0'),
              };
              departments.set(key, r);
            }
            if (l.account.type === 'revenue') r.income = r.income.minus(net(l));
            else r.expenses = r.expenses.add(net(l));
          }
      const positions = accounts
        .filter((a) => a.isCash)
        .map((a) => {
          const row = rows.find((r) => r.accountId === a.id)!;
          return {
            facility: facility(a.facilityId),
            account: `${a.code} ${a.name}`,
            opening: row.opening,
            receipts: row.debit,
            payments: row.credit,
            closing: row.closing,
          };
        });
      type CashRow = z.infer<typeof c.statementPackSchema>['cash']['rows'][number];
      const cashRows: CashRow[] = [];
      for (const j of journals) {
        if (j.date < from) continue;
        const cash = sum(j.lines.filter((l) => l.account.isCash).map(net));
        if (!j.lines.some((l) => l.account.isCash) || j.lines.every((l) => l.account.isCash))
          continue;
        const source = j.reversalOfId ? (journalMap.get(j.reversalOfId) ?? j) : j;
        const base = {
          journalId: j.id,
          facilityId: j.facilityId,
          facility: facility(j.facilityId),
          number: j.number ?? '',
          date: day(j.date),
          memo: j.memo,
          version: j.cashClassification?.version ?? 0,
        };
        const override = j.cashClassification ?? source.cashClassification;
        if (override) {
          const allocations = c.cashClassificationInputSchema.shape.rows.parse(override.rows);
          const factor = j.cashClassification || !j.reversalOfId ? d('1') : d('-1');
          let assigned = d('0');
          allocations.forEach((r, i) => {
            const amount =
              i === allocations.length - 1
                ? cash.minus(assigned)
                : d(r.amount).mul(factor).toDecimalPlaces(2);
            assigned = assigned.add(amount);
            cashRows.push({
              ...base,
              ...r,
              amount: amount.toFixed(2),
              plType: r.accountId ? (accountMap.get(r.accountId)?.type ?? null) : null,
            });
          });
          continue;
        }
        const receipts = sum(j.lines.filter((l) => l.account.isCash).map((l) => l.baseDebit));
        const payments = sum(j.lines.filter((l) => l.account.isCash).map((l) => l.baseCredit));
        if (receipts.gt(0) && payments.gt(0)) {
          cashRows.push(
            {
              ...base,
              category: 'unclassified',
              accountId: null,
              label: 'Mixed cash journal — review receipts',
              amount: receipts.toFixed(2),
              plType: null,
            },
            {
              ...base,
              category: 'unclassified',
              accountId: null,
              label: 'Mixed cash journal — review payments',
              amount: payments.negated().toFixed(2),
              plType: null,
            },
          );
          continue;
        }
        let weights: Array<{
          account: Account | null;
          amount: Prisma.Decimal;
          label: string;
          category: z.infer<typeof c.cashCategorySchema>;
        }> = [];
        if (source.sourceType === 'opening_import') {
          weights = [
            { account: null, amount: d('1'), label: 'Opening balance import', category: 'opening' },
          ];
        } else if (source.sourceType === 'asset_disposal') {
          weights = [
            {
              account: null,
              amount: d('1'),
              label: 'Asset disposal proceeds',
              category: 'investing',
            },
          ];
        } else if (source.settlements.length) {
          for (const settlement of source.settlements) {
            const bill = journals.find((b) => b.bill?.id === settlement.billId);
            if (!bill?.bill) continue;
            if (bill.bill.kind === 'opening') {
              weights.push({
                account: null,
                amount: d(settlement.amount),
                label: 'Settlement of opening payable — allocate cash expense',
                category: 'operating',
              });
              continue;
            }
            for (const l of bill.lines.filter((l) => l.baseDebit.gt(0))) {
              const capitalized = sum(
                assets
                  .filter(
                    (a) =>
                      a.billLineId === l.id &&
                      a.entries.some(
                        (e) =>
                          e.journal.status === 'posted' &&
                          e.journal.date < until &&
                          !(
                            e.journal.reversal?.status === 'posted' &&
                            e.journal.reversal.date < until
                          ),
                      ),
                  )
                  .map((a) => a.cost),
              );
              const remaining = d(l.baseDebit).minus(capitalized),
                factor = d(settlement.amount).div(bill.bill.amount);
              if (remaining.gt(0))
                weights.push({
                  account: l.account,
                  amount: remaining.mul(factor),
                  label: l.account.name,
                  category: category(l.account),
                });
              if (capitalized.gt(0))
                weights.push({
                  account: null,
                  amount: capitalized.mul(factor),
                  label: 'Capitalized supplier purchase',
                  category: 'investing',
                });
            }
          }
        } else if (source.payrollPayment) {
          const a = accounts.find(
            (a) => a.facilityId === j.facilityId && a.systemKey === 'salary_expense',
          );
          if (a)
            weights = [{ account: a, amount: d('1'), label: 'Salary paid', category: 'operating' }];
        } else if (source.invoiceId && source.paymentId) {
          const revenue = new Map<string, Prisma.Decimal>();
          for (const ij of journals.filter(
            (ij) => ij.invoiceId === source.invoiceId && ij.sourceType !== 'year_close',
          ))
            for (const l of ij.lines.filter((l) => l.account.type === 'revenue'))
              revenue.set(l.accountId, (revenue.get(l.accountId) ?? d('0')).minus(net(l)));
          weights = [...revenue].map(([id, amount]) => ({
            account: accountMap.get(id)!,
            amount,
            label: accountMap.get(id)!.name,
            category: 'operating',
          }));
        } else {
          const sourceCash = sum(source.lines.filter((l) => l.account.isCash).map(net));
          const opposing = source.lines.filter(
            (l) => !l.account.isCash && (sourceCash.gt(0) ? net(l).lt(0) : net(l).gt(0)),
          );
          weights = opposing.map((l) => ({
            account: l.account,
            amount: net(l).abs(),
            label: l.account.name,
            category: category(l.account),
          }));
          // Panel collections and payroll withholding are operating cash income/expense.
          for (const w of weights) {
            if (w.account?.systemKey === 'panel') {
              w.account =
                accounts.find((a) => a.facilityId === j.facilityId && a.systemKey === 'revenue') ??
                w.account;
              w.label = 'Panel receipts';
            }
            if (
              ['payroll_tax', 'payroll_other', 'salary_payable'].includes(
                w.account?.systemKey ?? '',
              )
            ) {
              w.account =
                accounts.find(
                  (a) => a.facilityId === j.facilityId && a.systemKey === 'salary_expense',
                ) ?? w.account;
              w.label = 'Payroll cash settlement';
            }
          }
        }
        let denominator = sum(weights.map((w) => w.amount));
        if (denominator.lte(0)) {
          weights = [
            {
              account: null,
              amount: d('1'),
              label: 'Requires classification',
              category: 'unclassified',
            },
          ];
          denominator = d('1');
        }
        let assigned = d('0');
        weights.forEach((w, i) => {
          const amount =
            i === weights.length - 1
              ? cash.minus(assigned)
              : cash.mul(w.amount).div(denominator).toDecimalPlaces(2);
          assigned = assigned.add(amount);
          if (amount.isZero()) return;
          const plType =
            w.account && ['revenue', 'expense'].includes(w.account.type) ? w.account.type : null;
          cashRows.push({
            ...base,
            category: w.category,
            accountId: plType ? w.account!.id : null,
            label: w.label,
            amount: amount.toFixed(2),
            plType,
          });
        });
      }
      const cat = (category: string) =>
        sum(cashRows.filter((r) => r.category === category).map((r) => r.amount));
      const opening = sum(positions.map((p) => p.opening)),
        closing = sum(positions.map((p) => p.closing)),
        cashIncome = sum(cashRows.filter((r) => r.plType === 'revenue').map((r) => r.amount)),
        cashExpense = sum(
          cashRows.filter((r) => r.plType === 'expense').map((r) => r.amount),
        ).negated();
      const warnings: string[] = [];
      if (ids.length > 1)
        warnings.push(
          'Group roll-up sums authorized facility books without inter-facility eliminations.',
        );
      if (cashRows.some((r) => r.category === 'unclassified'))
        warnings.push(
          'Some cash movements need classification before the cash-flow statement is complete.',
        );
      if (cashRows.some((r) => r.category === 'operating' && !r.plType))
        warnings.push(
          'Some operating cash movements have no income/expense allocation; review these for cash-basis P&L.',
        );
      if (q.costCentreId)
        warnings.push(
          'Department filter applies to accrual P&L only; the balance sheet and cash reports cover the facility.',
        );
      return c.statementPackSchema.parse({
        from: q.from,
        to: q.to,
        currency: 'AFN',
        facilities,
        generatedAt: new Date().toISOString(),
        warnings,
        accounts: rows,
        profitLoss: rows.filter((r) => ['revenue', 'expense'].includes(r.type)),
        totals: {
          income: income.toFixed(2),
          expenses: expenses.toFixed(2),
          netIncome: income.minus(expenses).toFixed(2),
          assets: assetTotal.toFixed(2),
          liabilities: liabilities.toFixed(2),
          equity: equity.toFixed(2),
          unclosedResult: unclosed.toFixed(2),
          balanceDifference: assetTotal.minus(liabilities).minus(equity).minus(unclosed).toFixed(2),
          receivables: sum(
            rows
              .filter((r) =>
                ['receivable', 'panel'].includes(accountMap.get(r.accountId)?.systemKey ?? ''),
              )
              .map((r) => r.closing),
          ).toFixed(2),
          payables: sum(
            rows
              .filter((r) => accountMap.get(r.accountId)?.systemKey === 'payable')
              .map((r) => r.closing),
          )
            .negated()
            .toFixed(2),
        },
        departments: [...departments.values()].map((r) => ({
          ...r,
          income: r.income.toFixed(2),
          expenses: r.expenses.toFixed(2),
          netIncome: r.income.minus(r.expenses).toFixed(2),
        })),
        cash: {
          opening: opening.toFixed(2),
          closing: closing.toFixed(2),
          operating: cat('operating').toFixed(2),
          investing: cat('investing').toFixed(2),
          financing: cat('financing').toFixed(2),
          openingAdjustments: cat('opening').toFixed(2),
          unclassified: cat('unclassified').toFixed(2),
          difference: closing
            .minus(opening)
            .minus(sum(cashRows.map((r) => r.amount)))
            .toFixed(2),
          receipts: sum(cashRows.filter((r) => d(r.amount).gt(0)).map((r) => r.amount)).toFixed(2),
          payments: sum(cashRows.filter((r) => d(r.amount).lt(0)).map((r) => r.amount))
            .negated()
            .toFixed(2),
          income: cashIncome.toFixed(2),
          expenses: cashExpense.toFixed(2),
          netIncome: cashIncome.minus(cashExpense).toFixed(2),
          rows: cashRows,
          positions,
        },
      });
    });
  }
  classify(
    actor: FinanceActor,
    id: string,
    input: z.infer<typeof c.cashClassificationInputSchema>,
  ) {
    return this.ledger.command(actor, 'reports.classify:' + id, input, async (tx) => {
      await tx.$queryRaw`SELECT id FROM facility WHERE id=${actor.facilityId} FOR UPDATE`;
      const j = await tx.financeJournal.findFirst({
        where: { id, facilityId: actor.facilityId, status: 'posted' },
        include: { ...include, period: true },
      });
      if (!j || j.period.closedAt)
        throw new ConflictException('Choose a posted cash journal in an open period.');
      const total = sum(j.lines.filter((l) => l.account.isCash).map(net));
      if (
        !j.lines.some((l) => l.account.isCash) ||
        j.lines.every((l) => l.account.isCash) ||
        !total.eq(sum(input.rows.map((r) => r.amount)))
      )
        throw new BadRequestException(
          'Classifications must total the journal’s external cash movement.',
        );
      const ids = [...new Set(input.rows.flatMap((r) => (r.accountId ? [r.accountId] : [])))];
      if (
        (await tx.financeAccount.count({
          where: {
            id: { in: ids },
            facilityId: actor.facilityId,
            isPosting: true,
            type: { in: ['revenue', 'expense'] },
          },
        })) !== ids.length
      )
        throw new BadRequestException('Choose income/expense accounts from this facility.');
      if (input.rows.some((r) => r.accountId && r.category !== 'operating'))
        throw new BadRequestException('Cash P&L allocations must be operating cash flows.');
      if ((j.cashClassification?.version ?? 0) !== input.expectedVersion)
        throw new ConflictException('Classification changed; reload.');
      return tx.financeCashClassification.upsert({
        where: { journalId: id },
        create: {
          facilityId: actor.facilityId,
          journalId: id,
          rows: input.rows,
          reason: input.reason,
        },
        update: { rows: input.rows, reason: input.reason, version: { increment: 1 } },
      });
    });
  }
  template(actor: FinanceActor, input: z.infer<typeof c.reportTemplateInputSchema>) {
    return this.ledger.command(actor, 'reports.template', input, async (tx) => {
      await tx.$queryRaw`SELECT id FROM facility WHERE id=${actor.facilityId} FOR UPDATE`;
      const ids = [...new Set(input.definition.flatMap((r) => r.accountIds))],
        centres = [
          ...new Set(input.definition.flatMap((r) => (r.costCentreId ? [r.costCentreId] : []))),
        ];
      if (
        (await tx.financeAccount.count({
          where: { id: { in: ids }, facilityId: actor.facilityId, isPosting: true },
        })) !== ids.length ||
        (await tx.financeCostCentre.count({
          where: { id: { in: centres }, facilityId: actor.facilityId },
        })) !== centres.length
      )
        throw new BadRequestException(
          'Report rows must use accounts and departments in this facility.',
        );
      const current = await tx.financeReportTemplate.findUnique({
        where: { facilityId_name: { facilityId: actor.facilityId, name: input.name } },
      });
      if ((current?.version ?? 0) !== input.expectedVersion)
        throw new ConflictException('Report definition changed; reload.');
      return tx.financeReportTemplate.upsert({
        where: { facilityId_name: { facilityId: actor.facilityId, name: input.name } },
        create: {
          facilityId: actor.facilityId,
          name: input.name,
          authority: input.authority,
          definition: input.definition,
        },
        update: {
          authority: input.authority,
          definition: input.definition,
          version: { increment: 1 },
        },
      });
    });
  }
  async custom(actor: FinanceActor, id: string, q: z.infer<typeof c.statementQuerySchema>) {
    return this.ledger.prisma.db.$transaction(async (tx) => {
      const t = await tx.financeReportTemplate.findFirst({
        where: { id, facilityId: actor.facilityId },
      });
      if (!t) throw new NotFoundException('Report template not found.');
      const definition = c.reportDefinitionSchema.parse(t.definition),
        lines = await tx.financeJournalLine.findMany({
          where: {
            facilityId: actor.facilityId,
            journal: { status: 'posted', date: { lt: nextDay(q.to) } },
          },
          include: { journal: true },
        });
      return {
        name: t.name,
        authority: t.authority,
        version: t.version,
        from: q.from,
        to: q.to,
        rows: definition.map((r) => {
          const selected = lines.filter(
            (l) =>
              r.accountIds.includes(l.accountId) &&
              (!r.costCentreId || r.costCentreId === l.costCentreId) &&
              (r.measure === 'closing' ||
                (l.journal.date >= date(q.from) && l.journal.sourceType !== 'year_close')),
          );
          const v = sum(
            selected.map((l) =>
              r.measure === 'debit' ? l.baseDebit : r.measure === 'credit' ? l.baseCredit : net(l),
            ),
          );
          return {
            label: r.label,
            amount: (['debit', 'credit'].includes(r.measure) || r.sign === 'debit'
              ? v
              : v.negated()
            ).toFixed(2),
          };
        }),
      };
    });
  }
}
