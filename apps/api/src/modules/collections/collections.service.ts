import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CollectionsListResponse, VisitBill } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { fullName, money, originOf } from '../invoice/invoice.service';

/**
 * Task 6b.7 — the collections worklist.
 *
 * Reception raises its own bill and knows it is unpaid; the lab (5.6) and pharmacy each
 * raise theirs at their own counter, out of reception's sight, and the only way to find one
 * before this was to already know which patient to open. This lists every invoice still
 * owing money whose lines came from the lab or the pharmacy — the two tills reception cannot
 * watch directly — newest first, so a bill that just landed sits at the top.
 *
 * Same `invoice.read` gate as the register (6.1): nothing here a receptionist, pharmacist,
 * admin or manager could not already find by opening the patient and looking. This just
 * saves them the trip.
 */
@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(facilityId: string): Promise<CollectionsListResponse> {
    const rows = await this.prisma.db.invoice.findMany({
      where: {
        facilityId,
        status: { in: ['issued', 'partially_paid'] },
        items: { some: { refType: { in: ['lab_order_item', 'prescription_item'] } } },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        invoiceNo: true,
        status: true,
        total: true,
        paidAmount: true,
        currency: true,
        createdAt: true,
        patient: {
          select: { id: true, mrn: true, prefix: true, firstName: true, lastName: true },
        },
        visit: { select: { visitNo: true } },
        items: { select: { description: true, refType: true }, orderBy: { description: 'asc' } },
      },
    });

    const bills: VisitBill[] = rows
      .map((row) => ({
        id: row.id,
        invoiceNo: row.invoiceNo,
        status: row.status,
        patientId: row.patient.id,
        patientName: fullName([row.patient.prefix, row.patient.firstName, row.patient.lastName]),
        patientMrn: row.patient.mrn,
        visitNo: row.visit?.visitNo ?? null,
        summary: row.items[0]?.description ?? '',
        itemCount: row.items.length,
        total: money(row.total),
        paidAmount: money(row.paidAmount),
        currency: row.currency,
        createdAt: row.createdAt.toISOString(),
        origin: originOf(row.items.map((item) => item.refType)),
        outstanding: money(Prisma.Decimal.max(0, row.total.minus(row.paidAmount))),
      }))
      // A mixed bill's origin can still resolve to 'reception' or 'other' (originOf's
      // pharmacy-then-lab priority) even though the `some` filter above matched it on a lab
      // or pharmacy line — keep the list honestly scoped to what it claims to be.
      .filter((bill) => bill.origin === 'lab' || bill.origin === 'pharmacy');

    return { bills };
  }
}
