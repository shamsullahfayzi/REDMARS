import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  RecordPaymentRequest,
  RecordPaymentResponse,
  RefundPaymentRequest,
  RefundPaymentResponse,
} from '@redmars/shared';
import { facilityDayBounds } from '../../common/facility-time';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberSequenceService } from '../../services/number-sequence.service';

/**
 * Task 6.3 — taking the money, in instalments.
 *
 * The write side of billing begins here. A bill is raised once (reception 3.6, lab 5.6);
 * it may be settled over several payments, each its own cash-trail row with its own receipt
 * number. The invoice's `paidAmount` is the running sum and its status walks
 * issued → partially_paid → paid as the balance closes. Append-only: a payment is never
 * edited or deleted — reversing one is a refund (6.6), a new row, not a rubbed-out old one.
 */
@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: NumberSequenceService,
  ) {}

  async pay(
    facilityId: string,
    userId: string,
    invoiceId: string,
    input: RecordPaymentRequest,
  ): Promise<RecordPaymentResponse> {
    const amount = new Prisma.Decimal(input.amount);

    const result = await this.prisma.db.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, facilityId },
        select: { id: true, status: true, total: true, paidAmount: true, currency: true },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.status === 'cancelled') {
        throw new BadRequestException({
          message: 'This bill was cancelled — there is nothing to pay.',
          code: 'cancelled',
        });
      }

      const outstanding = invoice.total.minus(invoice.paidAmount);
      if (outstanding.lessThanOrEqualTo(0)) {
        throw new BadRequestException({
          message: 'This bill is already fully paid.',
          code: 'already_paid',
        });
      }
      if (amount.greaterThan(outstanding)) {
        // The till does not make change out of the system — a payment never exceeds what is
        // owed. Overpayment is a data error, not a tip.
        throw new BadRequestException({
          message: `That is more than the ${outstanding.toFixed(2)} still owed on this bill.`,
          code: 'overpayment',
        });
      }

      const paidAmount = invoice.paidAmount.plus(amount);
      const status = paidAmount.greaterThanOrEqualTo(invoice.total) ? 'paid' : 'partially_paid';

      // Optimistic guard: the update only lands if paidAmount is still what we read. If a
      // payment slipped in at another window (or the same button was double-clicked) the
      // count is zero and the whole transaction rolls back — the receipt number and the
      // payment row with it — rather than taking the money twice.
      const applied = await tx.invoice.updateMany({
        where: { id: invoiceId, facilityId, paidAmount: invoice.paidAmount },
        data: { paidAmount, status },
      });
      if (applied.count === 0) {
        throw new ConflictException({
          message: 'This bill was just paid at another window. Reload and check the balance.',
          code: 'balance_changed',
        });
      }

      // Issued only now, after the balance is safely ours — a gapless receipt number that
      // rolls back with the transaction if anything below fails.
      const receipt = await this.sequence.next(facilityId, 'receipt_no', undefined, tx);
      const payment = await tx.payment.create({
        data: {
          invoiceId,
          amount,
          method: input.method,
          reference: input.reference ?? null,
          receiptNo: receipt.formatted,
          receivedBy: userId,
        },
        select: {
          id: true,
          amount: true,
          method: true,
          reference: true,
          receiptNo: true,
          receivedAt: true,
          isReversed: true,
        },
      });

      return { invoice, paidAmount, status, payment };
    });

    const outstanding = Prisma.Decimal.max(0, result.invoice.total.minus(result.paidAmount));
    return {
      invoiceId,
      status: result.status,
      total: result.invoice.total.toFixed(2),
      paidAmount: result.paidAmount.toFixed(2),
      outstanding: outstanding.toFixed(2),
      currency: result.invoice.currency,
      payment: {
        id: result.payment.id,
        amount: result.payment.amount.toFixed(2),
        method: result.payment.method,
        reference: result.payment.reference,
        receiptNo: result.payment.receiptNo,
        receivedAt: result.payment.receivedAt.toISOString(),
        isReversed: result.payment.isReversed,
      },
    };
  }

  /**
   * Task 6.6 — giving the money back, Rule R5.
   *
   * A refund reverses ONE payment, and it is not an edit: the original row is marked
   * reversed and a negative payment is appended, exactly as a cancellation does it (visit
   * 3.11), so the till's history shows money going out as its own event — its own author,
   * time and receipt number. R5 is same-day: a receptionist may only reverse a payment
   * taken today; older ones are an admin's to reverse (an unconditional grant). The reason
   * is required by the contract and rides on the reversal row.
   */
  async refund(
    facilityId: string,
    userId: string,
    permissions: ReadonlyMap<string, string | null>,
    invoiceId: string,
    paymentId: string,
    input: RefundPaymentRequest,
  ): Promise<RefundPaymentResponse> {
    const result = await this.prisma.db.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id: paymentId, invoiceId, invoice: { facilityId } },
        select: {
          id: true,
          amount: true,
          method: true,
          isReversed: true,
          receivedAt: true,
          invoice: { select: { id: true, total: true, paidAmount: true, currency: true } },
        },
      });
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.isReversed) {
        throw new BadRequestException({
          message: 'That payment has already been reversed.',
          code: 'already_reversed',
        });
      }
      if (payment.amount.lessThanOrEqualTo(0)) {
        // The negative reversal rows are not themselves refundable.
        throw new BadRequestException({
          message: 'That row is a refund, not a payment.',
          code: 'not_a_payment',
        });
      }

      // R5's same-day window. An unconditional grant (admin) is exempt; anyone else may
      // only reverse a payment taken today, in the facility's own zone.
      if (permissions.get('payment.refund') === 'R5') {
        const { start, end } = facilityDayBounds();
        const takenToday =
          payment.receivedAt.getTime() >= start.getTime() &&
          payment.receivedAt.getTime() < end.getTime();
        if (!takenToday) {
          throw new ForbiddenException({
            message: 'Only today’s payments can be refunded here. Ask an administrator.',
            code: 'outside_r5_window',
          });
        }
      }

      // Optimistic guard: reverse only if it is still un-reversed, so two windows cannot
      // both refund the same payment.
      const marked = await tx.payment.updateMany({
        where: { id: paymentId, isReversed: false },
        data: { isReversed: true },
      });
      if (marked.count === 0) {
        throw new ConflictException({
          message: 'That payment was just reversed elsewhere. Reload.',
          code: 'already_reversed',
        });
      }

      const receipt = await this.sequence.next(facilityId, 'receipt_no', undefined, tx);
      const refundRow = await tx.payment.create({
        data: {
          invoiceId,
          amount: payment.amount.negated(),
          method: payment.method,
          reference: input.reason.slice(0, 120),
          receiptNo: receipt.formatted,
          receivedBy: userId,
        },
        select: { id: true, receivedAt: true },
      });

      const paidAmount = Prisma.Decimal.max(0, payment.invoice.paidAmount.minus(payment.amount));
      const status = paidAmount.greaterThanOrEqualTo(payment.invoice.total)
        ? 'paid'
        : paidAmount.greaterThan(0)
          ? 'partially_paid'
          : 'issued';
      await tx.invoice.update({ where: { id: invoiceId }, data: { paidAmount, status } });

      return { payment, refundRow, receipt, paidAmount, status };
    });

    const outstanding = Prisma.Decimal.max(
      0,
      result.payment.invoice.total.minus(result.paidAmount),
    );
    return {
      invoiceId,
      paymentId: result.payment.id,
      refundId: result.refundRow.id,
      // Positive: what the receptionist counts out of the drawer, not a signed ledger entry.
      refundedAmount: result.payment.amount.toFixed(2),
      refundReceiptNo: result.receipt.formatted,
      refundedAt: result.refundRow.receivedAt.toISOString(),
      reason: input.reason,
      method: result.payment.method,
      status: result.status,
      paidAmount: result.paidAmount.toFixed(2),
      outstanding: outstanding.toFixed(2),
      currency: result.payment.invoice.currency,
    };
  }
}
