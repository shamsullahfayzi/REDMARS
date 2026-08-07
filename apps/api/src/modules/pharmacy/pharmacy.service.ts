import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  PharmacyAllergy,
  PharmacyBill,
  PharmacyPrescription,
  PharmacyPrescriptionSearchResponse,
  PharmacyQueueItem,
  PharmacyQueueResponse,
} from '@redmars/shared';
import { ALLERGY_SEVERITY_RANK, currentAgeYears } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { money } from '../invoice/invoice.service';

/** A display name from its parts, skipping the blanks. */
function fullName(parts: (string | null | undefined)[]): string {
  return parts.filter((p) => p != null && p.trim().length > 0).join(' ');
}

/** The drugs at a glance: the first two names, and how many more there are. */
function summarise(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

/**
 * Task 6.8 — the pharmacy queue.
 *
 * The doctor's active orders, facility-scoped through the visit, oldest first — a FIFO
 * bench queue. A prescription leaves this list when it is dispensed (6.10) or its visit is
 * cancelled; until then it waits here for the pharmacist.
 */
@Injectable()
export class PharmacyService {
  constructor(private readonly prisma: PrismaService) {}

  async queue(facilityId: string): Promise<PharmacyQueueResponse> {
    const rows = await this.prisma.db.prescription.findMany({
      where: { status: 'active', visit: { facilityId, status: { not: 'cancelled' } } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        createdAt: true,
        practitioner: { select: { firstName: true, lastName: true } },
        visit: {
          select: {
            id: true,
            visitNo: true,
            patient: {
              select: {
                id: true,
                mrn: true,
                prefix: true,
                firstName: true,
                lastName: true,
                dateOfBirth: true,
                estimatedAgeYears: true,
                estimatedAgeMonths: true,
                ageRecordedAt: true,
              },
            },
          },
        },
        items: { select: { drugNameAtTime: true }, orderBy: { sequence: 'asc' } },
      },
    });

    const items: PharmacyQueueItem[] = rows.map((row) => {
      const patient = row.visit.patient;
      return {
        prescriptionId: row.id,
        visitId: row.visit.id,
        visitNo: row.visit.visitNo,
        patientId: patient.id,
        patientName: fullName([patient.prefix, patient.firstName, patient.lastName]),
        patientMrn: patient.mrn,
        // currentAgeYears reads the wire string shape; render the stored Dates first so the
        // estimate ages forward correctly (same mapping the invoice detail uses).
        ageYears: currentAgeYears({
          dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.toISOString().slice(0, 10) : null,
          estimatedAgeYears: patient.estimatedAgeYears,
          estimatedAgeMonths: patient.estimatedAgeMonths,
          ageRecordedAt: patient.ageRecordedAt ? patient.ageRecordedAt.toISOString() : null,
        }),
        practitionerName: fullName([row.practitioner.firstName, row.practitioner.lastName]),
        orderedAt: row.createdAt.toISOString(),
        itemCount: row.items.length,
        summary: summarise(row.items.map((item) => item.drugNameAtTime)),
      };
    });

    return { items, total: items.length };
  }

  /**
   * The pharmacist's own finder — a prescription by the patient's MRN, name or phone, not
   * a browse of the whole register. Every status is searchable (not just `active`): a
   * patient who paid and left with a dispensed sheet may come back for a return, or reception
   * may need to reprint that bill, and neither is on the active queue any more. Newest
   * first, capped, so a common name does not scroll forever.
   */
  async search(facilityId: string, q: string): Promise<PharmacyPrescriptionSearchResponse> {
    const rows = await this.prisma.db.prescription.findMany({
      where: {
        visit: {
          facilityId,
          patient: {
            OR: [
              { mrn: { contains: q, mode: 'insensitive' } },
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q.replace(/\s+/g, ''), mode: 'insensitive' } },
            ],
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        status: true,
        createdAt: true,
        practitioner: { select: { firstName: true, lastName: true } },
        visit: {
          select: {
            id: true,
            visitNo: true,
            patient: {
              select: {
                id: true,
                mrn: true,
                prefix: true,
                firstName: true,
                lastName: true,
                dateOfBirth: true,
                estimatedAgeYears: true,
                estimatedAgeMonths: true,
                ageRecordedAt: true,
              },
            },
          },
        },
        items: { select: { drugNameAtTime: true }, orderBy: { sequence: 'asc' } },
      },
    });

    const items: PharmacyQueueItem[] = rows.map((row) => {
      const patient = row.visit.patient;
      return {
        prescriptionId: row.id,
        visitId: row.visit.id,
        visitNo: row.visit.visitNo,
        patientId: patient.id,
        patientName: fullName([patient.prefix, patient.firstName, patient.lastName]),
        patientMrn: patient.mrn,
        ageYears: currentAgeYears({
          dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.toISOString().slice(0, 10) : null,
          estimatedAgeYears: patient.estimatedAgeYears,
          estimatedAgeMonths: patient.estimatedAgeMonths,
          ageRecordedAt: patient.ageRecordedAt ? patient.ageRecordedAt.toISOString() : null,
        }),
        practitionerName: fullName([row.practitioner.firstName, row.practitioner.lastName]),
        orderedAt: row.createdAt.toISOString(),
        itemCount: row.items.length,
        summary: summarise(row.items.map((item) => item.drugNameAtTime)),
        status: row.status,
      };
    });

    return { items };
  }

  /**
   * Task 6.9 — one prescription, as R6 allows the pharmacy to see it: the drugs and the
   * patient's allergies, and nothing else clinical. The query selects ONLY those fields —
   * no diagnosis, complaint, note or vital is read here, so none can be returned. The two
   * safety reasons that ARE dispensing-relevant travel with it: the per-line allergy
   * override, and the per-sheet serious-interaction acknowledgement.
   */
  async prescription(facilityId: string, prescriptionId: string): Promise<PharmacyPrescription> {
    const row = await this.prisma.db.prescription.findFirst({
      where: { id: prescriptionId, visit: { facilityId } },
      select: {
        id: true,
        status: true,
        advice: true,
        interactionAckReason: true,
        createdAt: true,
        practitioner: { select: { firstName: true, lastName: true } },
        visit: {
          select: {
            visitNo: true,
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
                ageRecordedAt: true,
              },
            },
          },
        },
        items: {
          orderBy: { sequence: 'asc' },
          select: {
            id: true,
            drugNameAtTime: true,
            dose: true,
            frequency: true,
            duration: true,
            route: true,
            quantity: true,
            instructions: true,
            allergyOverrideReason: true,
            drug: { select: { sellPrice: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Prescription not found');

    const patient = row.visit.patient;

    // Has this been billed yet, and is that bill settled? The one lookup `confirmHandover`
    // and `returnMedicine` both already use to find a sheet's own invoice.
    const billedItem = await this.prisma.db.invoiceItem.findFirst({
      where: {
        refType: 'prescription_item',
        refId: { in: row.items.map((item) => item.id) },
      },
      select: {
        invoice: {
          select: {
            id: true,
            invoiceNo: true,
            total: true,
            paidAmount: true,
            currency: true,
            status: true,
          },
        },
      },
    });
    const bill: PharmacyBill | null = billedItem
      ? {
          invoiceId: billedItem.invoice.id,
          invoiceNo: billedItem.invoice.invoiceNo,
          total: money(billedItem.invoice.total),
          paidAmount: money(billedItem.invoice.paidAmount),
          outstanding: money(
            Prisma.Decimal.max(0, billedItem.invoice.total.minus(billedItem.invoice.paidAmount)),
          ),
          currency: billedItem.invoice.currency,
          isPaid:
            billedItem.invoice.status === 'paid' ||
            billedItem.invoice.paidAmount.greaterThanOrEqualTo(billedItem.invoice.total),
        }
      : null;

    // The patient's allergies — the other half of what R6 grants. Read separately, active
    // and worst first, retracted ones last but shown (a doctor removed them for a reason).
    const allergyRows = await this.prisma.db.allergy.findMany({
      where: { patientId: patient.id },
      select: {
        id: true,
        substance: true,
        reaction: true,
        severity: true,
        isActive: true,
        notedAt: true,
        drug: { select: { genericName: true } },
      },
    });
    const allergies: PharmacyAllergy[] = allergyRows
      .map((a) => ({
        id: a.id,
        substance: a.substance,
        drugName: a.drug?.genericName ?? null,
        reaction: a.reaction,
        severity: a.severity,
        isActive: a.isActive,
        notedAt: a.notedAt.toISOString(),
      }))
      .sort(
        (x, y) =>
          Number(y.isActive) - Number(x.isActive) ||
          ALLERGY_SEVERITY_RANK[y.severity] - ALLERGY_SEVERITY_RANK[x.severity],
      );

    return {
      prescriptionId: row.id,
      visitNo: row.visit.visitNo,
      orderedAt: row.createdAt.toISOString(),
      status: row.status,
      patient: {
        id: patient.id,
        name: fullName([patient.prefix, patient.firstName, patient.lastName]),
        mrn: patient.mrn,
        gender: patient.gender,
        ageYears: currentAgeYears({
          dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.toISOString().slice(0, 10) : null,
          estimatedAgeYears: patient.estimatedAgeYears,
          estimatedAgeMonths: patient.estimatedAgeMonths,
          ageRecordedAt: patient.ageRecordedAt ? patient.ageRecordedAt.toISOString() : null,
        }),
      },
      practitionerName: fullName([row.practitioner.firstName, row.practitioner.lastName]),
      advice: row.advice,
      interactionAckReason: row.interactionAckReason,
      items: row.items.map((item) => ({
        id: item.id,
        drugName: item.drugNameAtTime,
        dose: item.dose,
        frequency: item.frequency,
        duration: item.duration,
        route: item.route,
        quantity: item.quantity,
        instructions: item.instructions,
        allergyOverrideReason: item.allergyOverrideReason,
        suggestedUnitPrice: item.drug.sellPrice != null ? money(item.drug.sellPrice) : null,
      })),
      allergies,
      bill,
    };
  }
}
