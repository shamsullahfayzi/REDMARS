import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CheckInRequest,
  CheckInResponse,
  InvoiceSummary,
  PatientSummary,
  VisitSummary,
} from '@redmars/shared';
import { DISCOUNT_CEILING_PCT } from '@redmars/shared';
import { PrismaService, type AuditedTx } from '../../prisma/prisma.service';
import { NumberSequenceService } from '../../services/number-sequence.service';
import { PatientService } from '../patient/patient.service';
import { VisitService } from '../visit/visit.service';

/**
 * What an invoice line points at. The column is a plain string because the same table
 * carries lab items and prescription items later; at reception every line is a priced
 * catalog entry.
 */
const REF_TYPE_SERVICE = 'service';

const ZERO = new Prisma.Decimal(0);

/** Money in, money out, always to two places — the shape of Decimal(12,2). */
function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

@Injectable()
export class ReceptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: NumberSequenceService,
    private readonly patients: PatientService,
    private readonly visits: VisitService,
  ) {}

  /**
   * Task 3.6 — register, admit to the queue, bill and take the money, as ONE act.
   *
   * The whole thing runs in a single transaction. Every intermediate state is wrong: a
   * visit with no invoice is a patient who will be seen for free by accident, an invoice
   * with no payment is money the till says it has and does not, and a patient with
   * neither is a stranger created by a failure. So either the desk's save happened or it
   * did not, and the receptionist finds out which before the patient walks away.
   *
   * The patient and visit halves are delegated rather than reimplemented — the duplicate
   * guard (3.3), the age anchor (3.1), the department and practitioner checks and the
   * open-visit guard (3.5) all still apply, because this calls the same code the
   * single-purpose screens call.
   */
  async checkIn(
    facilityId: string,
    userId: string,
    permissions: ReadonlyMap<string, string | null>,
    input: CheckInRequest,
  ): Promise<CheckInResponse> {
    const discount = new Prisma.Decimal(input.discount);
    if (discount.greaterThan(ZERO)) {
      this.assertMayDiscount(permissions);
      if (!input.discountReason?.trim()) {
        throw new BadRequestException('A discount needs a reason.');
      }
    }

    // Priced OUTSIDE the transaction and re-read inside it below? No — priced here, from
    // the catalog, and the numbers the client sent are never consulted. The request
    // carries a serviceId and a quantity and nothing else about money: a price that
    // travelled through the browser is a price anyone with devtools sets to 1.
    const services = await this.loadServices(facilityId, input.items);

    return this.prisma.db.$transaction(
      async (tx) => {
        // 1. Who. Either a patient the desk found, or one it is creating right now.
        const patient = await this.resolvePatient(facilityId, userId, input, tx);

        // 2. Why they are here. Same guards as the standalone visit screen.
        const visit: VisitSummary = await this.visits.create(
          facilityId,
          userId,
          {
            patientId: patient.id,
            type: input.visit.type,
            departmentId: input.visit.departmentId,
            practitionerId: input.visit.practitionerId ?? null,
            chiefComplaint: input.visit.chiefComplaint ?? null,
            referredBy: input.visit.referredBy ?? null,
            referralSource: input.visit.referralSource ?? null,
            acknowledgeOpenVisit: input.acknowledgeOpenVisit,
          },
          tx,
        );

        // 3. What it costs.
        const lines = input.items.map((item) => {
          const service = services.get(item.serviceId)!;
          const lineTotal = service.fee.mul(item.quantity);
          return {
            refType: REF_TYPE_SERVICE,
            refId: service.id,
            description: service.name,
            quantity: item.quantity,
            unitPrice: service.fee,
            discount: ZERO,
            total: lineTotal,
          };
        });

        const subtotal = lines.reduce((sum, line) => sum.add(line.total), ZERO);
        if (discount.greaterThan(subtotal)) {
          throw new BadRequestException('The discount is more than the bill.');
        }
        this.assertWithinCeiling(permissions, subtotal, discount);
        const total = subtotal.sub(discount);

        const invoiceNo = await this.sequence.next(facilityId, 'invoice_no', undefined, tx);

        const invoice = await tx.invoice.create({
          data: {
            facilityId,
            patientId: patient.id,
            visitId: visit.id,
            createdBy: userId,
            invoiceNo: invoiceNo.formatted,
            subtotal,
            discount,
            discountReason: discount.greaterThan(ZERO) ? (input.discountReason ?? null) : null,
            total,
            // Farhat settles at the window, so the bill is born paid. A facility that
            // lets a patient owe money would set `issued` here and reconcile later —
            // the column already allows it, this desk does not.
            paidAmount: total,
            status: 'paid',
            items: { create: lines },
          },
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
            items: {
              select: {
                id: true,
                description: true,
                quantity: true,
                unitPrice: true,
                total: true,
              },
            },
          },
        });

        // 4. The cash. Skipped at zero: a waived visit is settled by having nothing to
        // pay, and a payment row of 0.00 would only make the day's takings harder to read.
        let paidAt: Date | null = null;
        if (total.greaterThan(ZERO)) {
          const payment = await tx.payment.create({
            data: {
              invoiceId: invoice.id,
              amount: total,
              method: input.paymentMethod,
              reference: input.paymentReference ?? null,
              receivedBy: userId,
            },
            select: { receivedAt: true },
          });
          paidAt = payment.receivedAt;
        }

        return {
          patient: {
            id: patient.id,
            mrn: patient.mrn,
            name: [patient.prefix, patient.firstName, patient.lastName]
              .filter((part) => part != null && part.trim().length > 0)
              .join(' '),
            gender: patient.gender,
            phone: patient.phone,
            isNew: input.patient != null,
          },
          visit: {
            id: visit.id,
            visitNo: visit.visitNo,
            type: visit.type,
            status: visit.status,
            departmentName: visit.departmentName,
            practitionerName: visit.practitionerName,
            startedAt: visit.startedAt,
          },
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
            items: invoice.items.map((item) => ({
              id: item.id,
              description: item.description,
              quantity: item.quantity,
              unitPrice: money(item.unitPrice),
              total: money(item.total),
            })),
            paymentMethod: total.greaterThan(ZERO) ? input.paymentMethod : null,
            paidAt: paidAt?.toISOString() ?? null,
          } satisfies InvoiceSummary,
        };
      },
      {
        // Prisma's defaults are 5s to run and 2s to wait for a connection, and both are
        // too tight here BY DESIGN: the sequence issuer now holds its row lock until this
        // transaction commits, so a second desk checking in at the same moment queues
        // behind the first rather than racing it. Queuing is the correct behaviour and
        // must not be mistaken for a failure — a receptionist told "try again" while the
        // patient stands there is how a hospital learns to distrust the software.
        timeout: 20_000,
        maxWait: 15_000,
      },
    );
  }

  /**
   * The returning patient, or the new one. A patient id from another facility is a 404
   * from the same rule every other patient read follows — whether a record exists
   * elsewhere is not something this facility gets to learn.
   */
  private async resolvePatient(
    facilityId: string,
    userId: string,
    input: CheckInRequest,
    tx: AuditedTx,
  ): Promise<PatientSummary> {
    if (input.patient) {
      return this.patients.create(
        facilityId,
        userId,
        { ...input.patient, acknowledgeDuplicate: input.acknowledgeDuplicate },
        tx,
      );
    }

    // findById reads through the audited client rather than the transaction, which is
    // correct: this patient was written by an earlier request, not by this one.
    return this.patients.findById(facilityId, input.patientId!);
  }

  /**
   * Fees come from the catalog, keyed by id. Every requested service must exist in THIS
   * facility and be active — a deactivated price is a price the hospital withdrew, and
   * honouring it because someone still had the id in a stale tab is how a fee list stops
   * meaning anything.
   */
  private async loadServices(facilityId: string, items: CheckInRequest['items']) {
    const ids = [...new Set(items.map((item) => item.serviceId))];
    if (ids.length !== items.length) {
      // Two lines for the same service would double-charge silently; the desk means a
      // quantity of two, and should say so.
      throw new BadRequestException('A service is listed twice. Use the quantity instead.');
    }

    const rows = await this.prisma.db.service.findMany({
      where: { id: { in: ids }, facilityId, isActive: true },
      select: { id: true, name: true, fee: true },
    });

    if (rows.length !== ids.length) {
      throw new BadRequestException('One of those services is unknown or no longer offered.');
    }
    return new Map(rows.map((row) => [row.id, row]));
  }

  /**
   * R10, finally enforced. The permission map carries each grant's condition — null for
   * unconditional, a rule code for a qualified one — exactly so a handler can do this;
   * PermissionsGuard cannot, because the ceiling is a percentage of a total the guard
   * has never seen.
   */
  private assertMayDiscount(permissions: ReadonlyMap<string, string | null>): void {
    if (!permissions.has('discount.apply')) {
      throw new ForbiddenException('Missing permission: discount.apply');
    }
  }

  private assertWithinCeiling(
    permissions: ReadonlyMap<string, string | null>,
    subtotal: Prisma.Decimal,
    discount: Prisma.Decimal,
  ): void {
    if (discount.lessThanOrEqualTo(ZERO)) return;

    // An unconditional grant, or the authority to approve past the threshold, means no
    // ceiling. Anything else is R10's 10%.
    const condition = permissions.get('discount.apply');
    const uncapped = condition === null || permissions.has('discount.approve_over_threshold');
    if (uncapped) return;

    const ceiling = subtotal.mul(DISCOUNT_CEILING_PCT).div(100);
    if (discount.greaterThan(ceiling)) {
      throw new ForbiddenException(
        `A discount over ${DISCOUNT_CEILING_PCT}% needs approval (maximum ${money(ceiling)}).`,
      );
    }
  }
}
