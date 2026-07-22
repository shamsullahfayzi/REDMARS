import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  Allergy,
  AllergyListResponse,
  RecordAllergyRequest,
  UpdateAllergyRequest,
} from '@redmars/shared';
import { ALLERGY_SEVERITY_RANK } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

export const allergySelect = {
  id: true,
  patientId: true,
  substance: true,
  drugId: true,
  reaction: true,
  severity: true,
  isActive: true,
  notedAt: true,
  notedBy: true,
  drug: { select: { genericName: true, brandName: true, strength: true } },
} as const;

export type AllergyRow = {
  id: string;
  patientId: string;
  substance: string;
  drugId: string | null;
  reaction: string | null;
  severity: Allergy['severity'];
  isActive: boolean;
  notedAt: Date;
  notedBy: string | null;
  drug: { genericName: string; brandName: string | null; strength: string | null } | null;
};

/**
 * Active first, then worst first, then newest.
 *
 * Exported because the consult context (task 4.1) sorts its banner list the same way, and
 * a banner that ordered allergies differently from the allergy screen is a banner people
 * learn to distrust.
 */
export function compareAllergies(a: AllergyRow, b: AllergyRow): number {
  if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
  const bySeverity = ALLERGY_SEVERITY_RANK[a.severity] - ALLERGY_SEVERITY_RANK[b.severity];
  if (bySeverity !== 0) return bySeverity;
  return b.notedAt.getTime() - a.notedAt.getTime();
}

export function toAllergy(row: AllergyRow, notedByName: string | null): Allergy {
  return {
    id: row.id,
    patientId: row.patientId,
    substance: row.substance,
    drugId: row.drugId,
    drugName: row.drug
      ? [row.drug.brandName ?? row.drug.genericName, row.drug.strength].filter(Boolean).join(' ')
      : null,
    reaction: row.reaction,
    severity: row.severity,
    isActive: row.isActive,
    notedAt: row.notedAt.toISOString(),
    notedBy: row.notedBy,
    notedByName,
  };
}

@Injectable()
export class AllergyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every allergy on the patient, RETRACTED ONES INCLUDED.
   *
   * A list that hid the retracted rows would look identical to a patient nobody has ever
   * asked, and "penicillin was on this chart until someone took it off" is exactly what a
   * doctor wants to know before prescribing penicillin.
   */
  async list(facilityId: string, patientId: string): Promise<AllergyListResponse> {
    await this.requirePatient(facilityId, patientId);

    const rows = await this.prisma.db.allergy.findMany({
      where: { patientId },
      select: allergySelect,
    });

    return { allergies: await this.withNames(rows.sort(compareAllergies)) };
  }

  async record(
    facilityId: string,
    userId: string,
    patientId: string,
    input: RecordAllergyRequest,
  ): Promise<Allergy> {
    await this.requirePatient(facilityId, patientId);
    await this.requireKnownDrug(facilityId, input.drugId);

    const created = await this.prisma.db.allergy.create({
      data: {
        patientId,
        substance: input.substance,
        drugId: input.drugId,
        reaction: input.reaction,
        severity: input.severity,
        notedBy: userId,
      },
      select: allergySelect,
    });

    return toAllergy(created, await this.nameOf(userId));
  }

  /**
   * Edit, or retract.
   *
   * NOT a delete, ever — R4, and here the reason is more than bookkeeping: an allergy that
   * vanishes leaves a chart that looks like nobody ever recorded one. Setting `isActive`
   * false keeps the row, drops it out of the banner, and leaves the audit trail naming who
   * decided it no longer applies.
   *
   * There is no separate permission for retracting. Whoever may record an allergy may take
   * one back, because the commonest retraction is by the person who mistyped it thirty
   * seconds earlier, and routing that through an administrator is how a wrong allergy stays
   * on a chart for a year.
   */
  async update(
    facilityId: string,
    userId: string,
    patientId: string,
    id: string,
    input: UpdateAllergyRequest,
  ): Promise<Allergy> {
    await this.requirePatient(facilityId, patientId);
    await this.requireKnownDrug(facilityId, input.drugId);

    const existing = await this.prisma.db.allergy.findFirst({
      where: { id, patientId },
      select: { id: true },
    });
    // Scoped to the patient in the URL, so an id from another chart is a 404 rather than
    // an edit landing somewhere nobody was looking.
    if (!existing) throw new NotFoundException('Allergy not found');

    const updated = await this.prisma.db.allergy.update({
      where: { id },
      data: {
        substance: input.substance,
        drugId: input.drugId,
        reaction: input.reaction,
        severity: input.severity,
        isActive: input.isActive,
      },
      select: allergySelect,
    });

    return toAllergy(updated, await this.nameOf(updated.notedBy));
  }

  private async withNames(rows: AllergyRow[]): Promise<Allergy[]> {
    const ids = [...new Set(rows.map((row) => row.notedBy).filter((id): id is string => !!id))];
    const users = await this.prisma.db.appUser.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });
    const names = new Map(users.map((user) => [user.id, user.fullName]));
    return rows.map((row) => toAllergy(row, row.notedBy ? (names.get(row.notedBy) ?? null) : null));
  }

  private async nameOf(userId: string | null): Promise<string | null> {
    if (!userId) return null;
    const user = await this.prisma.db.appUser.findUnique({
      where: { id: userId },
      select: { fullName: true },
    });
    return user?.fullName ?? null;
  }

  private async requirePatient(facilityId: string, patientId: string): Promise<void> {
    const patient = await this.prisma.db.patient.findFirst({
      where: { id: patientId, facilityId },
      select: { id: true },
    });
    // 404, not 403 — whether a patient exists in another facility is not this one's to learn.
    if (!patient) throw new NotFoundException('Patient not found');
  }

  private async requireKnownDrug(facilityId: string, drugId: string | null): Promise<void> {
    if (!drugId) return;
    const drug = await this.prisma.db.drug.findFirst({
      where: { id: drugId, facilityId },
      select: { id: true },
    });
    // A clean 400 rather than a foreign-key error as a 500. The substance is free text
    // regardless, so a drug that is not in the formulary is recorded by name alone.
    if (!drug) {
      throw new BadRequestException({ message: 'Unknown drug', code: 'unknown_drug' });
    }
  }
}
