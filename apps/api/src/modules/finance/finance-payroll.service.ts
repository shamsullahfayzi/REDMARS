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
  decimal as d,
} from './finance-ledger.service';

const journalInclude = { include: { reversal: true } } as const;
const runInclude = {
  facility: { select: { name: true } },
  period: true,
  journal: journalInclude,
  items: { include: { repayments: true, payments: { include: { journal: journalInclude } } } },
} as const;
type Journal = { id: string; status: string; reversal: { status: string } | null };
const posted = (j: Journal) => j.status === 'posted' && j.reversal?.status !== 'posted';
const journalView = (j: Journal) => ({
  id: j.id,
  status: j.status,
  reversed: j.reversal?.status === 'posted',
});
const sum = (values: (string | Prisma.Decimal)[]) =>
  values.reduce<Prisma.Decimal>((a, b) => a.add(b), d('0'));

@Injectable()
export class FinancePayrollService {
  constructor(private readonly ledger: FinanceLedgerService) {}
  private async lock(tx: AuditedTx, facilityId: string) {
    // One payroll mutation per facility: protects recalculation, approval and reservations.
    await tx.$queryRaw`SELECT id FROM facility WHERE id=${facilityId} FOR UPDATE`;
    await this.ledger.settings(tx, facilityId);
  }
  private async period(tx: AuditedTx, facilityId: string, id: string) {
    const p = await tx.fiscalPeriod.findFirst({ where: { id, facilityId } });
    if (!p) throw new NotFoundException('Fiscal period not found.');
    if (p.closedAt) throw new ConflictException('Payroll period is closed.');
    return p;
  }
  private async employee(tx: AuditedTx, facilityId: string, id: string) {
    const e = await tx.payrollEmployee.findFirst({ where: { id, facilityId } });
    if (!e) throw new NotFoundException('Payroll employee not found.');
    return e;
  }
  private async cash(tx: AuditedTx, facilityId: string, id: string) {
    if (
      !(await tx.financeAccount.findFirst({
        where: { id, facilityId, isCash: true, isActive: true, isPosting: true, isControl: false },
      }))
    )
      throw new BadRequestException('Choose an active cash or bank account in this facility.');
  }
  private async accounts(tx: AuditedTx, facilityId: string) {
    // Separate control accounts preserve any prior manual balances in the starter chart.
    for (const [key, name, type, control] of [
      ['salary_expense', 'Payroll salaries and wages', 'expense', false],
      ['salary_payable', 'Payroll net salaries payable', 'liability', true],
      ['payroll_tax', 'Payroll withholding tax payable', 'liability', true],
      ['payroll_other', 'Other payroll deductions payable', 'liability', true],
      ['staff_loans', 'Staff loans and advances', 'asset', true],
    ] as const) {
      if (
        !(await tx.financeAccount.findUnique({
          where: { facilityId_systemKey: { facilityId, systemKey: key } },
        }))
      ) {
        const parent = await tx.financeAccount.findUnique({
          where: { facilityId_systemKey: { facilityId, systemKey: '_group_' + type } },
        });
        await tx.financeAccount.create({
          data: {
            facilityId,
            code: 'PAY-' + key.toUpperCase(),
            name,
            type,
            normalBalance: type === 'liability' ? 'credit' : 'debit',
            isControl: control,
            systemKey: key,
            parentId: parent?.id,
          },
        });
      }
    }
    const keys = [
      'salary_expense',
      'salary_payable',
      'payroll_tax',
      'payroll_other',
      'staff_loans',
    ] as const;
    const entries = await Promise.all(
      keys.map(
        async (key) => [key, (await this.ledger.systemAccount(tx, facilityId, key)).id] as const,
      ),
    );
    return Object.fromEntries(entries) as Record<(typeof keys)[number], string>;
  }
  configure(actor: FinanceActor, input: z.infer<typeof c.payrollConfigInputSchema>) {
    return this.ledger.command(actor, 'payroll.configure', input, async (tx) => {
      await this.lock(tx, actor.facilityId);
      await this.accounts(tx, actor.facilityId);
      return tx.payrollConfig.upsert({
        where: { facilityId: actor.facilityId },
        create: { facilityId: actor.facilityId, taxName: input.taxName, taxBands: input.taxBands },
        update: { taxName: input.taxName, taxBands: input.taxBands },
      });
    });
  }
  saveEmployee(
    actor: FinanceActor,
    id: string | null,
    input: z.infer<typeof c.payrollEmployeeInputSchema>,
  ) {
    return this.ledger.command(actor, 'payroll.employee:' + (id ?? 'new'), input, async (tx) => {
      await this.lock(tx, actor.facilityId);
      if (id) await this.employee(tx, actor.facilityId, id);
      if (
        !(await tx.financeCostCentre.findFirst({
          where: { id: input.costCentreId, facilityId: actor.facilityId, isActive: true },
        }))
      )
        throw new BadRequestException('Choose an active cost centre in this facility.');
      const data = {
        code: input.code,
        name: input.name,
        nameDari: input.nameDari,
        basic: input.basic,
        allowance: input.allowance,
        overtimeRate: input.overtimeRate,
        currency: input.currency,
        costCentreId: input.costCentreId,
        isActive: input.isActive,
        startsOn: date(input.startsOn),
        endsOn: input.endsOn ? date(input.endsOn) : null,
      };
      return id
        ? tx.payrollEmployee.update({ where: { id }, data })
        : tx.payrollEmployee.create({ data: { ...data, facilityId: actor.facilityId } });
    });
  }
  issueLoan(actor: FinanceActor, input: z.infer<typeof c.payrollLoanInputSchema>) {
    return this.ledger.command(actor, 'payroll.loan', input, async (tx) => {
      await this.lock(tx, actor.facilityId);
      const e = await this.employee(tx, actor.facilityId, input.employeeId);
      if (!e.isActive || date(input.date) < e.startsOn || (e.endsOn && date(input.date) > e.endsOn))
        throw new BadRequestException('Loan date must fall within active employment.');
      const p = await this.period(tx, actor.facilityId, input.firstPeriodId);
      if (date(input.date) >= p.endsOn)
        throw new BadRequestException('First deduction period precedes the loan.');
      if (
        await tx.payrollRun.count({
          where: { facilityId: actor.facilityId, periodId: p.id, status: 'approved' },
        })
      )
        throw new ConflictException('First deduction period is already approved.');
      await this.cash(tx, actor.facilityId, input.cashAccountId);
      const accounts = await this.accounts(tx, actor.facilityId),
        id = randomUUID();
      const j = await this.ledger.automatic(
        tx,
        actor,
        {
          date: input.date,
          memo: `${input.kind}: ${e.code} ${input.reference}`.slice(0, 240),
          idempotencyKey: input.idempotencyKey,
          lines: [
            {
              description: 'Payroll',
              accountId: accounts.staff_loans,
              debit: input.amount,
              credit: '0',
            },
            {
              description: 'Payroll payment',
              accountId: input.cashAccountId,
              debit: '0',
              credit: input.amount,
            },
          ],
        },
        'payroll_loan',
        id,
      );
      return tx.payrollLoan.create({
        data: {
          id,
          facilityId: actor.facilityId,
          employeeId: e.id,
          kind: input.kind,
          reference: input.reference,
          amount: input.amount,
          installment: input.installment,
          firstPeriodId: p.id,
          journalId: j.id,
        },
      });
    });
  }
  calculate(actor: FinanceActor, input: z.infer<typeof c.payrollCalculateSchema>) {
    return this.ledger.command(actor, 'payroll.calculate', input, async (tx) => {
      await this.lock(tx, actor.facilityId);
      const p = await this.period(tx, actor.facilityId, input.periodId);
      if (date(input.date) < p.startsOn || date(input.date) >= p.endsOn)
        throw new BadRequestException('Accrual date must be inside the payroll period.');
      await this.ledger.periodFor(tx, actor.facilityId, input.date);
      const config = await tx.payrollConfig.findUnique({ where: { facilityId: actor.facilityId } });
      if (!config) throw new BadRequestException('Configure payroll tax before calculating.');
      const taxBands = z.array(c.payrollTaxBandSchema).parse(config.taxBands);
      const previous = await tx.payrollRun.findUnique({
        where: { facilityId_periodId: { facilityId: actor.facilityId, periodId: p.id } },
      });
      if (previous?.status === 'approved')
        throw new ConflictException('Approved payroll is immutable.');
      if (
        await tx.payrollRun.count({
          where: {
            facilityId: actor.facilityId,
            status: 'approved',
            period: { startsOn: { gt: p.startsOn } },
          },
        })
      )
        throw new ConflictException(
          'Calculate payroll in chronological order. A later period is already approved.',
        );
      const employees = await tx.payrollEmployee.findMany({
        where: {
          facilityId: actor.facilityId,
          isActive: true,
          startsOn: { lt: p.endsOn },
          OR: [{ endsOn: null }, { endsOn: { gte: p.startsOn } }],
        },
        include: { costCentre: true },
        orderBy: { code: 'asc' },
      });
      if (!employees.length) throw new BadRequestException('No active employees in this period.');
      if (employees.length > 500)
        throw new BadRequestException('Payroll supports up to 500 employees per facility.');
      for (const a of input.adjustments)
        if (!employees.some((e) => e.id === a.employeeId))
          throw new BadRequestException(
            'Adjustment employee is not eligible in this facility and period.',
          );
      const runData = {
        date: date(input.date),
        status: 'calculated',
        createdBy: actor.userId,
        reviewedBy: null,
        taxName: config.taxName,
        taxBands: config.taxBands as Prisma.InputJsonValue,
      };
      const run = previous
        ? await tx.payrollRun.update({
            where: { id: previous.id },
            data: { ...runData, version: { increment: 1 } },
          })
        : await tx.payrollRun.create({
            data: { ...runData, facilityId: actor.facilityId, periodId: p.id },
          });
      if (previous) {
        await tx.payrollRepayment.deleteMany({ where: { item: { runId: run.id } } });
        await tx.payrollItem.deleteMany({ where: { runId: run.id } });
      }
      const periodDays = Math.round((p.endsOn.getTime() - p.startsOn.getTime()) / 86400000);
      for (const e of employees) {
        if (!e.costCentre.isActive)
          throw new BadRequestException(`Activate the cost centre for ${e.code}.`);
        const start = e.startsOn > p.startsOn ? e.startsOn : p.startsOn;
        const end =
          e.endsOn && nextDay(day(e.endsOn)) < p.endsOn ? nextDay(day(e.endsOn)) : p.endsOn;
        const eligibleDays = Math.round((end.getTime() - start.getTime()) / 86400000);
        const adjustment =
          input.adjustments.find((a) => a.employeeId === e.id) ??
          c.payrollAdjustmentSchema.parse({ employeeId: e.id });
        const loans = await tx.payrollLoan.findMany({
          where: { employeeId: e.id, firstPeriod: { startsOn: { lte: p.startsOn } } },
          include: {
            journal: journalInclude,
            repayments: {
              include: {
                item: { include: { run: { include: { period: true, journal: journalInclude } } } },
              },
            },
          },
          orderBy: { id: 'asc' },
        });
        const repayments: { loanId: string; amount: string }[] = [];
        for (const loan of loans) {
          if (
            !posted(loan.journal) ||
            loan.journal.reversal ||
            loan.journal.date > date(input.date)
          )
            continue;
          const approved = loan.repayments.filter((r) => r.item.run.status === 'approved');
          if (
            approved.some(
              (r) =>
                r.item.run.period.startsOn >= p.startsOn ||
                !r.item.run.journal ||
                !posted(r.item.run.journal),
            )
          )
            throw new ConflictException(
              'Post earlier approved payroll journals before calculating this period.',
            );
          const balance = loan.amount.sub(sum(approved.map((r) => r.amount)));
          if (balance.gt('0'))
            repayments.push({
              loanId: loan.id,
              amount: (balance.lt(loan.installment) ? balance : loan.installment).toFixed(2),
            });
        }
        let amounts: ReturnType<typeof c.calculatePayroll>;
        try {
          amounts = c.calculatePayroll({
            basic: e.basic.toFixed(2),
            allowance: e.allowance.toFixed(2),
            overtimeRate: e.overtimeRate.toFixed(2),
            periodDays,
            eligibleDays,
            ...adjustment,
            taxBands,
            loanDeduction: sum(repayments.map((r) => r.amount)).toFixed(2),
          });
        } catch (error) {
          throw new BadRequestException(
            `${e.code}: ${error instanceof Error ? error.message : 'Invalid payroll'}`,
          );
        }
        const snapshot = {
          ...amounts,
          code: e.code,
          name: e.name,
          nameDari: e.nameDari,
          centreName: e.costCentre.name,
          currency: e.currency,
          periodDays,
          eligibleDays,
          absenceDays: adjustment.absenceDays,
          overtimeHours: adjustment.overtimeHours,
          note: adjustment.note,
        };
        const item = await tx.payrollItem.create({
          data: {
            facilityId: actor.facilityId,
            runId: run.id,
            employeeId: e.id,
            costCentreId: e.costCentreId,
            snapshot,
            gross: amounts.gross,
            tax: amounts.tax,
            loanDeduction: amounts.loanDeduction,
            otherDeduction: amounts.otherDeduction,
            net: amounts.net,
          },
        });
        for (const r of repayments)
          await tx.payrollRepayment.create({
            data: { facilityId: actor.facilityId, itemId: item.id, ...r },
          });
      }
      return { id: run.id };
    });
  }
  action(
    actor: FinanceActor,
    id: string,
    action: 'review' | 'approve',
    input: z.infer<typeof c.payrollActionSchema>,
  ) {
    return this.ledger.command(actor, `payroll.${action}:${id}`, input, async (tx) => {
      await this.lock(tx, actor.facilityId);
      const run = await tx.payrollRun.findFirst({
        where: { id, facilityId: actor.facilityId },
        include: runInclude,
      });
      if (!run) throw new NotFoundException('Payroll run not found.');
      if (
        run.version !== input.version ||
        run.status !== (action === 'review' ? 'calculated' : 'reviewed')
      )
        throw new ConflictException('Payroll changed; reload the current run.');
      await this.period(tx, actor.facilityId, run.periodId);
      if (action === 'review')
        return tx.payrollRun.update({
          where: { id },
          data: { status: 'reviewed', reviewedBy: actor.userId, version: { increment: 1 } },
        });
      if (run.createdBy === actor.userId)
        throw new ConflictException('A different payroll approver must approve this run.');
      if (
        await tx.payrollRun.count({
          where: {
            facilityId: actor.facilityId,
            status: 'approved',
            period: { startsOn: { gt: run.period.startsOn } },
          },
        })
      )
        throw new ConflictException(
          'A later payroll period was approved. Payroll must be approved in chronological order.',
        );
      // Recheck loans at approval: a second calculated period may have used the same balance.
      for (const item of run.items)
        for (const repayment of item.repayments) {
          const loan = await tx.payrollLoan.findUniqueOrThrow({
            where: { id: repayment.loanId },
            include: {
              journal: journalInclude,
              repayments: {
                include: {
                  item: {
                    include: { run: { include: { period: true, journal: journalInclude } } },
                  },
                },
              },
            },
          });
          const approved = loan.repayments.filter((r) => r.item.run.status === 'approved');
          const balance = loan.amount.sub(sum(approved.map((r) => r.amount)));
          const expected = balance.lt(loan.installment) ? balance : loan.installment;
          if (
            !posted(loan.journal) ||
            loan.journal.reversal ||
            !expected.eq(repayment.amount) ||
            approved.some(
              (r) =>
                r.item.run.period.startsOn >= run.period.startsOn ||
                !r.item.run.journal ||
                !posted(r.item.run.journal),
            )
          )
            throw new ConflictException(
              'Loan balances changed. Recalculate payroll before approval.',
            );
        }
      // New posted loans also require recalculation rather than silently skipping installments.
      const dueLoans = await tx.payrollLoan.findMany({
        where: {
          facilityId: actor.facilityId,
          employeeId: { in: run.items.map((i) => i.employeeId) },
          firstPeriod: { startsOn: { lte: run.period.startsOn } },
          journal: { status: 'posted', date: { lte: run.date }, reversal: null },
        },
        include: { repayments: { include: { item: { include: { run: true } } } } },
      });
      for (const loan of dueLoans)
        if (
          loan.amount.gt(
            sum(
              loan.repayments.filter((r) => r.item.run.status === 'approved').map((r) => r.amount),
            ),
          ) &&
          !run.items.some((i) => i.repayments.some((r) => r.loanId === loan.id))
        )
          throw new ConflictException('A loan was issued after calculation. Recalculate payroll.');
      const accounts = await this.accounts(tx, actor.facilityId);
      const lines: c.FinanceJournalInput['lines'] = [];
      const centres = new Map<string, Prisma.Decimal>();
      for (const i of run.items)
        centres.set(i.costCentreId, (centres.get(i.costCentreId) ?? d('0')).add(i.gross));
      for (const [costCentreId, gross] of centres)
        if (gross.gt('0'))
          lines.push({
            description: 'Payroll',
            accountId: accounts.salary_expense,
            costCentreId,
            debit: gross.toFixed(2),
            credit: '0',
          });
      for (const [field, account] of [
        ['tax', 'payroll_tax'],
        ['loanDeduction', 'staff_loans'],
        ['otherDeduction', 'payroll_other'],
        ['net', 'salary_payable'],
      ] as const) {
        const total = sum(run.items.map((i) => i[field]));
        if (total.gt('0'))
          lines.push({
            description: 'Payroll',
            accountId: accounts[account],
            debit: '0',
            credit: total.toFixed(2),
          });
      }
      // Retain the preparer on the auto-draft, allowing the independent approver to post it.
      const journal = await this.ledger.automatic(
        tx,
        { ...actor, userId: run.createdBy },
        {
          date: day(run.date),
          memo: 'Payroll ' + run.period.label,
          lines,
          idempotencyKey: input.idempotencyKey,
        },
        'payroll_accrual',
        id,
      );
      return tx.payrollRun.update({
        where: { id },
        data: {
          status: 'approved',
          approvedBy: actor.userId,
          approvedAt: new Date(),
          journalId: journal.id,
          version: { increment: 1 },
        },
      });
    });
  }
  payment(actor: FinanceActor, input: z.infer<typeof c.payrollPaymentSchema>) {
    return this.ledger.command(actor, 'payroll.payment', input, async (tx) => {
      await this.lock(tx, actor.facilityId);
      const item = await tx.payrollItem.findFirst({
        where: { id: input.itemId, facilityId: actor.facilityId },
        include: {
          run: { include: { journal: journalInclude } },
          payments: { include: { journal: journalInclude } },
        },
      });
      if (!item) throw new NotFoundException('Payroll item not found.');
      if (
        item.run.status !== 'approved' ||
        !item.run.journal ||
        !posted(item.run.journal) ||
        item.run.journal.reversal
      )
        throw new ConflictException('Approve payroll and post its accrual journal before paying.');
      if (date(input.date) < item.run.date)
        throw new BadRequestException('Salary payment cannot precede the payroll accrual.');
      const committed = sum(
        item.payments.filter((p) => p.journal.reversal?.status !== 'posted').map((p) => p.amount),
      );
      if (committed.add(input.amount).gt(item.net))
        throw new ConflictException('Payment exceeds net salary after pending payments.');
      await this.cash(tx, actor.facilityId, input.cashAccountId);
      const accounts = await this.accounts(tx, actor.facilityId),
        id = randomUUID();
      const j = await this.ledger.automatic(
        tx,
        actor,
        {
          date: input.date,
          memo: 'Salary payment: ' + input.reference,
          idempotencyKey: input.idempotencyKey,
          lines: [
            {
              description: 'Payroll',
              accountId: accounts.salary_payable,
              debit: input.amount,
              credit: '0',
            },
            {
              description: 'Payroll payment',
              accountId: input.cashAccountId,
              debit: '0',
              credit: input.amount,
            },
          ],
        },
        'payroll_payment',
        id,
      );
      return tx.payrollPayment.create({
        data: {
          id,
          facilityId: actor.facilityId,
          itemId: item.id,
          journalId: j.id,
          amount: input.amount,
          reference: input.reference,
        },
      });
    });
  }
  async detail(facilityId: string, id: string) {
    const run = await this.ledger.prisma.db.payrollRun.findFirst({
      where: { id, facilityId },
      include: runInclude,
    });
    if (!run) throw new NotFoundException('Payroll run not found.');
    const items = run.items.map((i) => {
      const paid = sum(i.payments.filter((p) => posted(p.journal)).map((p) => p.amount));
      const reserved = sum(
        i.payments.filter((p) => p.journal.status === 'draft').map((p) => p.amount),
      );
      return {
        ...(i.snapshot as Prisma.JsonObject),
        id: i.id,
        employeeId: i.employeeId,
        costCentreId: i.costCentreId,
        paid: paid.toFixed(2),
        reserved: reserved.toFixed(2),
        available: i.net.sub(paid).sub(reserved).toFixed(2),
      };
    });
    return {
      facilityName: run.facility.name,
      id: run.id,
      periodId: run.periodId,
      period: run.period.label,
      date: day(run.date),
      status: run.status,
      version: run.version,
      createdBy: run.createdBy,
      approvedBy: run.approvedBy,
      taxName: run.taxName,
      journal: run.journal ? journalView(run.journal) : null,
      items,
      payments: run.items.flatMap((i) =>
        i.payments.map((p) => ({
          id: p.id,
          itemId: i.id,
          amount: p.amount.toFixed(2),
          reference: p.reference,
          date: day(p.journal.date),
          journal: journalView(p.journal),
        })),
      ),
    };
  }
  async source(facilityId: string, id: string) {
    const j = await this.ledger.prisma.db.financeJournal.findFirst({
      where: { id, facilityId },
      include: {
        payrollRun: { include: { period: true } },
        payrollLoan: { include: { employee: true } },
        payrollPayment: {
          include: { item: { include: { employee: true, run: { include: { period: true } } } } },
        },
      },
    });
    if (!j) throw new NotFoundException('Journal not found.');
    const run = j.payrollRun ?? j.payrollPayment?.item.run;
    return {
      runId: run?.id ?? null,
      period: run?.period.label ?? null,
      employee: j.payrollLoan?.employee.name ?? j.payrollPayment?.item.employee.name ?? null,
      reference: j.payrollLoan?.reference ?? j.payrollPayment?.reference ?? null,
    };
  }
  async workspace(facilityId: string) {
    const tx = this.ledger.prisma.db;
    const [config, employees, centres, runs, loans] = await Promise.all([
      tx.payrollConfig.findUnique({ where: { facilityId } }),
      tx.payrollEmployee.findMany({ where: { facilityId }, orderBy: { code: 'asc' } }),
      tx.financeCostCentre.findMany({
        where: { facilityId, isActive: true },
        orderBy: { code: 'asc' },
      }),
      tx.payrollRun.findMany({
        where: { facilityId },
        include: { period: true, items: true },
        orderBy: { date: 'desc' },
      }),
      tx.payrollLoan.findMany({
        where: { facilityId },
        include: {
          employee: true,
          firstPeriod: true,
          journal: journalInclude,
          repayments: {
            include: { item: { include: { run: { include: { journal: journalInclude } } } } },
          },
        },
        orderBy: { reference: 'asc' },
      }),
    ]);
    return {
      config,
      centres,
      employees: employees.map((e) => ({
        ...e,
        basic: e.basic.toFixed(2),
        allowance: e.allowance.toFixed(2),
        overtimeRate: e.overtimeRate.toFixed(2),
        startsOn: day(e.startsOn),
        endsOn: e.endsOn ? day(e.endsOn) : null,
      })),
      runs: runs.map((r) => ({
        id: r.id,
        period: r.period.label,
        date: day(r.date),
        status: r.status,
        gross: sum(r.items.map((i) => i.gross)).toFixed(2),
        net: sum(r.items.map((i) => i.net)).toFixed(2),
      })),
      loans: loans.map((l) => {
        const deducted = sum(
          l.repayments
            .filter((r) => r.item.run.journal && posted(r.item.run.journal))
            .map((r) => r.amount),
        );
        const reserved = sum(
          l.repayments
            .filter(
              (r) => r.item.run.status === 'approved' && r.item.run.journal?.status === 'draft',
            )
            .map((r) => r.amount),
        );
        return {
          id: l.id,
          employeeId: l.employeeId,
          employeeName: l.employee.name,
          kind: l.kind,
          reference: l.reference,
          amount: l.amount.toFixed(2),
          installment: l.installment.toFixed(2),
          deducted: deducted.toFixed(2),
          reserved: reserved.toFixed(2),
          outstanding: (posted(l.journal) ? l.amount.sub(deducted) : d('0')).toFixed(2),
          firstPeriod: l.firstPeriod.label,
          journal: journalView(l.journal),
        };
      }),
    };
  }
}
