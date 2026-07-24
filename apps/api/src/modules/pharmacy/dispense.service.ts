import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DispenseResponse } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberSequenceService } from '../../services/number-sequence.service';

const ZERO = new Prisma.Decimal(0);

/**
 * Task 6.10 — dispensing, and the pharmacy bill.
 *
 * Dispensing a prescription does two things at once: it marks the sheet dispensed (which
 * takes it off the queue), and it raises a pharmacy-origin invoice for the drugs — the line
 * items are `prescription_item`, so the invoice reads as a pharmacy bill everywhere the
 * origin is shown (6.2). The prices are the formulary's, read here at the till; the browser
 * sends nothing but the instruction to dispense (guardrail 7). The patient then pays that
 * bill with the ordinary payment machinery (6.3), at the pharmacy till.
 */
@Injectable()
export class DispenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: NumberSequenceService,
  ) {}

  async dispense(
    facilityId: string,
    userId: string,
    prescriptionId: string,
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
            select: {
              id: true,
              drugNameAtTime: true,
              quantity: true,
              drug: { select: { sellPrice: true } },
            },
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

      // Price every line from the formulary. A drug with no price is a zero line — a
      // free-issue item, not a blocked one — and the quantity falls back to one when the
      // prescriber left it blank.
      const lines = prescription.items.map((item) => {
        const quantity = item.quantity ?? 1;
        const unitPrice = item.drug.sellPrice ?? ZERO;
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

      // Guarded mark-dispensed: only if it is still active and un-dispensed, so two benches
      // cannot both dispense (and double-bill) the same sheet. A lost race rolls the whole
      // transaction back — invoice number and all.
      const marked = await tx.prescription.updateMany({
        where: { id: prescriptionId, status: 'active', dispensedAt: null },
        data: { status: 'completed', dispensedAt: new Date(), dispensedBy: userId },
      });
      if (marked.count === 0) {
        throw new ConflictException({
          message: 'This prescription was just dispensed at another bench. Reload.',
          code: 'already_dispensed',
        });
      }

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
          // A priced bill is issued and settled at the till; a wholly free-issue sheet has
          // nothing to pay, so it is born paid.
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
}
