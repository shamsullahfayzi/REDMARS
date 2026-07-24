import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PAYMENT_METHODS } from '@redmars/shared';
import type { TillReportResponse, TillSummary } from '@redmars/shared';
import {
  facilityDateString,
  facilityDayBounds,
  facilityDayBoundsFor,
} from '../../common/facility-time';
import { PrismaService } from '../../prisma/prisma.service';

const ZERO = new Prisma.Decimal(0);

/** A till's running aggregate as it is built, before it is shaped for the wire. */
interface Bucket {
  userId: string | null;
  byMethod: Map<string, Prisma.Decimal>;
  cash: Prisma.Decimal;
  total: Prisma.Decimal;
  paymentCount: number;
  refundCount: number;
}

/**
 * Task 6.12 — daily cash reconciliation, per till, per user.
 *
 * Sums the day's payments, grouped by the person who took them. Payments are signed and
 * append-only, so a refund is a negative row and summing every amount gives the true drawer
 * position without special-casing reversals. Cash is the figure that must physically balance.
 */
@Injectable()
export class TillService {
  constructor(private readonly prisma: PrismaService) {}

  async report(facilityId: string, date?: string, userId?: string): Promise<TillReportResponse> {
    const { start, end } = date ? facilityDayBoundsFor(date) : facilityDayBounds();

    const where: Prisma.PaymentWhereInput = {
      receivedAt: { gte: start, lt: end },
      invoice: { facilityId },
    };
    if (userId) where.receivedBy = userId;

    const payments = await this.prisma.db.payment.findMany({
      where,
      select: { amount: true, method: true, receivedBy: true },
    });

    const buckets = new Map<string, Bucket>();
    const keyOf = (id: string | null) => id ?? '__unattributed__';
    for (const payment of payments) {
      const key = keyOf(payment.receivedBy);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          userId: payment.receivedBy,
          byMethod: new Map(),
          cash: ZERO,
          total: ZERO,
          paymentCount: 0,
          refundCount: 0,
        };
        buckets.set(key, bucket);
      }
      bucket.byMethod.set(
        payment.method,
        (bucket.byMethod.get(payment.method) ?? ZERO).add(payment.amount),
      );
      bucket.total = bucket.total.add(payment.amount);
      if (payment.method === 'cash') bucket.cash = bucket.cash.add(payment.amount);
      if (payment.amount.greaterThan(0)) bucket.paymentCount += 1;
      else if (payment.amount.lessThan(0)) bucket.refundCount += 1;
    }

    // A specific till with no activity today still deserves a (zero) card to reconcile.
    if (userId && !buckets.has(keyOf(userId))) {
      buckets.set(userId, {
        userId,
        byMethod: new Map(),
        cash: ZERO,
        total: ZERO,
        paymentCount: 0,
        refundCount: 0,
      });
    }

    const names = await this.namesFor(
      facilityId,
      [...buckets.values()].map((b) => b.userId).filter((id): id is string => id !== null),
    );

    const tills: TillSummary[] = [...buckets.values()]
      .map((bucket) => ({
        userId: bucket.userId,
        userName: bucket.userId ? (names.get(bucket.userId) ?? '') : '',
        byMethod: PAYMENT_METHODS.filter((m) => bucket.byMethod.has(m)).map((m) => ({
          method: m,
          amount: (bucket.byMethod.get(m) ?? ZERO).toFixed(2),
        })),
        cashTotal: bucket.cash.toFixed(2),
        total: bucket.total.toFixed(2),
        paymentCount: bucket.paymentCount,
        refundCount: bucket.refundCount,
      }))
      .sort((a, b) => a.userName.localeCompare(b.userName));

    const grandTotal = tills.reduce((sum, t) => sum.add(t.total), ZERO);
    const cashTotal = tills.reduce((sum, t) => sum.add(t.cashTotal), ZERO);

    return {
      date: date ?? facilityDateString(start),
      tills,
      grandTotal: grandTotal.toFixed(2),
      cashTotal: cashTotal.toFixed(2),
    };
  }

  private async namesFor(facilityId: string, ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const users = await this.prisma.db.appUser.findMany({
      where: { id: { in: ids }, facilityId },
      select: { id: true, fullName: true },
    });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }
}
