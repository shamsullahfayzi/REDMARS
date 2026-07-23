import { Injectable } from '@nestjs/common';
import type { LabQueueEntry, LabQueueQuery, LabQueueResponse } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  facilityDateString,
  facilityDayBounds,
  facilityDayBoundsFor,
} from '../../common/facility-time';

/**
 * Phase 5, second slice — the lab worklist.
 *
 * The order slice was the doctor's view of one visit. This is the bench's view of the whole
 * facility: every ordered test still to be acted on, oldest first, so the technician works
 * the queue in the order patients waited rather than the order a screen happened to load.
 *
 * WHY TODAY BY DEFAULT. The queue bounds to the facility's own day for the same reason the
 * visit queue does — a lab that works same-day (Farhat does) wants the morning's work, not a
 * running total since opening. A date filter looks back when something was missed. The
 * trade-off is real: a sample uncollected overnight drops off tomorrow's default view, and a
 * later slice may need a "still outstanding" lane — but bounding by day is the proven shape,
 * and reception cancels what goes unpaid, so nothing lingers silently for long.
 *
 * PAYMENT IS READ, NOT ENFORCED, HERE. The row carries whether its bill is settled so the
 * bench can see what is ready; refusing to collect a sample for an unpaid test is the next
 * slice's job, at the write. `paid` is true only for a fully-settled invoice — a partial
 * payment cannot yet be pinned to a specific line, so it reads unpaid until the whole order
 * is covered.
 */

const LAB_REF_TYPE = 'lab_order_item';

/** The work still in play — everything before verified (done) or cancelled (gone). */
const ACTIVE_STATUSES = ['ordered', 'sample_collected', 'in_progress', 'resulted'] as const;

@Injectable()
export class LabQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async queue(facilityId: string, query: LabQueueQuery): Promise<LabQueueResponse> {
    const { start, end } = query.date ? facilityDayBoundsFor(query.date) : facilityDayBounds();

    const statusWhere = query.status
      ? { status: query.status }
      : { status: { in: [...ACTIVE_STATUSES] } };

    const [items, grouped] = await Promise.all([
      this.prisma.db.labOrderItem.findMany({
        where: {
          ...statusWhere,
          labOrder: { facilityId, orderedAt: { gte: start, lt: end } },
        },
        // Oldest order first — a queue not ordered by arrival is a list, and someone waits
        // all morning.
        orderBy: [{ labOrder: { orderedAt: 'asc' } }, { testNameAtTime: 'asc' }],
        select: {
          id: true,
          testId: true,
          testNameAtTime: true,
          status: true,
          test: { select: { code: true } },
          labOrder: {
            select: {
              id: true,
              orderNo: true,
              orderedAt: true,
              visitId: true,
              visit: {
                select: {
                  patient: {
                    select: { id: true, mrn: true, prefix: true, firstName: true, lastName: true },
                  },
                },
              },
            },
          },
        },
      }),
      // Header counts for the whole day, independent of the status filter — the point of
      // them is to say what the filter is hiding.
      this.prisma.db.labOrderItem.groupBy({
        by: ['status'],
        where: { labOrder: { facilityId, orderedAt: { gte: start, lt: end } } },
        _count: { _all: true },
      }),
    ]);

    // Payment per item — the lab invoice line points back at the item by refId, and the line
    // carries the price snapshot; its invoice carries the settled/unsettled status.
    const itemIds = items.map((item) => item.id);
    const lines = itemIds.length
      ? await this.prisma.db.invoiceItem.findMany({
          where: { refType: LAB_REF_TYPE, refId: { in: itemIds } },
          select: {
            refId: true,
            unitPrice: true,
            invoice: { select: { status: true, total: true, paidAmount: true } },
          },
        })
      : [];
    const payByItem = new Map(
      lines.map((line) => [
        line.refId,
        {
          status: line.invoice.status,
          price: line.unitPrice.toFixed(2),
          // Settled means nothing OUTSTANDING, not the status word: a 0.00 invoice (an
          // unpriced test) is born 'issued' yet owes nothing, so the bench may draw it. This
          // is the same measure the collect endpoint gates on, so the queue's "paid" badge
          // and the draw button never disagree.
          settled: !line.invoice.total.greaterThan(line.invoice.paidAmount),
        },
      ]),
    );

    const counts = { ordered: 0, sample_collected: 0, in_progress: 0, resulted: 0 };
    for (const group of grouped) {
      if (group.status in counts) {
        counts[group.status as keyof typeof counts] = group._count._all;
      }
    }

    const now = Date.now();
    return {
      entries: items.map((item) => this.toEntry(item, payByItem, now)),
      date: query.date ?? facilityDateString(),
      counts,
    };
  }

  private toEntry(
    item: {
      id: string;
      testId: string;
      testNameAtTime: string;
      status: LabQueueEntry['status'];
      test: { code: string };
      labOrder: {
        id: string;
        orderNo: string;
        orderedAt: Date;
        visitId: string;
        visit: {
          patient: {
            id: string;
            mrn: string;
            prefix: string | null;
            firstName: string;
            lastName: string | null;
          };
        };
      };
    },
    payByItem: Map<string | null, { status: string; price: string; settled: boolean }>,
    now: number,
  ): LabQueueEntry {
    const patient = item.labOrder.visit.patient;
    const pay = payByItem.get(item.id) ?? null;
    return {
      itemId: item.id,
      orderId: item.labOrder.id,
      orderNo: item.labOrder.orderNo,
      visitId: item.labOrder.visitId,
      patientId: patient.id,
      patientName: [patient.prefix, patient.firstName, patient.lastName]
        .filter((part) => part != null && part.trim().length > 0)
        .join(' '),
      patientMrn: patient.mrn,
      testId: item.testId,
      code: item.test.code,
      testName: item.testNameAtTime,
      status: item.status,
      orderedAt: item.labOrder.orderedAt.toISOString(),
      waitedMinutes: Math.max(0, Math.floor((now - item.labOrder.orderedAt.getTime()) / 60_000)),
      invoiceStatus: pay?.status ?? null,
      // Paid = nothing outstanding on the invoice (a 0.00 bill owes nothing; a partial
      // payment still owes and reads unpaid). Same measure the collect endpoint enforces.
      paid: pay ? pay.settled : true,
      price: pay?.price ?? null,
    };
  }
}
