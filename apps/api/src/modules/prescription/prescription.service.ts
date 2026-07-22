import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  Prescription,
  PrescriptionResponse,
  SavePrescriptionRequest,
  VisitStatus,
} from '@redmars/shared';
import { isVisitOpen } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

const prescriptionSelect = {
  id: true,
  visitId: true,
  status: true,
  advice: true,
  practitionerId: true,
  printedAt: true,
  createdAt: true,
  practitioner: { select: { firstName: true, lastName: true } },
  items: {
    select: {
      id: true,
      drugId: true,
      drugNameAtTime: true,
      dose: true,
      frequency: true,
      duration: true,
      route: true,
      quantity: true,
      instructions: true,
      sequence: true,
    },
    orderBy: { sequence: 'asc' },
  },
} as const;

type PrescriptionRow = {
  id: string;
  visitId: string;
  status: string;
  advice: string | null;
  practitionerId: string;
  printedAt: Date | null;
  createdAt: Date;
  practitioner: { firstName: string; lastName: string } | null;
  items: Array<{
    id: string;
    drugId: string;
    drugNameAtTime: string;
    dose: string | null;
    frequency: string;
    duration: string;
    route: string;
    quantity: number | null;
    instructions: string | null;
    sequence: number;
  }>;
};

@Injectable()
export class PrescriptionService {
  constructor(private readonly prisma: PrismaService) {}

  async find(facilityId: string, visitId: string): Promise<PrescriptionResponse> {
    await this.requireVisit(facilityId, visitId);
    const row = await this.prisma.db.prescription.findFirst({
      where: { visitId },
      select: prescriptionSelect,
      orderBy: { createdAt: 'asc' },
    });
    return { prescription: row ? this.toPrescription(row) : null };
  }

  /**
   * Save the whole sheet.
   *
   * A DIFF, not a replace. Rows the client sent with an id are updated, rows without one
   * are created, and stored rows the client did not send are deleted — so pressing F2
   * three times leaves three sensible audit entries rather than twenty-four. Every write
   * is a single-row operation, never createMany/deleteMany, because the audit extension
   * deliberately does not cover batch calls and an unaudited change to a drug order is the
   * exact thing the trail exists for.
   */
  async save(
    facilityId: string,
    userId: string,
    visitId: string,
    input: SavePrescriptionRequest,
  ): Promise<PrescriptionResponse> {
    const status = await this.requireVisit(facilityId, visitId);
    if (!isVisitOpen(status)) {
      throw new BadRequestException({
        message: 'This visit is closed. A prescription can only be written during the visit.',
        code: 'visit_closed',
      });
    }

    const existing = await this.prisma.db.prescription.findFirst({
      where: { visitId },
      select: { id: true, items: { select: { id: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // An empty list means "no prescription for this visit", not "an empty prescription".
    // A doctor who removes the last row and saves gets what they asked for.
    if (input.items.length === 0) {
      if (existing) {
        for (const item of existing.items) {
          await this.prisma.db.prescriptionItem.delete({ where: { id: item.id } });
        }
        await this.prisma.db.prescription.delete({ where: { id: existing.id } });
      }
      return { prescription: null };
    }

    // Names are snapshotted from the formulary here and never taken from the browser:
    // a 2026 prescription must still print what was actually prescribed if the drug is
    // renamed in 2028, and a client-supplied name would be a client-supplied medicine.
    const drugIds = [...new Set(input.items.map((item) => item.drugId))];
    const drugs = await this.prisma.db.drug.findMany({
      where: { id: { in: drugIds }, facilityId },
      select: { id: true, genericName: true, brandName: true, strength: true, isActive: true },
    });
    const byId = new Map(drugs.map((drug) => [drug.id, drug]));
    for (const drugId of drugIds) {
      const drug = byId.get(drugId);
      if (!drug) {
        throw new BadRequestException({ message: 'Unknown drug', code: 'unknown_drug' });
      }
      // A withdrawn drug stays on the prescriptions that already carry it; it does not get
      // to join a new one.
      if (!drug.isActive) {
        throw new BadRequestException({
          message: `${drug.genericName} is no longer in the formulary.`,
          code: 'inactive_drug',
        });
      }
    }

    const practitionerId = await this.practitionerIdOf(facilityId, userId);
    // Prescription.practitionerId is NOT NULL, and rightly so — an unsigned drug order is
    // not a thing. Saying this beats a foreign-key error.
    if (!practitionerId) {
      throw new BadRequestException({
        message: 'Your account is not linked to a practitioner, so it cannot sign a prescription.',
        code: 'no_practitioner',
      });
    }

    const prescriptionId =
      existing?.id ??
      (
        await this.prisma.db.prescription.create({
          data: { visitId, practitionerId, advice: input.advice },
          select: { id: true },
        })
      ).id;

    if (existing) {
      await this.prisma.db.prescription.update({
        where: { id: prescriptionId },
        data: { advice: input.advice },
      });
    }

    const keptIds = new Set<string>();
    for (const [index, item] of input.items.entries()) {
      const drug = byId.get(item.drugId)!;
      const data = {
        drugId: item.drugId,
        drugNameAtTime: [drug.brandName ?? drug.genericName, drug.strength]
          .filter(Boolean)
          .join(' '),
        dose: item.dose,
        frequency: item.frequency,
        duration: item.duration,
        route: item.route,
        quantity: item.quantity,
        instructions: item.instructions,
        // The order the doctor put them in, which is the order they will print in.
        sequence: index,
      };

      if (item.id) {
        const owned = existing?.items.some((row) => row.id === item.id) ?? false;
        // An id from another prescription is a 404, not an edit landing on someone else's
        // drug order.
        if (!owned) throw new NotFoundException('Prescription item not found');
        await this.prisma.db.prescriptionItem.update({ where: { id: item.id }, data });
        keptIds.add(item.id);
      } else {
        const created = await this.prisma.db.prescriptionItem.create({
          data: { ...data, prescriptionId },
          select: { id: true },
        });
        keptIds.add(created.id);
      }
    }

    for (const item of existing?.items ?? []) {
      if (!keptIds.has(item.id)) {
        await this.prisma.db.prescriptionItem.delete({ where: { id: item.id } });
      }
    }

    return this.find(facilityId, visitId);
  }

  private async requireVisit(facilityId: string, visitId: string): Promise<VisitStatus> {
    const visit = await this.prisma.db.visit.findFirst({
      where: { id: visitId, facilityId },
      select: { status: true },
    });
    // 404, not 403 — whether a visit exists in another facility is not this one's to learn.
    if (!visit) throw new NotFoundException('Visit not found');
    return visit.status;
  }

  private async practitionerIdOf(facilityId: string, userId: string): Promise<string | null> {
    const practitioner = await this.prisma.db.practitioner.findFirst({
      where: { facilityId, userId },
      select: { id: true },
    });
    return practitioner?.id ?? null;
  }

  private toPrescription(row: PrescriptionRow): Prescription {
    return {
      id: row.id,
      visitId: row.visitId,
      status: row.status,
      advice: row.advice,
      practitionerId: row.practitionerId,
      practitionerName: row.practitioner
        ? [row.practitioner.firstName, row.practitioner.lastName].filter(Boolean).join(' ')
        : null,
      printedAt: row.printedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      items: row.items,
    };
  }
}
