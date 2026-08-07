import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  BillPrescriptionRequest,
  ConfirmHandoverResponse,
  DispenseResponse,
  ReturnMedicineRequest,
  ReturnMedicineResponse,
} from '@redmars/shared';
import { facilityDayBounds } from '../../common/facility-time';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberSequenceService } from '../../services/number-sequence.service';

const ZERO = new Prisma.Decimal(0);

/**
 * Task 6.10 — dispensing, and the pharmacy bill. Two steps, not one.
 *
 * BILLING (`bill`) and the actual HANDOVER (`confirmHandover`) used to be a single action —
 * click once, the sheet is marked dispensed AND the invoice raised, before a single afghani
 * had moved. That let medicine leave the building on the strength of a click, with the bill
 * settled (or not) as an afterthought. Now: `bill` takes the price the pharmacist typed for
 * every line — the formulary's `Drug.sellPrice` is only ever a suggested starting figure the
 * prescription screen pre-fills (many drugs have none at all, which used to mean a silent
 * 0.00 bill with no way to fix it) — and raises a pharmacy-origin invoice from those typed
 * prices. The line items are `prescription_item`, so it reads as a pharmacy bill everywhere
 * the origin is shown (6.2) and lands in Collections (6b.7) like any other unpaid till, for
 * RECEPTION to collect — the pharmacy counter has no payment form of its own. Only once that
 * invoice is fully paid does `confirmHandover` become reachable, and only then does the
 * prescription leave the queue. What the server never trusts is which prescription is being
 * billed, whether it was billed already, or whether the priced set of items matches the sheet
 * — that much stays guardrail 7; the actual afghani figures are the pharmacist's to type.
 */
