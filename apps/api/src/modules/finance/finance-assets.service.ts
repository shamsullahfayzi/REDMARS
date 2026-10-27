import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import * as c from '@redmars/shared';
import { AuditedTx } from '../../prisma/prisma.service';
import { requestContext } from '../../audit/request-context';
import {
  FinanceActor,
  FinanceLedgerService,
  date,
  day,
  decimal as d,
} from './finance-ledger.service';
const include = {
  startPeriod: true,
  billLine: { include: { journal: { include: { bill: true } } } },
  entries: {
    include: { journal: { include: { reversal: true } }, period: true },
    orderBy: { journal: { date: 'asc' as const } },
  },
} as const;
const alive = (e: { journal: { reversal: { status: string } | null } }) =>
  e.journal.reversal?.status !== 'posted';
const line = (
  accountId: string,
  amount: string,
  debit: boolean,
  costCentreId: string | null = null,
) => ({
  accountId,
  costCentreId,
  description: '',
  debit: debit ? amount : '0',
  credit: debit ? '0' : amount,
});
const monthIndex = (label: string) =>
  Number(label.slice(0, 4)) * 12 + Number(label.slice(5, 7)) - 1;
@Injectable()
export class FinanceAssetsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(FinanceAssetsService.name);
  private lastRun: string | null = null;
  private errors: string[] = [];
  constructor(private readonly ledger: FinanceLedgerService) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.scheduled(), 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async lock(tx: AuditedTx, facilityId: string) {
    await tx.$queryRaw`SELECT id FROM facility WHERE id=${facilityId} FOR UPDATE`;
    await this.ledger.settings(tx, facilityId);
  }
  private async accounts(tx: AuditedTx, facilityId: string) {
    const result: Record<string, string> = {};
    for (const [key, name, type, normalBalance, control] of [
      ['asset_cost', 'Registered fixed assets', 'asset', 'debit', true],
      ['asset_accum', 'Accumulated depreciation', 'asset', 'credit', true],
      ['asset_expense', 'Depreciation expense', 'expense', 'debit', false],
      ['asset_gain', 'Gain on asset disposal', 'revenue', 'credit', false],
      ['asset_loss', 'Loss on asset disposal', 'expense', 'debit', false],
    ] as const) {
      let a = await tx.financeAccount.findUnique({
        where: { facilityId_systemKey: { facilityId, systemKey: key } },
      });
      if (!a)
        a = await tx.financeAccount.create({
          data: {
            facilityId,
            code: 'FA-' + key.toUpperCase(),
            name,
            type,
            normalBalance,
            isControl: control,
            systemKey: key,
          },
        });
      if (!a.isActive) throw new ConflictException('An asset posting account is inactive.');
      result[key] = a.id;
    }
    return result;
  }
  private async cash(tx: AuditedTx, facilityId: string, id?: string) {
    const a =
      id &&
      (await tx.financeAccount.findFirst({
        where: {
          id,
          facilityId,
          isCash: true,
          isPosting: true,
          isActive: true,
          isControl: false,
          type: 'asset',
        },
      }));
    if (!a) throw new BadRequestException('Choose an active cash/bank account in this facility.');
    return a;
  }
  create(actor: FinanceActor, input: z.infer<typeof c.assetInputSchema>) {
    return this.ledger.command(actor, 'assets.create', input, async (tx) => {
      await this.lock(tx, actor.facilityId);
      const p = await tx.fiscalPeriod.findFirst({
        where: { id: input.startPeriodId, facilityId: actor.facilityId },
      });
      if (!p || p.closedAt || p.endsOn <= date(input.date))
        throw new BadRequestException(
          'Depreciation must start in an open period on or after acquisition.',
        );
      if (
        input.costCentreId &&
        !(await tx.financeCostCentre.count({
          where: { id: input.costCentreId, facilityId: actor.facilityId, isActive: true },
        }))
      )
        throw new BadRequestException('Invalid department.');
      let offset: string;
      let offsetCentre = input.costCentreId ?? null;
      if (input.billLineId) {
        const l = await tx.financeJournalLine.findFirst({
          where: { id: input.billLineId, facilityId: actor.facilityId },
          include: {
            account: true,
            journal: { include: { bill: true, reversal: true } },
            capitalizedAssets: {
              include: { entries: { include: { journal: { include: { reversal: true } } } } },
            },
          },
        });
        if (
          !l ||
          !l.journal.bill ||
          l.journal.bill.kind === 'opening' ||
          l.journal.status !== 'posted' ||
          l.journal.reversal ||
          l.debit.lte(0) ||
          l.account.isCash ||
          l.account.isControl ||
          !['expense', 'asset'].includes(l.account.type)
        )
          throw new BadRequestException('Choose a posted, unreversed supplier bill debit line.');
        if (date(input.date) < l.journal.date)
          throw new BadRequestException('Capitalization cannot precede the bill.');
        const used = l.capitalizedAssets
          .filter((a) => a.entries.some((e) => e.kind === 'acquisition' && alive(e)))
          .reduce((s, a) => s.add(a.cost), d('0'));
        if (used.add(input.cost).gt(l.debit))
          throw new ConflictException(
            'Capitalization exceeds the remaining bill line amount, including drafts.',
          );
        offset = l.accountId;
        offsetCentre = l.costCentreId;
      } else offset = (await this.cash(tx, actor.facilityId, input.cashAccountId)).id;
      const accounts = await this.accounts(tx, actor.facilityId);
      const {
        code,
        name,
        category,
        location,
        cost,
        residual,
        lifeMonths,
        startPeriodId,
        costCentreId,
        billLineId,
      } = input;
      const asset = await tx.financeAsset.create({
        data: {
          facilityId: actor.facilityId,
          createdBy: actor.userId,
          code,
          name,
          category,
          location,
          cost,
          residual,
          lifeMonths,
          startPeriodId,
          costCentreId,
          billLineId,
          acquiredOn: date(input.date),
        },
      });
      const entryId = randomUUID();
      const j = await this.ledger.draftIn(
        tx,
        actor,
        {
          date: input.date,
          memo: `Asset ${code}: ${name}`,
          idempotencyKey: input.idempotencyKey,
          lines: [
            line(accounts.asset_cost, cost, true, costCentreId),
            line(offset, cost, false, offsetCentre),
          ],
        },
        'asset_acquisition',
        entryId,
      );
      await tx.financeAssetEntry.create({
        data: {
          id: entryId,
          facilityId: actor.facilityId,
          assetId: asset.id,
          journalId: j.id,
          periodId: j.periodId,
          kind: 'acquisition',
          amount: cost,
          offsetAccountId: offset,
        },
      });
      return { id: asset.id, journalId: j.id };
    });
  }
  private async due(
    actor: FinanceActor,
    id: string,
    through: string,
    attempt = 0,
  ): Promise<number> {
    try {
      return await this.dueOnce(actor, id, through);
    } catch (error) {
      const response = error instanceof ConflictException ? error.getResponse() : null;
      if (
        attempt < 2 &&
        response &&
        typeof response === 'object' &&
        'code' in response &&
        response.code === 'concurrent_change'
      )
        return this.due(actor, id, through, attempt + 1);
      throw error;
    }
  }
  private async dueOnce(actor: FinanceActor, id: string, through: string) {
    // Idle scheduler checks must not create command/audit records every minute.
    const snapshot = await this.ledger.prisma.financeAsset.findFirst({
      where: { id, facilityId: actor.facilityId },
      include,
    });
    if (!snapshot) return 0;
    const live = snapshot.entries.filter(alive);
    if (
      !live.some((e) => e.kind === 'acquisition' && e.journal.status === 'posted') ||
      live.some((e) => e.kind === 'disposal')
    )
      return 0;
    const count = Math.min(
      snapshot.lifeMonths,
      monthIndex(c.gregorianToShamsi(through).slice(0, 7)) - monthIndex(snapshot.startPeriod.label),
    );
    const missing = Array.from({ length: Math.max(0, count) }, (_, i) => i).some(
      (i) =>
        d(
          c.straightLineAmount(
            snapshot.cost.toFixed(2),
            snapshot.residual.toFixed(2),
            snapshot.lifeMonths,
            i,
          ),
        ).gt(0) &&
        !live.some(
          (e) =>
            e.kind === 'depreciation' &&
            monthIndex(e.period.label) === monthIndex(snapshot.startPeriod.label) + i,
        ),
    );
    if (!missing) return 0;
    return this.ledger.command(
      actor,
      'assets.depreciate:' + id,
      { idempotencyKey: randomUUID() },
      async (tx) => {
        await this.lock(tx, actor.facilityId);
        const a = await tx.financeAsset.findFirst({
          where: { id, facilityId: actor.facilityId },
          include,
        });
        if (!a) throw new BadRequestException('Asset not found.');
        const active = a.entries.filter(alive);
        if (
          !active.some((e) => e.kind === 'acquisition' && e.journal.status === 'posted') ||
          active.some((e) => e.kind === 'disposal')
        )
          return 0;
        if (active.some((e) => e.journal.reversal))
          throw new ConflictException('Post the pending asset reversal first.');
        const periods = await tx.fiscalPeriod.findMany({
          where: {
            facilityId: actor.facilityId,
            startsOn: { gte: a.startPeriod.startsOn },
            endsOn: { lte: date(through) },
          },
          orderBy: { startsOn: 'asc' },
        });
        // Never skip a missing/closed month: this would silently understate depreciation.
        const last = monthIndex(c.gregorianToShamsi(through).slice(0, 7)) - 1;
        const end = Math.min(last, monthIndex(a.startPeriod.label) + a.lifeMonths - 1);
        const accounts = await this.accounts(tx, actor.facilityId);
        let count = 0;
        for (let index = 0; index <= end - monthIndex(a.startPeriod.label); index++) {
          const amount = c.straightLineAmount(
            a.cost.toFixed(2),
            a.residual.toFixed(2),
            a.lifeMonths,
            index,
          );
          if (d(amount).isZero()) continue;
          const p = periods.find(
            (p) => monthIndex(p.label) === monthIndex(a.startPeriod.label) + index,
          );
          if (!p)
            throw new ConflictException(
              'Create the missing Shamsi fiscal year before generating depreciation.',
            );
          if (active.some((e) => e.kind === 'depreciation' && e.periodId === p.id)) continue;
          if (p.closedAt)
            throw new ConflictException(
              `Depreciation is missing in closed period ${p.label}; accountant correction is required.`,
            );
          const entryId = randomUUID();
          const j = await this.ledger.draftIn(
            tx,
            actor,
            {
              date: day(new Date(p.endsOn.getTime() - 1)),
              memo: `Depreciation ${a.code} / ${p.label}`,
              idempotencyKey: randomUUID(),
              lines: [
                line(accounts.asset_expense, amount, true, a.costCentreId),
                line(accounts.asset_accum, amount, false, a.costCentreId),
              ],
            },
            'asset_depreciation',
            entryId,
          );
          await tx.financeAssetEntry.create({
            data: {
              id: entryId,
              facilityId: actor.facilityId,
              assetId: id,
              journalId: j.id,
              periodId: p.id,
              kind: 'depreciation',
              amount,
              offsetAccountId: accounts.asset_expense,
            },
          });
          count++;
          if (count === 12) break;
        }
        return count;
      },
    );
  }
  async generate(actor: FinanceActor, input: z.infer<typeof c.assetRunSchema>) {
    if (input.through > day(new Date()))
      throw new BadRequestException('Depreciation can only be generated for completed months.');
    const assets = await this.ledger.prisma.financeAsset.findMany({
      where: { facilityId: actor.facilityId },
    });
    const errors: string[] = [];
    let created = 0;
    for (const a of assets) {
      try {
        created += await this.due(actor, a.id, input.through);
      } catch (e) {
        errors.push(`${a.code}: ${e instanceof Error ? e.message : 'Generation failed'}`);
      }
    }
    return { created, errors };
  }
  async scheduled() {
    if (this.running) return;
    this.running = true;
    try {
      const assets = await this.ledger.prisma.financeAsset.findMany({
        where: { facility: { modules: { some: { module: 'finance', enabled: true } } } },
      });
      const errors: string[] = [];
      for (const a of assets) {
        const actor = { facilityId: a.facilityId, userId: a.createdBy };
        try {
          await requestContext.run(actor, () => this.due(actor, a.id, day(new Date())));
        } catch (e) {
          errors.push(
            `${a.facilityId}/${a.code}: ${e instanceof Error ? e.message : 'Generation failed'}`,
          );
        }
      }
      this.errors = errors;
      this.lastRun = new Date().toISOString();
    } catch (e) {
      this.logger.error('Asset scheduler failed', e);
      this.errors = ['Asset scheduler could not access the database.'];
    } finally {
      this.running = false;
    }
  }
  dispose(actor: FinanceActor, id: string, input: z.infer<typeof c.assetDisposeSchema>) {
    return this.ledger.command(actor, 'assets.dispose:' + id, input, async (tx) => {
      await this.lock(tx, actor.facilityId);
      const a = await tx.financeAsset.findFirst({
        where: { id, facilityId: actor.facilityId },
        include,
      });
      if (!a) throw new BadRequestException('Asset not found.');
      const active = a.entries.filter(alive);
      if (
        !active.some((e) => e.kind === 'acquisition') ||
        active.some(
          (e) => e.kind === 'disposal' || e.journal.status !== 'posted' || e.journal.reversal,
        )
      )
        throw new ConflictException(
          'Post acquisition/depreciation and finish reversals before disposal.',
        );
      if (active.some((e) => e.journal.date > date(input.date)))
        throw new BadRequestException('Disposal cannot precede existing asset entries.');
      const months = Math.min(
        a.lifeMonths,
        monthIndex(c.gregorianToShamsi(input.date).slice(0, 7)) - monthIndex(a.startPeriod.label),
      );
      for (let i = 0; i < months; i++) {
        if (
          d(c.straightLineAmount(a.cost.toFixed(2), a.residual.toFixed(2), a.lifeMonths, i)).gt(
            0,
          ) &&
          !active.some(
            (e) =>
              e.kind === 'depreciation' &&
              monthIndex(e.period.label) === monthIndex(a.startPeriod.label) + i,
          )
        )
          throw new ConflictException(
            'Generate and post all completed months of depreciation before disposal.',
          );
      }
      const acc = await this.accounts(tx, actor.facilityId);
      const accum = active
        .filter((e) => e.kind === 'depreciation')
        .reduce((s, e) => s.add(e.amount), d('0'));
      const nbv = d(a.cost).minus(accum),
        gain = d(input.proceeds).minus(nbv);
      const cash = d(input.proceeds).gt(0)
        ? (await this.cash(tx, actor.facilityId, input.cashAccountId)).id
        : acc.asset_loss;
      const lines = [line(acc.asset_cost, a.cost.toFixed(2), false, a.costCentreId)];
      if (accum.gt(0)) lines.push(line(acc.asset_accum, accum.toFixed(2), true, a.costCentreId));
      if (d(input.proceeds).gt(0)) lines.push(line(cash, input.proceeds, true, a.costCentreId));
      if (!gain.isZero())
        lines.push(
          line(
            gain.gt(0) ? acc.asset_gain : acc.asset_loss,
            gain.abs().toFixed(2),
            gain.lt(0),
            a.costCentreId,
          ),
        );
      const entryId = randomUUID();
      const j = await this.ledger.draftIn(
        tx,
        actor,
        {
          date: input.date,
          memo: `Disposal ${a.code}: ${input.reason}`.slice(0, 240),
          idempotencyKey: input.idempotencyKey,
          lines,
        },
        'asset_disposal',
        entryId,
      );
      await tx.financeAssetEntry.create({
        data: {
          id: entryId,
          facilityId: actor.facilityId,
          assetId: id,
          journalId: j.id,
          periodId: j.periodId,
          kind: 'disposal',
          amount: accum,
          proceeds: input.proceeds,
          offsetAccountId: cash,
        },
      });
      return { journalId: j.id, netBookValue: nbv.toFixed(2), gainLoss: gain.toFixed(2) };
    });
  }
  transfer(actor: FinanceActor, input: z.infer<typeof c.transferInputSchema>) {
    return this.ledger.command(actor, 'assets.transfer', input, async (tx) => {
      await this.cash(tx, actor.facilityId, input.fromAccountId);
      await this.cash(tx, actor.facilityId, input.toAccountId);
      return this.ledger.draftIn(
        tx,
        actor,
        {
          date: input.date,
          memo: `Transfer: ${input.reference}`,
          idempotencyKey: input.idempotencyKey,
          lines: [
            line(input.toAccountId, input.amount, true),
            line(input.fromAccountId, input.amount, false),
          ],
        },
        'bank_transfer',
        randomUUID(),
      );
    });
  }
  budget(actor: FinanceActor, input: z.infer<typeof c.budgetInputSchema>) {
    return this.ledger.command(actor, 'assets.budget', input, async (tx) => {
      await this.lock(tx, actor.facilityId);
      const p = await tx.fiscalPeriod.findFirst({
        where: { id: input.periodId, facilityId: actor.facilityId },
      });
      if (!p || p.closedAt) throw new ConflictException('Choose an open Shamsi budget period.');
      if (
        !(await tx.financeAccount.count({
          where: {
            id: input.accountId,
            facilityId: actor.facilityId,
            isActive: true,
            isPosting: true,
            type: { in: ['expense', 'revenue'] },
          },
        }))
      )
        throw new BadRequestException('Choose an active expense or revenue account.');
      if (
        input.costCentreId &&
        !(await tx.financeCostCentre.count({
          where: { id: input.costCentreId, facilityId: actor.facilityId, isActive: true },
        }))
      )
        throw new BadRequestException('Choose an active department.');
      const where = {
        facilityId: actor.facilityId,
        periodId: input.periodId,
        accountId: input.accountId,
      };
      const existing = await tx.financeBudget.findMany({ where });
      const centre = input.costCentreId ?? null;
      if (existing.some((b) => (b.costCentreId === null) !== (centre === null)))
        throw new ConflictException(
          'Use either a whole-facility budget or department budgets for an account/period.',
        );
      const current = existing.find((b) => b.costCentreId === centre);
      if ((current?.version ?? 0) !== input.expectedVersion)
        throw new ConflictException('Budget changed; refresh before saving.');
      if (current)
        return tx.financeBudget.update({
          where: { id: current.id },
          data: { amount: input.amount, version: { increment: 1 } },
        });
      return tx.financeBudget.create({
        data: { ...where, costCentreId: centre, amount: input.amount },
      });
    });
  }
  async report(facilityId: string, year: number) {
    return this.ledger.prisma.$transaction(
      async (tx) => {
        const periods = await tx.fiscalPeriod.findMany({
          where: { facilityId, fiscalYear: { year } },
          orderBy: { startsOn: 'asc' },
        });
        const budgets = await tx.financeBudget.findMany({
          where: { facilityId, periodId: { in: periods.map((p) => p.id) } },
          include: { account: true, costCentre: true },
        });
        const lines = await tx.financeJournalLine.findMany({
          where: {
            facilityId,
            journal: { status: 'posted', sourceType: { not: 'year_close' }, periodId: { in: periods.map((p) => p.id) } },
            account: { type: { in: ['expense', 'revenue'] } },
          },
          include: { account: true, costCentre: true, journal: { select: { periodId: true } } },
        });
        type Row = {
          periodId: string;
          period: string;
          accountId: string;
          account: string;
          type: string;
          costCentreId: string | null;
          department: string;
          budget: string | null;
          actual: string;
          variance: string | null;
          favorable: boolean | null;
          version: number;
        };
        const rows = new Map<string, Row>();
        const key = (p: string, a: string, c: string | null) => `${p}/${a}/${c ?? '*'}`;
        for (const b of budgets)
          rows.set(key(b.periodId, b.accountId, b.costCentreId), {
            periodId: b.periodId,
            period: periods.find((p) => p.id === b.periodId)!.label,
            accountId: b.accountId,
            account: `${b.account.code} ${b.account.name}`,
            type: b.account.type,
            costCentreId: b.costCentreId,
            department: b.costCentre?.name ?? 'Whole facility',
            budget: b.amount.toFixed(2),
            actual: '0.00',
            variance: null,
            favorable: null,
            version: b.version,
          });
        for (const l of lines) {
          const whole = rows.get(key(l.journal.periodId, l.accountId, null));
          const k =
            whole?.budget !== null && whole
              ? key(l.journal.periodId, l.accountId, null)
              : key(l.journal.periodId, l.accountId, l.costCentreId);
          let r = rows.get(k);
          if (!r) {
            r = {
              periodId: l.journal.periodId,
              period: periods.find((p) => p.id === l.journal.periodId)!.label,
              accountId: l.accountId,
              account: `${l.account.code} ${l.account.name}`,
              type: l.account.type,
              costCentreId: l.costCentreId,
              department: l.costCentre?.name ?? 'Unassigned',
              budget: null,
              actual: '0.00',
              variance: null,
              favorable: null,
              version: 0,
            };
            rows.set(k, r);
          }
          r.actual = d(r.actual)
            .add(
              l.account.type === 'revenue'
                ? d(l.credit).minus(l.debit)
                : d(l.debit).minus(l.credit),
            )
            .toFixed(2);
        }
        for (const r of rows.values())
          if (r.budget !== null) {
            r.variance = d(r.actual).minus(r.budget).toFixed(2);
            r.favorable = r.type === 'expense' ? d(r.variance).lte(0) : d(r.variance).gte(0);
          }
        return {
          year,
          rows: [...rows.values()].sort(
            (a, b) =>
              a.period.localeCompare(b.period) ||
              a.account.localeCompare(b.account) ||
              a.department.localeCompare(b.department),
          ),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async workspace(facilityId: string) {
    const [assets, billLines, centres] = await Promise.all([
      this.ledger.prisma.financeAsset.findMany({
        where: { facilityId },
        include,
        orderBy: { code: 'asc' },
      }),
      this.ledger.prisma.financeJournalLine.findMany({
        where: {
          facilityId,
          debit: { gt: 0 },
          journal: { status: 'posted', reversal: null, bill: { kind: { not: 'opening' } } },
          account: { type: { in: ['asset', 'expense'] }, isCash: false, isControl: false },
        },
        include: {
          account: true,
          journal: { include: { bill: true } },
          capitalizedAssets: {
            include: { entries: { include: { journal: { include: { reversal: true } } } } },
          },
        },
      }),
      this.ledger.prisma.financeCostCentre.findMany({ where: { facilityId, isActive: true } }),
    ]);
    return {
      assets: assets.map((a) => {
        const active = a.entries.filter(alive),
          posted = active.filter((e) => e.journal.status === 'posted');
        const dep = posted
          .filter((e) => e.kind === 'depreciation')
          .reduce((s, e) => s.add(e.amount), d('0'));
        const status = !active.some((e) => e.kind === 'acquisition')
          ? 'reversed'
          : active.some((e) => e.kind === 'disposal')
            ? posted.some((e) => e.kind === 'disposal')
              ? 'disposed'
              : 'disposal pending'
            : posted.some((e) => e.kind === 'acquisition')
              ? 'active'
              : 'acquisition pending';
        return {
          id: a.id,
          code: a.code,
          name: a.name,
          category: a.category,
          location: a.location,
          cost: a.cost.toFixed(2),
          residual: a.residual.toFixed(2),
          lifeMonths: a.lifeMonths,
          acquiredOn: day(a.acquiredOn),
          startPeriod: a.startPeriod.label,
          costCentreId: a.costCentreId,
          billReference: a.billLine?.journal.bill?.reference ?? null,
          billJournalId: a.billLine?.journalId ?? null,
          status,
          depreciation: dep.toFixed(2),
          netBookValue:
            status === 'disposed' || status === 'reversed' || status === 'acquisition pending'
              ? '0.00'
              : d(a.cost).minus(dep).toFixed(2),
          entries: a.entries.map((e) => ({
            id: e.id,
            kind: e.kind,
            period: e.period.label,
            journalId: e.journalId,
            date: day(e.journal.date),
            status: e.journal.status,
            reversed: !alive(e),
            reversalPending: e.journal.reversal?.status === 'draft',
            amount: e.amount.toFixed(2),
            proceeds: e.proceeds.toFixed(2),
          })),
          schedule: Array.from({ length: a.lifeMonths }, (_, i) => {
            const m = monthIndex(a.startPeriod.label) + i;
            return {
              period: `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`,
              amount: c.straightLineAmount(
                a.cost.toFixed(2),
                a.residual.toFixed(2),
                a.lifeMonths,
                i,
              ),
            };
          }),
        };
      }),
      billLines: billLines
        .map((l) => ({
          id: l.id,
          reference: l.journal.bill!.reference,
          account: `${l.account.code} ${l.account.name}`,
          available: d(l.debit)
            .minus(
              l.capitalizedAssets
                .filter((a) => a.entries.some((e) => e.kind === 'acquisition' && alive(e)))
                .reduce((s, a) => s.add(a.cost), d('0')),
            )
            .toFixed(2),
        }))
        .filter((l) => d(l.available).gt(0)),
      centres: centres.map((c) => ({ id: c.id, name: c.name })),
      scheduler: {
        lastRun: this.lastRun,
        errors: this.errors
          .filter((e) => e.startsWith(facilityId + '/'))
          .map((e) => e.slice(facilityId.length + 1)),
      },
    };
  }
  async source(facilityId: string, journalId: string) {
    const e = await this.ledger.prisma.financeAssetEntry.findFirst({
      where: { facilityId, journalId },
      include: { asset: true },
    });
    return e ? { assetId: e.assetId, code: e.asset.code, name: e.asset.name, kind: e.kind } : null;
  }
}
