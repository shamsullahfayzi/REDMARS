import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { DISCOUNT_CEILING_PCT } from '@redmars/shared';
import type {
  ApplyDiscountRequest,
  ApplyDiscountResponse,
  DiscountApproval,
} from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** The R10-override permission an approver must hold to authorise an over-ceiling discount. */
const APPROVE_PERMISSION = 'discount.approve_over_threshold';

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
    userId: string,
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

      // R10. Within the caller's ceiling this is a no-op; over it, the discount is refused
      // UNLESS a valid approver stands behind it (task 6.5). The approver's id, once
      // verified, is stamped on the bill as the second person the rule requires.
      const approver = await this.authoriseCeiling(
         tx as any,
        facilityId,
        userId,
        permissions,
        invoice.subtotal,
        discount,
        input.approval,
      );

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
        data: {
          discount,
          discountReason: input.reason,
          total,
          status,
          discountApprovedBy: approver?.id ?? null,
          discountApprovedAt: approver ? new Date() : null,
        },
      });
      const status_ = status as InvoiceStatus ;
      return { invoice, discount, total,status_ , approvedByName: approver?.fullName ?? null };
    });

    const outstanding = Prisma.Decimal.max(0, result.total.minus(result.invoice.paidAmount));
    return {
      invoiceId,
      status:result.status_,
      subtotal: result.invoice.subtotal.toFixed(2),
      discount: result.discount.toFixed(2),
      discountReason: input.reason,
      total: result.total.toFixed(2),
      paidAmount: result.invoice.paidAmount.toFixed(2),
      outstanding: outstanding.toFixed(2),
      currency: result.invoice.currency,
      approvedByName: result.approvedByName,
    };
  }

  /**
   * R10's ceiling. An unconditional `discount.apply`, or the authority to approve past the
   * threshold, means no cap — the caller is their own authority and the discount stands with
   * no approver. Anyone else is held to 10% of subtotal: a discount within it passes freely;
   * one over it is refused (`over_ceiling`, the signal for the till to summon an admin)
   * unless a valid approver is supplied, in which case their verified identity is returned to
   * be stamped on the bill.
   */
  private async authoriseCeiling(
    tx: Prisma.TransactionClient,
    facilityId: string,
    userId: string,
    permissions: ReadonlyMap<string, string | null>,
    subtotal: Prisma.Decimal,
    discount: Prisma.Decimal,
    approval: DiscountApproval | undefined,
  ): Promise<{ id: string; fullName: string } | null> {
    const condition = permissions.get('discount.apply');
    const uncapped = condition === null || permissions.has(APPROVE_PERMISSION);
    if (uncapped) return null;

    const ceiling = subtotal.mul(DISCOUNT_CEILING_PCT).div(100);
    if (discount.lessThanOrEqualTo(ceiling)) return null;

    if (!approval) {
      throw new ForbiddenException({
        message: `A discount over ${DISCOUNT_CEILING_PCT}% needs an administrator's approval (up to ${ceiling.toFixed(2)} without).`,
        code: 'over_ceiling',
      });
    }

    return this.verifyApprover(tx, facilityId, userId, approval);
  }

  /**
   * The manager override, checked at the till (task 6.5). The approver must be a real, active
   * user of this facility, whose password matches and who holds the over-threshold authority,
   * and who is NOT the person asking — a second person, literally. A wrong password is 401 so
   * it cannot be told apart from an unknown user; a valid user without the authority is 403.
   */
  private async verifyApprover(
    tx: Prisma.TransactionClient,
    facilityId: string,
    userId: string,
    approval: DiscountApproval,
  ): Promise<{ id: string; fullName: string }> {
    const approver = await tx.appUser.findFirst({
      where: { facilityId, username: approval.username, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        passwordHash: true,
        userRoles: {
          select: {
            role: {
              select: { rolePermissions: { select: { permission: { select: { code: true } } } } },
            },
          },
        },
      },
    });

    const passwordOk = approver ? await verify(approver.passwordHash, approval.password) : false;
    if (!approver || !passwordOk) {
      throw new UnauthorizedException({
        message: 'That approval was not accepted — check the username and password.',
        code: 'approval_invalid',
      });
    }
    if (approver.id === userId) {
      throw new ForbiddenException({
        message: 'An over-ceiling discount must be approved by a second person.',
        code: 'approval_self',
      });
    }

    const holdsAuthority = approver.userRoles.some((ur) =>
      ur.role.rolePermissions.some((rp) => rp.permission.code === APPROVE_PERMISSION),
    );
    if (!holdsAuthority) {
      throw new ForbiddenException({
        message: 'That user cannot approve a discount over the ceiling.',
        code: 'approval_insufficient',
      });
    }

    return { id: approver.id, fullName: approver.fullName };
  }
}
