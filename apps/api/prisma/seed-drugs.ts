import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { drugFieldsSchema } from '@redmars/shared';
import { parseCsv } from '../src/modules/drug/csv';

/**
 * Seeds the drug formulary (task 2.5) for a facility from a checked-in CSV.
 *
 * IMPORTANT — this is a CURATED STARTER FORMULARY, not the verbatim official MoPH
 * Essential Medicines List. It leans towards the psychiatric drugs Farhat's Dr. H
 * prescribes, plus common general essentials, so a fresh install is usable on day
 * one. A pharmacist MUST review it against the current MoPH EML before real use —
 * generic names, strengths and especially the isControlled flags are the things to
 * check. Extend or correct the CSV; this script just loads whatever is in it.
 *
 * Bootstrap data, so it writes with the bare client (no audit actor) and upserts
 * on (facility, code) — re-running is safe and updates in place, exactly like the
 * facility/department seed. Run: pnpm --filter api db:seed:drugs
 */

const prisma = new PrismaClient();

const TRUE_VALUES = new Set(['true', '1', 'yes', 'y']);

async function main() {
  const facilityCode = process.env.SEED_FACILITY_CODE ?? 'FARHAT';
  const facility = await prisma.facility.findUnique({ where: { code: facilityCode } });
  if (!facility) {
    throw new Error(
      `Facility '${facilityCode}' not found. Run the main seed first (pnpm --filter api db:seed).`,
    );
  }

  const csv = readFileSync(join(__dirname, 'data', 'essential-medicines.csv'), 'utf8');
  const rows = parseCsv(csv);
  if (rows.length < 2) {
    throw new Error('essential-medicines.csv has no data rows');
  }

  // Map the known headers to column indices.
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const idx = {
    code: col('code'),
    genericName: col('genericname'),
    strength: col('strength'),
    form: col('form'),
    isControlled: col('iscontrolled'),
  };
  if (idx.code < 0 || idx.genericName < 0) {
    throw new Error("essential-medicines.csv must have 'code' and 'genericName' columns");
  }

  let imported = 0;
  let skipped = 0;
  const at = (cells: string[], i: number) => (i >= 0 ? (cells[i] ?? '').trim() : '');

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const parsed = drugFieldsSchema.safeParse({
      code: at(cells, idx.code),
      genericName: at(cells, idx.genericName),
      strength: at(cells, idx.strength),
      form: at(cells, idx.form),
      isControlled: TRUE_VALUES.has(at(cells, idx.isControlled).toLowerCase()),
    });

    if (!parsed.success) {
      skipped++;
      console.warn(`  skipped line ${r + 1}: ${parsed.error.issues[0]?.message ?? 'invalid row'}`);
      continue;
    }

    const { code, genericName, brandName, atcCode, strength, form, isControlled } = parsed.data;
    const fields = {
      genericName,
      brandName: brandName ?? null,
      atcCode: atcCode ?? null,
      strength: strength ?? null,
      form: form ?? null,
      isControlled,
    };
    await prisma.drug.upsert({
      where: { facilityId_code: { facilityId: facility.id, code } },
      update: fields,
      create: { facilityId: facility.id, code, ...fields },
    });
    imported++;
  }

  console.log(
    `drugs: ${imported} seeded for ${facility.code}${skipped ? `, ${skipped} skipped` : ''}`,
  );
}

main()
  .catch((error) => {
    console.error('drug seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
