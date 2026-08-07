import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { drugFieldsSchema } from '@redmars/shared';
import { parseCsv } from '../src/modules/drug/csv';

/**
 * Seeds the REAL Medi-Pro drug catalog (~1200 items), migrated from the old system's
 * SERVICE table (grp = Medi/MEDI/MED), name-parsed into generic/brand/strength/form by
 * a one-off script — see git history for `medipro-drugs.csv` if you need to regenerate
 * it from the raw exports. This is a MECHANICAL migration, not a curated list like
 * `essential-medicines.csv`: parsing is heuristic (regex over free text), a fair number
 * of rows will have an ugly or wrong genericName, and isControlled is a keyword guess.
 * A pharmacist MUST review this list before real use, same requirement as the starter
 * formulary. No prices came across (the old export had none) — sellPrice is left null
 * on every row, which reads as a free dispense until someone prices it in the Drugs
 * admin screen. defaultRoute/Freq/Duration are populated separately, conservatively,
 * by a later pass — see task 29 in the migration work.
 *
 * Upserts on (facility, code) — re-running is safe. Run: pnpm --filter api exec ts-node prisma/seed-drugs-medipro.ts
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

  const csv = readFileSync(join(__dirname, 'data', 'medipro-drugs.csv'), 'utf8');
  const rows = parseCsv(csv);
  if (rows.length < 2) {
    throw new Error('medipro-drugs.csv has no data rows');
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const idx = {
    code: col('code'),
    genericName: col('genericname'),
    brandName: col('brandname'),
    strength: col('strength'),
    form: col('form'),
    isControlled: col('iscontrolled'),
    defaultRoute: col('defaultroute'),
    defaultFreq: col('defaultfreq'),
    defaultDuration: col('defaultduration'),
  };
  if (idx.code < 0 || idx.genericName < 0) {
    throw new Error("medipro-drugs.csv must have 'code' and 'genericName' columns");
  }

  let imported = 0;
  let skipped = 0;
  const at = (cells: string[], i: number) => (i >= 0 ? (cells[i] ?? '').trim() : '');

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const parsed = drugFieldsSchema.safeParse({
      code: at(cells, idx.code),
      genericName: at(cells, idx.genericName),
      brandName: at(cells, idx.brandName),
      strength: at(cells, idx.strength),
      form: at(cells, idx.form),
      defaultRoute: at(cells, idx.defaultRoute),
      defaultFreq: at(cells, idx.defaultFreq),
      defaultDuration: at(cells, idx.defaultDuration),
      isControlled: TRUE_VALUES.has(at(cells, idx.isControlled).toLowerCase()),
    });

    if (!parsed.success) {
      skipped++;
      console.warn(`  skipped line ${r + 1}: ${parsed.error.issues[0]?.message ?? 'invalid row'}`);
      continue;
    }

    const { code, genericName, brandName, strength, form, defaultRoute, defaultFreq, defaultDuration, isControlled } =
      parsed.data;
    const fields = {
      genericName,
      brandName: brandName ?? null,
      atcCode: null,
      strength: strength ?? null,
      form: form ?? null,
      defaultRoute: defaultRoute ?? null,
      defaultFreq: defaultFreq ?? null,
      defaultDuration: defaultDuration ?? null,
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
    `medipro drugs: ${imported} seeded for ${facility.code}${skipped ? `, ${skipped} skipped` : ''}`,
  );
}

main()
  .catch((error) => {
    console.error('medipro drug seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
