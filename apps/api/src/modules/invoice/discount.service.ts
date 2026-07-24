import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DISCOUNT_CEILING_PCT } from '@redmars/shared';
import type { ApplyDiscountRequest, ApplyDiscountResponse } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Task 6.4 — a discount on a bill already raised, Rule R10.
 *
 * Reception (3.6) discounts a bill as it is created; this discounts one after the fact. The
 * ceiling is the same and enforced the same way: the PermissionsGuard lets anyone holding
 * `discount.apply` through the door, but the ceiling is a percentage of a subtotal the guard
 * never sees, so the R10 cap is applied HERE against the actual bill. A receptionist may
 * take at most 10% off; an admin (an unconditional grant, or the authority to approve past
 * the threshold) any amount. The reason is mandatory — that is the whole point of R10: a
 * discount you cannot account for is cash leaving the till.
 *
 * The change is audited for free: the invoice.update runs through the audited client, so its
 * before/after — old discount, new discount, the reason, the total — is written to the
 * audit trail with the actor the interceptor stamped.
 */
@Injectable()
export class DiscountService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(
    facilityId: string,
    permissions: ReadonlyMap<string, string | null>,
    invoiceId: string,
    input: ApplyDiscountRequest,
  ): Promise<ApplyDiscountResponse> {
    const discount = new Prisma.Decimal(input.amount);

    const result = await this.prisma.db.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, facilityId },
        select: { id: true, status: true, subtotal: true, paidAmount: true, currency: true },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.status === 'cancelled') {
        throw new BadRequestException({
          message: 'This bill was cancelled — there is nothing to discount.',
          code: 'cancelled',
        });
      }
      if (discount.greaterThan(invoice.subtotal)) {
        throw new BadRequestException({
          message: 'The discount is more than the bill.',
          code: 'over_subtotal',
        });
      }

      this.assertWithinCeiling(permissions, invoice.subtotal, discount);

      const total = invoice.subtotal.minus(discount);
      if (total.lessThan(invoice.paidAmount)) {
        // The patient has already paid more than the discounted bill would total — settling
        // that gap is a refund (6.6), not something a discount should silently create.
        throw new BadRequestException({
          message:
            'This bill is already paid above the discounted total — a refund is needed first.',
          code: 'would_owe_refund',
        });
      }

      const status = total.lessThanOrEqualTo(invoice.paidAmount)
        ? 'paid'
        : invoice.paidAmount.greaterThan(0)
          ? 'partially_paid'
          : 'issued';

      await tx.invoice.update({
        where: { id: invoiceId },
        data: { discount, discountReason: input.reason, total, status },
      });

      return { invoice, discount, total, status };
    });

    const outstanding = Prisma.Decimal.max(0, result.total.minus(result.invoice.paidAmount));
    return {
      invoiceId,
      status: result.status,
      subtotal: result.invoice.subtotal.toFixed(2),
      discount: result.discount.toFixed(2),
      discountReason: input.reason,
      total: result.total.toFixed(2),
      paidAmount: result.invoice.paidAmount.toFixed(2),
      outstanding: outstanding.toFixed(2),
      currency: result.invoice.currency,
    };
  }

  /**
   * R10's ceiling, identical to reception's. An unconditional `discount.apply`, or the
   * authority to approve past the threshold, means no cap; anything else is 10% of subtotal.
   */
  private assertWithinCeiling(
    permissions: ReadonlyMap<string, string | null>,
    subtotal: Prisma.Decimal,
    discount: Prisma.Decimal,
  ): void {
    const condition = permissions.get('discount.apply');
    const uncapped = condition === null || permissions.has('discount.approve_over_threshold');
    if (uncapped) return;

    const ceiling = subtotal.mul(DISCOUNT_CEILING_PCT).div(100);
    if (discount.greaterThan(ceiling)) {
      throw new ForbiddenException({
        message: `A discount over ${DISCOUNT_CEILING_PCT}% needs approval (maximum ${ceiling.toFixed(2)}).`,
        code: 'over_ceiling',
      });
    }
  }
}
