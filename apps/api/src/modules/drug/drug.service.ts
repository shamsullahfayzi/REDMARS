import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  createDrugRequestSchema,
  type CreateDrugRequest,
  type DrugListResponse,
  type DrugSummary,
  type ImportDrugsResponse,
  type ImportError,
  type SetActiveRequest,
  type UpdateDrugRequest,
} from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { parseCsv } from './csv';

const DRUG_SELECT = {
  id: true,
  code: true,
  genericName: true,
  brandName: true,
  atcCode: true,
  strength: true,
  form: true,
  isControlled: true,
  isActive: true,
} as const;

type DrugRow = {
  id: string;
  code: string;
  genericName: string;
  brandName: string | null;
  atcCode: string | null;
  strength: string | null;
  form: string | null;
  isControlled: boolean;
  isActive: boolean;
};

function toSummary(d: DrugRow): DrugSummary {
  return {
    id: d.id,
    code: d.code,
    genericName: d.genericName,
    brandName: d.brandName,
    atcCode: d.atcCode,
    strength: d.strength,
    form: d.form,
    isControlled: d.isControlled,
    isActive: d.isActive,
  };
}

// The columns the importer understands, mapped from lower-cased header names.
const HEADER_ALIASES: Record<string, keyof CreateDrugRequest> = {
  code: 'code',
  genericname: 'genericName',
  generic_name: 'genericName',
  brandname: 'brandName',
  brand_name: 'brandName',
  atccode: 'atcCode',
  atc_code: 'atcCode',
  strength: 'strength',
  form: 'form',
  iscontrolled: 'isControlled',
  is_controlled: 'isControlled',
  controlled: 'isControlled',
};

const TRUE_VALUES = new Set(['true', '1', 'yes', 'y']);

@Injectable()
export class DrugService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The formulary, optionally filtered by a search term across code, generic and
   * brand name. Case-insensitive `contains` — simple on purpose; a real full-text
   * index is a later refinement if the list grows past a few thousand.
   */
  async list(facilityId: string, q?: string): Promise<DrugListResponse> {
    const term = q?.trim();
    const drugs = await this.prisma.db.drug.findMany({
      where: {
        facilityId,
        ...(term
          ? {
              OR: [
                { code: { contains: term, mode: 'insensitive' } },
                { genericName: { contains: term, mode: 'insensitive' } },
                { brandName: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { genericName: 'asc' },
      select: DRUG_SELECT,
    });
    return { drugs: drugs.map(toSummary) };
  }

  async create(facilityId: string, input: CreateDrugRequest): Promise<DrugSummary> {
    const clash = await this.prisma.db.drug.findUnique({
      where: { facilityId_code: { facilityId, code: input.code } },
    });
    if (clash) {
      throw new ConflictException(`Drug code '${input.code}' already exists`);
    }

    const created = await this.prisma.db.drug.create({
      data: { facilityId, code: input.code, ...toFields(input) },
      select: DRUG_SELECT,
    });
    return toSummary(created);
  }

  async update(facilityId: string, id: string, input: UpdateDrugRequest): Promise<DrugSummary> {
    await this.assertDrugInFacility(facilityId, id);
    const updated = await this.prisma.db.drug.update({
      where: { id },
      data: toFields(input),
      select: DRUG_SELECT,
    });
    return toSummary(updated);
  }

  async setActive(facilityId: string, id: string, input: SetActiveRequest): Promise<DrugSummary> {
    await this.assertDrugInFacility(facilityId, id);
    const updated = await this.prisma.db.drug.update({
      where: { id },
      data: { isActive: input.isActive },
      select: DRUG_SELECT,
    });
    return toSummary(updated);
  }

  /**
   * Imports a pasted CSV. Re-runnable: each valid row upserts on (facility, code),
   * so importing the same file twice updates rather than duplicates. One bad row
   * never aborts the rest — it is skipped and reported with its line number, so the
   * admin can fix and re-paste (task 2.4 guardrail).
   */
  async importCsv(facilityId: string, csv: string): Promise<ImportDrugsResponse> {
    const rows = parseCsv(csv);
    const errors: ImportError[] = [];

    if (rows.length < 2) {
      return {
        imported: 0,
        skipped: 0,
        errors: [{ line: 1, message: 'Need a header row and at least one data row' }],
      };
    }

    // Map each known header to its column index. Header is line 1.
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const columns = new Map<keyof CreateDrugRequest, number>();
    header.forEach((name, index) => {
      const field = HEADER_ALIASES[name];
      if (field) columns.set(field, index);
    });

    if (!columns.has('code') || !columns.has('genericName')) {
      return {
        imported: 0,
        skipped: 0,
        errors: [{ line: 1, message: "CSV must have 'code' and 'genericName' columns" }],
      };
    }

    let imported = 0;
    let skipped = 0;

    for (let r = 1; r < rows.length; r++) {
      const line = r + 1; // 1-based, header is line 1
      const cells = rows[r];
      const cell = (field: keyof CreateDrugRequest): string =>
        (columns.has(field) ? (cells[columns.get(field)!] ?? '') : '').trim();

      const parsed = createDrugRequestSchema.safeParse({
        code: cell('code'),
        genericName: cell('genericName'),
        brandName: cell('brandName'),
        atcCode: cell('atcCode'),
        strength: cell('strength'),
        form: cell('form'),
        isControlled: TRUE_VALUES.has(cell('isControlled').toLowerCase()),
      });

      if (!parsed.success) {
        skipped++;
        errors.push({ line, message: parsed.error.issues[0]?.message ?? 'Invalid row' });
        continue;
      }

      try {
        const fields = toFields(parsed.data);
        // Find-then-write rather than upsert: upsert bypasses the audit extension,
        // and an imported formulary change must be attributable like any other. A
        // create and an update both audit; an upsert does not.
        const existing = await this.prisma.db.drug.findUnique({
          where: { facilityId_code: { facilityId, code: parsed.data.code } },
          select: { id: true },
        });
        if (existing) {
          await this.prisma.db.drug.update({ where: { id: existing.id }, data: fields });
        } else {
          await this.prisma.db.drug.create({
            data: { facilityId, code: parsed.data.code, ...fields },
          });
        }
        imported++;
      } catch {
        // A row that validated but failed to write (an unexpected DB error) is
        // reported like any other bad row rather than sinking the whole import.
        skipped++;
        errors.push({ line, message: 'Could not save this row' });
      }
    }

    return { imported, skipped, errors };
  }

  private async assertDrugInFacility(facilityId: string, id: string): Promise<void> {
    const drug = await this.prisma.db.drug.findFirst({
      where: { id, facilityId },
      select: { id: true },
    });
    if (!drug) {
      throw new NotFoundException('Drug not found');
    }
  }
}

/**
 * The writable fields common to create, update and import — code excluded, because
 * it is the stable key (set once at create, never updated). Optional fields are
 * stored as null when absent, so a re-import clears a value that was removed.
 */
function toFields(input: CreateDrugRequest | UpdateDrugRequest) {
  return {
    genericName: input.genericName,
    brandName: input.brandName ?? null,
    atcCode: input.atcCode ?? null,
    strength: input.strength ?? null,
    form: input.form ?? null,
    isControlled: input.isControlled,
  };
}