@Injectable()
export class DispenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: NumberSequenceService,
  ) {}

  /** Step one — price the sheet at what the pharmacist typed and raise its bill. Does not
   *  touch the prescription's status. */
  async bill(
    facilityId: string,
    userId: string,
    prescriptionId: string,
    input: BillPrescriptionRequest,
  ): Promise<DispenseResponse> {
    const result = await this.prisma.db.$transaction(async (tx) => {
      const prescription = await tx.prescription.findFirst({
        where: { id: prescriptionId, visit: { facilityId } },
        select: {
          id: true,
          status: true,
          dispensedAt: true,
          visit: { select: { id: true, patientId: true } },
          items: {
            orderBy: { sequence: 'asc' },
            select: { id: true, drugNameAtTime: true, quantity: true },
          },
        },
      });
      if (!prescription) throw new NotFoundException('Prescription not found');
      if (prescription.status !== 'active' || prescription.dispensedAt !== null) {
        throw new BadRequestException({
          message: 'This prescription has already been dispensed.',
          code: 'already_dispensed',
        });
      }
      if (prescription.items.length === 0) {
        throw new BadRequestException({
          message: 'There is nothing to dispense on this prescription.',
          code: 'nothing_to_dispense',
        });
      }

      // Already billed? Same lookup `returnMedicine` uses to find a sheet's own invoice —
      // one bill per prescription, checked before raising a second.
      const alreadyBilled = await tx.invoiceItem.findFirst({
        where: {
          refType: 'prescription_item',
          refId: { in: prescription.items.map((item) => item.id) },
        },
        select: { id: true },
      });
      if (alreadyBilled) {
        throw new ConflictException({
          message: 'This prescription was just billed at another bench. Reload.',
          code: 'already_billed',
        });
      }

      // The priced set the pharmacist sent must be exactly the sheet's own items — not a
      // subset, not an extra line smuggled in from somewhere else.
      const priceByItemId = new Map(input.items.map((line) => [line.itemId, line.unitPrice]));
      const sheetItemIds = new Set(prescription.items.map((item) => item.id));
      const pricedMatchesSheet =
        priceByItemId.size === sheetItemIds.size &&
        [...sheetItemIds].every((id) => priceByItemId.has(id));
      if (!pricedMatchesSheet) {
        throw new BadRequestException({
          message: 'Every drug on this sheet needs a price, and only those drugs.',
          code: 'price_mismatch',
        });
      }

      // Priced at what the pharmacist typed, not the formulary — quantity falls back to one
      // when the prescriber left it blank.
      const lines = prescription.items.map((item) => {
        const quantity = item.quantity ?? 1;
        const unitPrice = new Prisma.Decimal(priceByItemId.get(item.id)!);
        return {
          refType: 'prescription_item',
          refId: item.id,
          description: item.drugNameAtTime,
          quantity,
          unitPrice,
          total: unitPrice.mul(quantity),
        };
      });
      const subtotal = lines.reduce((sum, line) => sum.add(line.total), ZERO);

      const invoiceNo = await this.sequence.next(facilityId, 'invoice_no', undefined, tx);
      const invoice = await tx.invoice.create({
        data: {
          facilityId,
          patientId: prescription.visit.patientId,
          visitId: prescription.visit.id,
          createdBy: userId,
          invoiceNo: invoiceNo.formatted,
          subtotal,
          total: subtotal,
          // A wholly free-issue sheet has nothing to pay, so it is born paid — the handover
          // gate below reads exactly this field, so a free sheet is never stuck behind a
          // payment that was never owed.
          paidAmount: ZERO,
          status: subtotal.greaterThan(ZERO) ? 'issued' : 'paid',
          items: { create: lines },
        },
        select: {
          id: true,
          invoiceNo: true,
          subtotal: true,
          total: true,
          paidAmount: true,
          currency: true,
          status: true,
          items: {
            orderBy: { description: 'asc' },
            select: { description: true, quantity: true, unitPrice: true, total: true },
          },
        },
      });

      return invoice;
    });

    const outstanding = Prisma.Decimal.max(0, result.total.minus(result.paidAmount));
    return {
      prescriptionId,
      invoiceId: result.id,
      invoiceNo: result.invoiceNo,
      subtotal: result.subtotal.toFixed(2),
      total: result.total.toFixed(2),
      paidAmount: result.paidAmount.toFixed(2),
      outstanding: outstanding.toFixed(2),
      currency: result.currency,
      status: result.status,
      items: result.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        total: item.total.toFixed(2),
      })),
    };
  }

  /**
   * Step two — the actual handover, reachable only once `bill`'s invoice is fully paid. This
   * is the check that used to not exist: medicine left the building the moment `dispense`
   * was clicked, paid or not. Re-checked here against the invoice itself, never trusting
   * whatever the screen that offered the button believed.
   */
  async confirmHandover(
    facilityId: string,
    userId: string,
    prescriptionId: string,
  ): Promise<ConfirmHandoverResponse> {
    const prescription = await this.prisma.db.prescription.findFirst({
      where: { id: prescriptionId, visit: { facilityId } },
      select: {
        id: true,
        status: true,
        dispensedAt: true,
        items: { select: { id: true } },
      },
    });
    if (!prescription) throw new NotFoundException('Prescription not found');
    if (prescription.status !== 'active' || prescription.dispensedAt !== null) {
      throw new BadRequestException({
        message: 'This prescription has already been handed over.',
        code: 'already_dispensed',
      });
    }

    const itemIds = prescription.items.map((item) => item.id);
    const billedItem = await this.prisma.db.invoiceItem.findFirst({
      where: { refType: 'prescription_item', refId: { in: itemIds } },
      select: { invoice: { select: { total: true, paidAmount: true, status: true } } },
    });
    if (!billedItem) {
      throw new BadRequestException({
        message: 'This prescription has not been billed yet.',
        code: 'not_billed',
      });
    }
    const fullyPaid =
      billedItem.invoice.status === 'paid' ||
      billedItem.invoice.paidAmount.greaterThanOrEqualTo(billedItem.invoice.total);
    if (!fullyPaid) {
      throw new ForbiddenException({
        message: 'The bill for this prescription is not fully paid yet.',
        code: 'not_paid',
      });
    }

    // Guarded mark-dispensed: only if it is still active and un-dispensed, so two benches
    // cannot both complete the same handover.
    const now = new Date();
    const marked = await this.prisma.db.prescription.updateMany({
      where: { id: prescriptionId, status: 'active', dispensedAt: null },
      data: { status: 'completed', dispensedAt: now, dispensedBy: userId },
    });
    if (marked.count === 0) {
      throw new ConflictException({
        message: 'This prescription was just handed over at another bench. Reload.',
        code: 'already_dispensed',
      });
    }

    return { prescriptionId, status: 'completed', dispensedAt: now.toISOString() };
  }

  /**
   * Task 6.11 — a medicine return, Rule R5. An unopened box comes back and the money goes
   * back: the pharmacy bill is cancelled and every payment on it reversed the append-only way
   * (the original marked, a negative row appended with its own receipt), exactly as a refund
   * does it (6.6). R5 is same-day and the pharmacist's alone — the window is measured from
   * when the medicine was DISPENSED, not from now. No stock is tracked in v1, so the return
   * is the financial reversal plus the cancelled bill; the box coming back is a physical act
   * the cancelled bill records.
   */
  async returnMedicine(
    facilityId: string,
    userId: string,
    prescriptionId: string,
    input: ReturnMedicineRequest,
  ): Promise<ReturnMedicineResponse> {
    const result = await this.prisma.db.$transaction(async (tx) => {
      const prescription = await tx.prescription.findFirst({
        where: { id: prescriptionId, visit: { facilityId } },
        select: { id: true, status: true, dispensedAt: true, items: { select: { id: true } } },
      });
      if (!prescription) throw new NotFoundException('Prescription not found');
      if (prescription.status !== 'completed' || prescription.dispensedAt === null) {
        throw new BadRequestException({
          message: 'This prescription has not been dispensed, so there is nothing to return.',
          code: 'not_dispensed',
        });
      }

      // R5's same-day window, measured from the dispense.
      const { start, end } = facilityDayBounds();
      const dispensedToday =
        prescription.dispensedAt.getTime() >= start.getTime() &&
        prescription.dispensedAt.getTime() < end.getTime();
      if (!dispensedToday) {
        throw new ForbiddenException({
          message: 'Only medicine dispensed today can be returned here.',
          code: 'outside_r5_window',
        });
      }

      // The bill dispensing raised — the invoice these prescription lines were billed on.
      const itemIds = prescription.items.map((item) => item.id);
      const billedItem = await tx.invoiceItem.findFirst({
        where: { refType: 'prescription_item', refId: { in: itemIds } },
        select: { invoiceId: true },
      });
      if (!billedItem) {
        throw new BadRequestException({
          message: 'No pharmacy bill was found for this prescription.',
          code: 'no_bill',
        });
      }
      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id: billedItem.invoiceId },
        select: {
          id: true,
          invoiceNo: true,
          status: true,
          currency: true,
          payments: {
            where: { isReversed: false },
            select: { id: true, amount: true, method: true },
          },
        },
      });
      if (invoice.status === 'cancelled') {
        throw new BadRequestException({
          message: 'This medicine has already been returned.',
          code: 'already_returned',
        });
      }

      // Guarded cancel: only if not already cancelled, so two benches cannot both return.
      const cancelled = await tx.invoice.updateMany({
        where: { id: invoice.id, status: { not: 'cancelled' } },
        data: { status: 'cancelled', paidAmount: ZERO },
      });
      if (cancelled.count === 0) {
        throw new ConflictException({
          message: 'This medicine was just returned at another bench. Reload.',
          code: 'already_returned',
        });
      }

      // Reverse every live payment — the money going back out, each its own row and receipt.
      let refunded = ZERO;
      let receiptNo: string | null = null;
      let refundedAt = new Date();
      for (const payment of invoice.payments) {
        await tx.payment.update({ where: { id: payment.id }, data: { isReversed: true } });
        const receipt = await this.sequence.next(facilityId, 'receipt_no', undefined, tx);
        const row = await tx.payment.create({
          data: {
            invoiceId: invoice.id,
            amount: payment.amount.negated(),
            method: payment.method,
            reference: input.reason.slice(0, 120),
            receiptNo: receipt.formatted,
            receivedBy: userId,
          },
          select: { receivedAt: true },
        });
        refunded = refunded.add(payment.amount);
        receiptNo = receipt.formatted;
        refundedAt = row.receivedAt;
      }

      return { invoice, refunded, receiptNo, refundedAt };
    });

    return {
      prescriptionId,
      invoiceId: result.invoice.id,
      invoiceNo: result.invoice.invoiceNo,
      refundedAmount: result.refunded.toFixed(2),
      refundReceiptNo: result.receiptNo,
      refundedAt: result.refundedAt.toISOString(),
      reason: input.reason,
      currency: result.invoice.currency,
      status: 'cancelled',
    };
  }
}
