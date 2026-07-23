import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  LabChargesQuery,
  LabChargesResponse,
  PayLabChargesRequest,
  PayLabChargesResponse,
} from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Reception's lab settlement — the desk seeing a patient's lab charges and collecting for
 * them ONE TEST AT A TIME.
 *
 * This is the counterpart to ordering (5.1) that the billing decision always implied: a lab
 * order raises its own unpaid invoice with each test its own line, and a patient told to run
 * four tests may pay for only one. So the desk reads the lines, takes cash for the ones the
 * patient chooses, and marks THOSE lines paid — which frees exactly those tests for the bench
 * to draw while the rest stay waiting. Prices are the snapshot on the line, never sent by the
 * browser; the amount taken is the server's own sum.
 */

const LAB_REF_TYPE = 'lab_order_item';
const ZERO = new Prisma.Decimal(0);

@Injectable()
export class LabBillingService {
  constructor(private readonly prisma: PrismaService) {}

  async charges(facilityId: string, query: LabChargesQuery): Promise<LabChargesResponse> {
    const patient = await this.prisma.db.patient.findFirst({
      where: { id: query.patientId, facilityId },
      select: { id: true, mrn: true, prefix: true, firstName: true, lastName: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    // The lab invoice lines for this patient — each keyed back to a lab order item by refId.
    const lines = await this.prisma.db.invoiceItem.findMany({
      where: { refType: LAB_REF_TYPE, invoice: { facilityId, patientId: patient.id } },
      select: {
        refId: true,
        unitPrice: true,
        isPaid: true,
        invoice: { select: { id: true, invoiceNo: true } },
      },
    });

    const itemIds = lines.map((line) => line.refId).filter((id): id is string => id != null);
    // The order-side facts the line does not carry — the test, its status, its order.
    const items = itemIds.length
      ? await this.prisma.db.labOrderItem.findMany({
          where: { id: { in: itemIds } },
          select: {
            id: true,
            status: true,
            testNameAtTime: true,
            test: { select: { code: true } },
            labOrder: {
              select: { id: true, orderNo: true, visitId: true, orderedAt: true },
            },
          },
        })
      : [];
    const itemById = new Map(items.map((item) => [item.id, item]));

    // Group by order — one order = one invoice, and the desk collects per order's worth of
    // lines even though it ticks them individually.
    interface Group {
      orderId: string;
      orderNo: string;
      invoiceId: string;
      invoiceNo: string;
      visitId: string;
      orderedAt: Date;
      items: LabChargesResponse['orders'][number]['items'];
      outstanding: Prisma.Decimal;
    }
    const groups = new Map<string, Group>();
    for (const line of lines) {
      if (!line.refId) continue;
      const item = itemById.get(line.refId);
      if (!item || !item.labOrder) continue;
      // A cancelled test is not a charge the desk collects.
      if (item.status === 'cancelled') continue;

      let group = groups.get(item.labOrder.id);
      if (!group) {
        group = {
          orderId: item.labOrder.id,
          orderNo: item.labOrder.orderNo,
          invoiceId: line.invoice.id,
          invoiceNo: line.invoice.invoiceNo,
          visitId: item.labOrder.visitId,
          orderedAt: item.labOrder.orderedAt,
          items: [],
          outstanding: ZERO,
        };
        groups.set(item.labOrder.id, group);
      }
      group.items.push({
        itemId: item.id,
        testId: item.id, // the line references the order item; testId kept for the UI key
        code: item.test.code,
        testName: item.testNameAtTime,
        price: line.unitPrice.toFixed(2),
        isPaid: line.isPaid,
        status: item.status,
      });
      if (!line.isPaid) group.outstanding = group.outstanding.add(line.unitPrice);
    }

    const orders = [...groups.values()]
      .filter((group) => query.includePaid || group.outstanding.greaterThan(ZERO))
      .sort((a, b) => a.orderedAt.getTime() - b.orderedAt.getTime())
      .map((group) => ({
        orderId: group.orderId,
        orderNo: group.orderNo,
        invoiceId: group.invoiceId,
        invoiceNo: group.invoiceNo,
        visitId: group.visitId,
        orderedAt: group.orderedAt.toISOString(),
        items: group.items,
        outstanding: group.outstanding.toFixed(2),
      }));

    return {
      patientId: patient.id,
      patientName: [patient.prefix, patient.firstName, patient.lastName]
        .filter((part) => part != null && part.trim().length > 0)
        .join(' '),
      patientMrn: patient.mrn,
      orders,
    };
  }

  async pay(
    facilityId: string,
    userId: string,
    input: PayLabChargesRequest,
  ): Promise<PayLabChargesResponse> {
    const itemIds = [...new Set(input.itemIds)];

    const lines = await this.prisma.db.invoiceItem.findMany({
      where: { refType: LAB_REF_TYPE, refId: { in: itemIds }, invoice: { facilityId } },
      select: { id: true, refId: true, total: true, isPaid: true, invoiceId: true },
    });
    if (lines.length !== itemIds.length) {
      throw new BadRequestException({
        message: 'One of those charges is not on this facility’s lab orders.',
        code: 'unknown_charge',
      });
    }
    const alreadyPaid = lines.filter((line) => line.isPaid);
    if (alreadyPaid.length > 0) {
      throw new BadRequestException({
        message: 'One of those tests is already paid.',
        code: 'already_paid',
      });
    }

    // Sum the cash per invoice — a patient may be settling lines across more than one order.
    const amountByInvoice = new Map<string, Prisma.Decimal>();
    for (const line of lines) {
      amountByInvoice.set(
        line.invoiceId,
        (amountByInvoice.get(line.invoiceId) ?? ZERO).add(line.total),
      );
    }
    const total = lines.reduce((sum, line) => sum.add(line.total), ZERO);
    const now = new Date();
    const method = input.method;

    await this.prisma.db.$transaction(async (tx) => {
      // Re-check unpaid inside the transaction so two windows cannot both take the same cash.
      const stillUnpaid = await tx.invoiceItem.count({
        where: { refType: LAB_REF_TYPE, refId: { in: itemIds }, isPaid: false },
      });
      if (stillUnpaid !== itemIds.length) {
        throw new BadRequestException({
          message: 'One of those tests was just paid at another window. Reload.',
          code: 'already_paid',
        });
      }

      for (const line of lines) {
        await tx.invoiceItem.update({
          where: { id: line.id },
          data: { isPaid: true, paidAt: now },
        });
      }

      for (const [invoiceId, amount] of amountByInvoice) {
        const invoice = await tx.invoice.findUniqueOrThrow({
          where: { id: invoiceId },
          select: { total: true, paidAmount: true },
        });
        const paidAmount = invoice.paidAmount.add(amount);
        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            paidAmount,
            status: paidAmount.greaterThanOrEqualTo(invoice.total) ? 'paid' : 'partially_paid',
          },
        });
        // The cash trail — one payment per invoice touched, summing the lines settled on it.
        await tx.payment.create({
          data: {
            invoiceId,
            amount,
            method,
            reference: input.reference ?? null,
            receivedBy: userId,
          },
        });
      }
    });

    return { paidItemIds: itemIds, amount: total.toFixed(2) };
  }
}
