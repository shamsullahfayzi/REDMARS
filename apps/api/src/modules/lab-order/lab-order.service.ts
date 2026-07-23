import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { LabOrder, LabOrderResponse, SaveLabOrderRequest, VisitStatus } from '@redmars/shared';
import { isVisitOpen } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuditedTx } from '../../prisma/prisma.service';
import { NumberSequenceService } from '../../services/number-sequence.service';

/**
 * Phase 5, first slice — the doctor's lab order, hung off the visit like the prescription.
 *
 * ORDERING RAISES A BILL. The decision that shaped this: the tests a doctor orders here
 * become priced lines the reception collects against before the sample is taken (Farhat
 * pays at the window). So a save writes two things at once — the clinical order, and its
 * invoice — and it does so in one transaction, because an order the lab can see with no
 * bill to pay, or a bill for tests no lab knows about, is a worse state than the save
 * simply not having happened.
 *
 * ITS OWN INVOICE, not the consultation's. The consult fee was settled at registration and
 * that receipt must not move under anyone, so the lab charges are a separate document —
 * born unpaid, and settled one line at a time, because a patient told to run four tests may
 * choose to pay for only one. Each ordered test is therefore its own invoice line, keyed
 * back to the order item, so reception can pay or cancel them individually downstream.
 *
 * A DIFF, not a replace — same as the prescription. Re-saving reconciles the order against
 * what is already there rather than making a second one, so the F2 that saves the rest of
 * the consult can save this too without multiplying orders. A test already past `ordered`
 * (its sample taken, its result in) is never removed by an edit — the lab's state machine
 * has moved on and a doctor's re-save is not allowed to wind it back.
 */

/** The invoice line's `refType` for a lab charge — see InvoiceItem in the schema. */
const LAB_REF_TYPE = 'lab_order_item';

const ZERO = new Prisma.Decimal(0);

/** Money out, always to two places — the shape of Decimal(12,2). */
function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

