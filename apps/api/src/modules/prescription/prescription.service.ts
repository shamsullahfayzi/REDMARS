import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AllergyConflict,
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
      allergyOverrideReason: true,
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
    allergyOverrideReason: string | null;
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
    const visit = await this.requireVisit(facilityId, visitId);
    if (!isVisitOpen(visit.status)) {
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

    // Task 4.8 — the hard block. Computed BEFORE anything is written, and it refuses the
    // whole save rather than the offending lines: a partial prescription is a worse
    // outcome than none, because the doctor would be looking at a sheet that is missing a
    // drug they believe they prescribed.
    const conflicts = await this.allergyConflicts(visit.patientId, input.items, byId);
    const unresolved = conflicts.filter((conflict) => !conflict.overridden);
    if (unresolved.length > 0) {
      throw new ConflictException({
        code: 'allergy_conflict',
        message: 'This patient is recorded as allergic to a drug on this prescription.',
        // Listed explicitly rather than by spreading minus a key: `overridden` is internal
        // bookkeeping and must not leak into a response the browser parses.
        conflicts: unresolved.map((conflict) => ({
          drugId: conflict.drugId,
          drugName: conflict.drugName,
          allergyId: conflict.allergyId,
          substance: conflict.substance,
          severity: conflict.severity,
          reaction: conflict.reaction,
          matchedOn: conflict.matchedOn,
        })),
      });
    }
    const overriddenDrugIds = new Set(conflicts.map((conflict) => conflict.drugId));

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
        // Kept only where there was actually something to override. A reason attached to a
        // drug nobody was warned about is noise that makes the real ones harder to find —
        // and on this column, the real ones are the whole point.
        allergyOverrideReason: overriddenDrugIds.has(item.drugId)
          ? item.allergyOverrideReason
          : null,
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

  /**
   * Task 4.8 — does anything on this sheet collide with a recorded allergy?
   *
   * Two ways to match, and the KIND travels back so the doctor can weigh it:
   *
   *  - `drug`: the allergy names this exact formulary drug. Certain.
   *  - `name`: the substance and the drug's name contain one another, case-insensitively.
   *    "Penicillin" catches "Benzylpenicillin 600mg". Strong, but it is string matching.
   *
   * WHAT THIS DOES NOT DO is class cross-reactivity: an allergy recorded as "Penicillin"
   * does not block amoxicillin. Nothing in the data relates them — Drug.atcCode exists but
   * Allergy has no ATC, and inferring a drug class from free text is guesswork that either
   * misses quietly or blocks wrongly. Blocking wrongly is the worse failure: an override
   * clicked through fifty times a day is not a safety feature, it is a speed bump that
   * teaches doctors to dismiss warnings. Task 4.6's banner is on screen throughout and
   * says "Penicillin — severe" regardless; this is the second net, not the only one.
   *
   * Retracted allergies do not block. That is what retracting is for.
   */
  private async allergyConflicts(
    patientId: string,
    items: SavePrescriptionRequest['items'],
    drugs: Map<string, { genericName: string; brandName: string | null; strength: string | null }>,
  ): Promise<Array<AllergyConflict & { overridden: boolean }>> {
    const allergies = await this.prisma.db.allergy.findMany({
      where: { patientId, isActive: true },
      select: {
        id: true,
        drugId: true,
        substance: true,
        severity: true,
        reaction: true,
      },
    });
    if (allergies.length === 0) return [];

    const found: Array<AllergyConflict & { overridden: boolean }> = [];

    for (const item of items) {
      const drug = drugs.get(item.drugId);
      if (!drug) continue;
      const names = [drug.genericName, drug.brandName]
        .filter((name): name is string => !!name)
        .map((name) => name.toLowerCase());

      for (const allergy of allergies) {
        const substance = allergy.substance.trim().toLowerCase();
        let matchedOn: AllergyConflict['matchedOn'] | null = null;

        if (allergy.drugId && allergy.drugId === item.drugId) {
          matchedOn = 'drug';
        } else if (
          substance.length >= 3 &&
          // Both directions: the allergy may be broader than the drug name
          // ("Penicillin" vs "Benzylpenicillin") or narrower ("Amoxicillin trihydrate"
          // recorded against a drug called "Amoxicillin"). A two-character substance is
          // not matched at all — "K" would collide with half the formulary.
          names.some((name) => name.includes(substance) || substance.includes(name))
        ) {
          matchedOn = 'name';
        }

        if (!matchedOn) continue;

        found.push({
          drugId: item.drugId,
          drugName: [drug.brandName ?? drug.genericName, drug.strength].filter(Boolean).join(' '),
          allergyId: allergy.id,
          substance: allergy.substance,
          severity: allergy.severity,
          reaction: allergy.reaction,
          matchedOn,
          overridden: item.allergyOverrideReason !== null,
        });
      }
    }

    return found;
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
