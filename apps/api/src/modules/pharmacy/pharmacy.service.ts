import { Injectable } from '@nestjs/common';
import type { PharmacyQueueItem, PharmacyQueueResponse } from '@redmars/shared';
import { currentAgeYears } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

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
}