@Injectable()
export class LabOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: NumberSequenceService,
  ) {}

  async find(facilityId: string, visitId: string): Promise<LabOrderResponse> {
    await this.requireVisit(facilityId, visitId);
    return { order: await this.loadOrder(facilityId, visitId) };
  }

  /**
   * Save the whole order.
   *
   * The tests the doctor sent are the order. Ones already on it stay, ones removed and still
   * only `ordered` go, ones new arrive — and the invoice follows the same three moves so the
   * bill never lists a test the order does not, or omits one it does.
   */
  async save(
    facilityId: string,
    userId: string,
    visitId: string,
    input: SaveLabOrderRequest,
  ): Promise<LabOrderResponse> {
    const visit = await this.requireVisit(facilityId, visitId);
    if (!isVisitOpen(visit.status)) {
      throw new BadRequestException({
        message: 'This visit is closed. Lab tests can only be ordered during the visit.',
        code: 'visit_closed',
      });
    }

    const testIds = input.testIds;
    if (new Set(testIds).size !== testIds.length) {
      // The same test twice is not a quantity the lab can act on — running CBC "twice" is
      // one order. The doctor meant to add it once.
      throw new BadRequestException({ message: 'A test is listed twice.', code: 'test_repeated' });
    }

    // Prices come from the catalog, never the browser, and are read here so the snapshot
    // written onto the invoice is the price on the day it was ordered. A withdrawn test is
    // not orderable — honouring an id from a stale tab is how a price list stops meaning
    // anything (guardrail 7).
    const tests = testIds.length
      ? await this.prisma.db.labTest.findMany({
          where: { id: { in: testIds }, facilityId, isActive: true },
          select: { id: true, code: true, name: true, price: true },
        })
      : [];
    if (tests.length !== testIds.length) {
      throw new BadRequestException({
        message: 'One of those tests is unknown or no longer offered.',
        code: 'unknown_test',
      });
    }
    const testById = new Map(tests.map((test) => [test.id, test]));
    const priceByTest = new Map(tests.map((test) => [test.id, test.price ?? null]));

    const practitionerId = await this.practitionerIdOf(facilityId, userId);

    await this.prisma.db.$transaction(async (tx) => {
      let order = await tx.labOrder.findFirst({
        where: { visitId },
        orderBy: { orderedAt: 'asc' },
        select: { id: true, items: { select: { id: true, testId: true, status: true } } },
      });

      // Nothing asked for and nothing on file — no order to write.
      if (testIds.length === 0 && !order) return;

      if (!order) {
        const orderNo = await this.sequence.next(facilityId, 'lab_order_no', undefined, tx);
        order = await tx.labOrder.create({
          data: {
            visitId,
            practitionerId,
            orderNo: orderNo.formatted,
            clinicalNote: input.clinicalNote ?? null,
          },
          select: { id: true, items: { select: { id: true, testId: true, status: true } } },
        });
      } else {
        await tx.labOrder.update({
          where: { id: order.id },
          data: { clinicalNote: input.clinicalNote ?? null },
        });
      }

      const requested = new Set(testIds);
      // A test already on the order in ANY live state — so a re-save does not add a second
      // line for a test whose sample has already been taken.
      const present = new Set(
        order.items.filter((item) => item.status !== 'cancelled').map((item) => item.testId),
      );

      // Remove: only tests still merely `ordered`. Nothing further along is a doctor's to
      // undo with an edit.
      for (const item of order.items) {
        if (item.status === 'ordered' && !requested.has(item.testId)) {
          await tx.labOrderItem.delete({ where: { id: item.id } });
        }
      }

      // Add: requested tests not already on the order. testNameAtTime is snapshotted so a
      // test renamed later still prints on this order as it was written.
      for (const testId of testIds) {
        if (present.has(testId)) continue;
        const test = testById.get(testId)!;
        await tx.labOrderItem.create({
          data: {
            labOrderId: order.id,
            testId,
            testNameAtTime: test.name,
            status: 'ordered',
          },
        });
      }

      await this.syncInvoice(
        tx,
        facilityId,
        visit.patientId,
        visitId,
        userId,
        order.id,
        priceByTest,
      );

      // An order emptied to nothing is not an order. Deleting it keeps "no tests" and "no
      // order" the same state, the way an emptied prescription is removed rather than kept
      // as a blank one.
      const remaining = await tx.labOrderItem.count({ where: { labOrderId: order.id } });
      if (remaining === 0) {
        await tx.labOrder.delete({ where: { id: order.id } });
      }
    });

    return { order: await this.loadOrder(facilityId, visitId) };
  }

  /**
   * Reconcile the lab invoice against the order's current items.
   *
   * The invoice mirrors the order's non-cancelled items one-to-one: a line is added for an
   * item that has none, a line whose item is gone is removed, and the total is re-summed.
   * An order with no billable items has no invoice at all — it is deleted rather than left
   * as a zero receipt nobody will pay.
   */
  private async syncInvoice(
    tx: AuditedTx,
    facilityId: string,
    patientId: string,
    visitId: string,
    userId: string,
    orderId: string,
    priceByTest: Map<string, Prisma.Decimal | null>,
  ): Promise<void> {
    const items = await tx.labOrderItem.findMany({
      where: { labOrderId: orderId, status: { not: 'cancelled' } },
      select: { id: true, testId: true, testNameAtTime: true },
    });
    const wanted = new Set(items.map((item) => item.id));

    // The lab invoice is the visit's invoice that carries lab lines — distinct from the
    // consultation's, which never does. Found by that, so it survives item churn.
    let invoice = await tx.invoice.findFirst({
      where: { visitId, items: { some: { refType: LAB_REF_TYPE } } },
      select: {
        id: true,
        items: {
          where: { refType: LAB_REF_TYPE },
          select: { id: true, refId: true },
        },
      },
    });

    const haveRefs = new Set((invoice?.items ?? []).map((line) => line.refId));

    // Drop lines whose order item was removed.
    for (const line of invoice?.items ?? []) {
      if (!line.refId || !wanted.has(line.refId)) {
        await tx.invoiceItem.delete({ where: { id: line.id } });
      }
    }

    // Add a line for every item that has none yet, at the price snapshotted on the order day.
    const toAdd = items.filter((item) => !haveRefs.has(item.id));
    if (toAdd.length > 0) {
      let invoiceId = invoice?.id;
      if (!invoiceId) {
        const invoiceNo = await this.sequence.next(facilityId, 'invoice_no', undefined, tx);
        const created = await tx.invoice.create({
          data: {
            facilityId,
            patientId,
            visitId,
            createdBy: userId,
            invoiceNo: invoiceNo.formatted,
            // Born unpaid: the desk collects against it, and until it does the money is not
            // in the till and the invoice must not claim it is.
            status: 'issued',
          },
          select: { id: true },
        });
        invoiceId = created.id;
        invoice = { id: invoiceId, items: [] };
      }
      for (const item of toAdd) {
        const price = priceByTest.get(item.testId) ?? ZERO;
        await tx.invoiceItem.create({
          data: {
            invoiceId,
            refType: LAB_REF_TYPE,
            refId: item.id,
            description: item.testNameAtTime,
            quantity: 1,
            unitPrice: price,
            discount: ZERO,
            total: price,
          },
        });
      }
    }

    if (!invoice) return;

    const lines = await tx.invoiceItem.findMany({
      where: { invoiceId: invoice.id },
      select: { total: true },
    });
    if (lines.length === 0) {
      await tx.invoice.delete({ where: { id: invoice.id } });
      return;
    }

    const subtotal = lines.reduce((sum, line) => sum.add(line.total), ZERO);
    const current = await tx.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      select: { discount: true, paidAmount: true },
    });
    const total = subtotal.sub(current.discount);
    const paid = current.paidAmount;
    const status =
      total.greaterThan(ZERO) && paid.greaterThanOrEqualTo(total)
        ? 'paid'
        : paid.greaterThan(ZERO)
          ? 'partially_paid'
          : 'issued';
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { subtotal, total, status },
    });
  }

  /** The visit's order, with each item's snapshot price and the bill it raised. */
  private async loadOrder(facilityId: string, visitId: string): Promise<LabOrder | null> {
    const order = await this.prisma.db.labOrder.findFirst({
      where: { visitId, visit: { facilityId } },
      orderBy: { orderedAt: 'asc' },
      select: {
        id: true,
        visitId: true,
        orderNo: true,
        clinicalNote: true,
        orderedAt: true,
        practitioner: { select: { firstName: true, lastName: true } },
        items: {
          where: { status: { not: 'cancelled' } },
          // No sequence column on a lab item, so order by the snapshot name — a stable,
          // readable order rather than the accident of insertion.
          orderBy: { testNameAtTime: 'asc' },
          select: {
            id: true,
            testId: true,
            testNameAtTime: true,
            status: true,
            test: { select: { code: true } },
          },
        },
      },
    });
    if (!order) return null;

    const itemIds = order.items.map((item) => item.id);
    const lines = itemIds.length
      ? await this.prisma.db.invoiceItem.findMany({
          where: { refType: LAB_REF_TYPE, refId: { in: itemIds } },
          select: { refId: true, unitPrice: true, invoiceId: true },
        })
      : [];
    const priceByItem = new Map(lines.map((line) => [line.refId, line.unitPrice]));

    const invoiceId = lines[0]?.invoiceId ?? null;
    let invoice: LabOrder['invoice'] = null;
    if (invoiceId) {
      const row = await this.prisma.db.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          id: true,
          invoiceNo: true,
          status: true,
          subtotal: true,
          total: true,
          paidAmount: true,
          currency: true,
        },
      });
      if (row) {
        invoice = {
          id: row.id,
          invoiceNo: row.invoiceNo,
          status: row.status,
          subtotal: money(row.subtotal),
          total: money(row.total),
          paidAmount: money(row.paidAmount),
          currency: row.currency,
        };
      }
    }

    return {
      id: order.id,
      visitId: order.visitId,
      orderNo: order.orderNo,
      clinicalNote: order.clinicalNote,
      practitionerName: order.practitioner
        ? [order.practitioner.firstName, order.practitioner.lastName].filter(Boolean).join(' ')
        : null,
      orderedAt: order.orderedAt.toISOString(),
      items: order.items.map((item) => ({
        id: item.id,
        testId: item.testId,
        code: item.test.code,
        name: item.testNameAtTime,
        status: item.status,
        price: priceByItem.get(item.id)?.toFixed(2) ?? null,
      })),
      invoice,
    };
  }

  private async requireVisit(
    facilityId: string,
    visitId: string,
  ): Promise<{ status: VisitStatus; patientId: string }> {
    const visit = await this.prisma.db.visit.findFirst({
      where: { id: visitId, facilityId },
      select: { status: true, patientId: true },
    });
    // 404, not 403 — whether a visit exists in another facility is not this one's to learn.
    if (!visit) throw new NotFoundException('Visit not found');
    return visit;
  }

  private async practitionerIdOf(facilityId: string, userId: string): Promise<string | null> {
    const practitioner = await this.prisma.db.practitioner.findFirst({
      where: { facilityId, userId },
      select: { id: true },
    });
    return practitioner?.id ?? null;
  }
}
