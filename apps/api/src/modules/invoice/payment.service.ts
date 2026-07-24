import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RecordPaymentRequest, RecordPaymentResponse } from '@redmars/shared';
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
}
