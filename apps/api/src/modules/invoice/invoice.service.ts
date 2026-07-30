import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  InvoiceDetail,
  InvoiceListItem,
  InvoiceListQuery,
  InvoiceListResponse,
  InvoiceOrigin,
  VisitBill,
  VisitBillsResponse,
} from '@redmars/shared';
import { currentAgeYears } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { facilityDayBoundsFor } from '../../common/facility-time';

/** Money out, always to two places — the shape of Decimal(12,2). */
export function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

/** A patient's display name from its parts, skipping the blanks. */
export function fullName(parts: (string | null | undefined)[]): string {
  return parts.filter((p) => p != null && p.trim().length > 0).join(' ');
}

/**
 * Which till a bill belongs to, read off the ref types of its lines (task 6.2). The origin
 * is not stored — it is what the invoice is FOR. Pharmacy wins over lab wins over
 * reception when a bill somehow mixes them, though in practice each till raises its own.
 *
 * Exported: task 6b.7's collections list is the same derivation over a different filter of
 * invoices, and a second copy of "what makes a bill pharmacy vs lab" is exactly the kind of
 * drift the reference-band extraction (6b.6) already showed the cost of.
 */
export function originOf(refTypes: string[]): InvoiceOrigin {
  const kinds = new Set(refTypes);
  if (kinds.has('prescription_item')) return 'pharmacy';
  if (kinds.has('lab_order_item')) return 'lab';
  if (kinds.has('service') || kinds.has('card_registration')) return 'reception';
  return 'other';
}

/**
 * Task 6.1 — reading invoices back.
 *
 * The write side already exists (reception 3.6, lab 5.6); this is the read side those
 * slices always implied. `list` is the register the desk searches; `detail` is one bill in
 * full, shaped so the web can reprint the identical receipt the patient was handed.
 */
