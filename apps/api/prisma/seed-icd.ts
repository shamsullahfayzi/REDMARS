import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { parseCsv } from '../src/modules/drug/csv';

/**
 * Seeds the ICD-10 diagnosis catalog (task 2.9) from a checked-in CSV.
 *
 * IMPORTANT — this is a CURATED, PSYCHIATRY-FIRST subset, NOT the full ~70,000-code
 * WHO ICD-10. It covers the whole F chapter (mental and behavioural disorders) plus
 * the general codes a psychiatric OPD actually reaches for (epilepsy, migraine,
 * thyroid, type-2 diabetes, hypertension, headache, general exam). A clinician
 * should review it — and free-text diagnosis is always allowed regardless — so a
 * code that is missing is an inconvenience, not a wall. Extend the CSV to grow it.
 *
 * titleLocal (Dari) is intentionally left blank: translating diagnosis titles wants
 * a clinician's eye, exactly like the drug generic names. The column is loaded if
 * present, so it can be filled later without touching this script.
 *
 * ICD codes are GLOBAL reference data — keyed by code alone, shared across every
 * facility — so unlike the drug seed there is no facility here. Bootstrap data, so
 * it writes with the bare client (no audit actor) and upserts on the code: re-running
 * is safe and updates titles in place. Run: pnpm --filter api db:seed:icd
 */

const prisma = new PrismaClient();

const TRUE_VALUES = new Set(['true', '1', 'yes', 'y']);

async function main() {
  const csv = readFileSync(join(__dirname, 'data', 'icd10-seed.csv'), 'utf8');
  const rows = parseCsv(csv);
  if (rows.length < 2) {
    throw new Error('icd10-seed.csv has no data rows');
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const idx = {
    code: col('code'),
    title: col('title'),
    titleLocal: col('titlelocal'),
    chapter: col('chapter'),
    isBillable: col('isbillable'),
  };
  if (idx.code < 0 || idx.title < 0) {
    throw new Error("icd10-seed.csv must have 'code' and 'title' columns");
  }

  const at = (cells: string[], i: number) => (i >= 0 ? (cells[i] ?? '').trim() : '');
  let imported = 0;
  let skipped = 0;

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const code = at(cells, idx.code);
    const title = at(cells, idx.title);
    if (!code || !title) {
      skipped++;
      console.warn(`  skipped line ${r + 1}: missing code or title`);
      continue;
    }

    const titleLocal = at(cells, idx.titleLocal) || null;
    const chapter = at(cells, idx.chapter) || null;
    // Default true when the column is blank — a code is billable unless it is a
    // parent category the CSV marks false.
    const isBillableCell = at(cells, idx.isBillable).toLowerCase();
    const isBillable = isBillableCell === '' ? true : TRUE_VALUES.has(isBillableCell);

    const fields = { title, titleLocal, chapter, isBillable };
    await prisma.icdCode.upsert({
      where: { code },
      update: fields,
      create: { code, ...fields },
    });
    imported++;
  }

  console.log(`icd codes: ${imported} seeded${skipped ? `, ${skipped} skipped` : ''}`);
}

main()
  .catch((error) => {
    console.error('icd seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