@Injectable()
export class InvoiceService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    facilityId: string,
    query: InvoiceListQuery,
    permissions: ReadonlyMap<string, string | null>,
  ): Promise<InvoiceListResponse> {
    const where: Prisma.InvoiceWhereInput = { facilityId };

    // R12 — a pharmacist's register excludes lab bills. Filtered in the WHERE, not after the
    // page comes back, so `total` and the page size stay honest for the rows they can see.
    if (permissions.get('invoice.list') === 'R12') {
      where.items = { none: { refType: 'lab_order_item' } };
    }

    if (query.patientId) where.patientId = query.patientId;
    if (query.status) where.status = query.status;
    if (query.date) {
      const { start, end } = facilityDayBoundsFor(query.date);
      where.createdAt = { gte: start, lt: end };
    }
    if (query.q) {
      // The slip carries a number, or the desk is handed a name — match either, plus MRN.
      where.OR = [
        { invoiceNo: { contains: query.q, mode: 'insensitive' } },
        { patient: { mrn: { contains: query.q, mode: 'insensitive' } } },
        { patient: { firstName: { contains: query.q, mode: 'insensitive' } } },
        { patient: { lastName: { contains: query.q, mode: 'insensitive' } } },
      ];
    }

    const [total, rows] = await this.prisma.db.$transaction([
      this.prisma.db.invoice.count({ where }),
      this.prisma.db.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
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
          items: { select: { description: true }, orderBy: { description: 'asc' } },
        },
      }),
    ]);

    const invoices: InvoiceListItem[] = rows.map((row) => ({
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
    }));

    return { invoices, total, page: query.page, limit: query.limit };
  }

  /**
   * `permissions` is only ever consulted for R12: everyone else who reaches this method
   * already cleared the guard on an unconditional grant. See DiscountService.assertWithin
   * Ceiling for the same "read the qualifier off the caller's own permission map" shape.
   */
  async detail(
    facilityId: string,
    invoiceId: string,
    permissions: ReadonlyMap<string, string | null>,
  ): Promise<InvoiceDetail> {
    const invoice = await this.prisma.db.invoice.findFirst({
      where: { id: invoiceId, facilityId },
      select: {
        id: true,
        invoiceNo: true,
        status: true,
        subtotal: true,
        discount: true,
        discountReason: true,
        total: true,
        paidAmount: true,
        currency: true,
        createdAt: true,
        createdBy: true,
        facility: {
          select: {
            name: true,
            nameLocalPrs: true,
            nameLocalPs: true,
            address: true,
            phone: true,
            email: true,
          },
        },
        patient: {
          select: {
            id: true,
            mrn: true,
            prefix: true,
            firstName: true,
            lastName: true,
            gender: true,
            dateOfBirth: true,
            estimatedAgeYears: true,
            estimatedAgeMonths: true,
            estimatedAgeDays: true,
            ageRecordedAt: true,
            phone: true,
            address: true,
          },
        },
        visit: {
          select: {
            id: true,
            visitNo: true,
            type: true,
            status: true,
            startedAt: true,
            department: { select: { name: true } },
            practitioner: { select: { firstName: true, lastName: true } },
          },
        },
        items: {
          select: {
            id: true,
            description: true,
            quantity: true,
            unitPrice: true,
            total: true,
            refType: true,
            refId: true,
            isPaid: true,
          },
        },
        payments: {
          orderBy: { receivedAt: 'asc' },
          select: {
            id: true,
            amount: true,
            method: true,
            reference: true,
            receiptNo: true,
            receivedAt: true,
            isReversed: true,
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const origin = originOf(invoice.items.map((item) => item.refType));
    // R12 — a pharmacist's invoice.read excludes a lab bill.
    if (permissions.get('invoice.read') === 'R12' && origin === 'lab') {
      throw new ForbiddenException("A lab order's own bill is not this permission's to read.");
    }

    const creator = invoice.createdBy
      ? await this.prisma.db.appUser.findUnique({
          where: { id: invoice.createdBy },
          select: { fullName: true },
        })
      : null;

    // How it was settled, for the receipt's "PAYMENT BY …" line: the last real payment.
    const live = invoice.payments.filter((p) => !p.isReversed);
    const lastPayment = live.at(-1) ?? null;

    return {
      facility: invoice.facility,
      patient: {
        id: invoice.patient.id,
        mrn: invoice.patient.mrn,
        name: fullName([
          invoice.patient.prefix,
          invoice.patient.firstName,
          invoice.patient.lastName,
        ]),
        gender: invoice.patient.gender,
        // currentAgeYears reads the same string shape the wire uses; the stored Dates are
        // rendered to YYYY-MM-DD / ISO first so the estimate ages forward correctly.
        ageYears: currentAgeYears({
          dateOfBirth: invoice.patient.dateOfBirth
            ? invoice.patient.dateOfBirth.toISOString().slice(0, 10)
            : null,
          estimatedAgeYears: invoice.patient.estimatedAgeYears,
          estimatedAgeMonths: invoice.patient.estimatedAgeMonths,
          ageRecordedAt: invoice.patient.ageRecordedAt
            ? invoice.patient.ageRecordedAt.toISOString()
            : null,
        }),
        phone: invoice.patient.phone,
        address: invoice.patient.address,
        // A reprint is never a registration, so it never announces a new patient.
        isNew: false,
      },
      visit: invoice.visit
        ? {
            id: invoice.visit.id,
            visitNo: invoice.visit.visitNo,
            type: invoice.visit.type,
            status: invoice.visit.status,
            departmentName: invoice.visit.department.name,
            practitionerName: invoice.visit.practitioner
              ? fullName([
                  invoice.visit.practitioner.firstName,
                  invoice.visit.practitioner.lastName,
                ])
              : null,
            startedAt: invoice.visit.startedAt.toISOString(),
          }
        : null,
      invoice: {
        id: invoice.id,
        invoiceNo: invoice.invoiceNo,
        status: invoice.status,
        subtotal: money(invoice.subtotal),
        discount: money(invoice.discount),
        discountReason: invoice.discountReason,
        total: money(invoice.total),
        paidAmount: money(invoice.paidAmount),
        currency: invoice.currency,
        origin,
        items: invoice.items.map((item) => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: money(item.unitPrice),
          total: money(item.total),
          refType: item.refType,
          refId: item.refId,
          isPaid: item.isPaid,
        })),
        paymentMethod: lastPayment?.method ?? null,
        paidAt: lastPayment?.receivedAt.toISOString() ?? null,
      },
      createdAt: invoice.createdAt.toISOString(),
      createdByName: creator?.fullName ?? null,
      // The whole trail, reversed rows included, so the desk can see a refunded payment and
      // the negative row that gave the money back — the refund UI (6.6) needs both.
      payments: invoice.payments.map((p) => ({
        id: p.id,
        amount: money(p.amount),
        method: p.method,
        reference: p.reference,
        receiptNo: p.receiptNo,
        receivedAt: p.receivedAt.toISOString(),
        isReversed: p.isReversed,
      })),
    };
  }

  /**
   * Task 6.2 — every bill a single visit carries, across the three tills.
   *
   * One visit gathers separate invoices — consult and card at reception, tests at the lab,
   * medicines at the pharmacy — each its own bill settled at its own window. This gives the
   * desk all of them at once with a running total: charged, paid and still open. Same
   * `invoice.read` gate as the register; the pharmacist holds it and reads their own line.
   */
  async byVisit(
    facilityId: string,
    visitId: string,
    permissions: ReadonlyMap<string, string | null>,
  ): Promise<VisitBillsResponse> {
    const visit = await this.prisma.db.visit.findFirst({
      where: { id: visitId, facilityId },
      select: {
        id: true,
        visitNo: true,
        patient: { select: { id: true, mrn: true, prefix: true, firstName: true, lastName: true } },
      },
    });
    if (!visit) throw new NotFoundException('Visit not found');

    // R12 — same exclusion as the register: a pharmacist's view of a visit's bills omits
    // its lab one, so the running total below is theirs to see, not the whole visit's.
    const where: Prisma.InvoiceWhereInput = { facilityId, visitId };
    if (permissions.get('invoice.read') === 'R12') {
      where.items = { none: { refType: 'lab_order_item' } };
    }

    const rows = await this.prisma.db.invoice.findMany({
      where,
      orderBy: { createdAt: 'asc' },
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

    let billed = new Prisma.Decimal(0);
    let paid = new Prisma.Decimal(0);

    const bills: VisitBill[] = rows.map((row) => {
      billed = billed.plus(row.total);
      paid = paid.plus(row.paidAmount);
      const owed = Prisma.Decimal.max(0, row.total.minus(row.paidAmount));
      return {
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
        outstanding: money(owed),
      };
    });

    return {
      visit: {
        id: visit.id,
        visitNo: visit.visitNo,
        patientId: visit.patient.id,
        patientName: fullName([
          visit.patient.prefix,
          visit.patient.firstName,
          visit.patient.lastName,
        ]),
        patientMrn: visit.patient.mrn,
      },
      bills,
      totals: {
        billed: money(billed),
        paid: money(paid),
        outstanding: money(Prisma.Decimal.max(0, billed.minus(paid))),
        currency: rows[0]?.currency ?? 'AFN',
      },
    };
  }
}
