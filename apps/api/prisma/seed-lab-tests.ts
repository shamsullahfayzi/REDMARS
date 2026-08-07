import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Gender, PrismaClient } from '@prisma/client';
import { parseCsv } from '../src/modules/drug/csv';

/**
 * Seeds a CURATED starter lab test menu (~264 tests, ~284 reference-range rows) — the
 * old Medi-Pro export had no dedicated lab test table (only 164 free-text billing
 * lines under grp=LAB), so this is built from standard clinical reference ranges, not
 * migrated data. Farhat's own 164 real test names were cross-checked in so the local
 * menu is well covered; ranges lean adult/general-population and skip pediatric and
 * cycle-phase/gestational-week breakdowns for v1 (textValue notes flag where a range
 * genuinely varies). A pathologist/lab lead MUST review this before real use — same
 * requirement this project already applies to the drug formulary.
 *
 * One CSV row per (test, reference-range) pair — a test with a gender split has two
 * rows sharing the same code; the LabTest itself is upserted from the FIRST row seen
 * for that code, and every row after that only adds a ReferenceRange.
 *
 * Bootstrap data: writes with the bare client, upserts on (facility, code) for the
 * test and replaces that test's ranges wholesale on every run (delete+recreate is
 * fine here — ranges have no independent identity or history to preserve).
 * Run: pnpm --filter api exec ts-node prisma/seed-lab-tests.ts
 */

const prisma = new PrismaClient();

function toGender(raw: string): Gender | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v === 'male' || v === 'female' || v === 'other' || v === 'unknown') return v as Gender;
  throw new Error(`Unknown gender value '${raw}'`);
}

function toNum(raw: string): number | null {
  const v = raw.trim();
  return v === '' ? null : Number(v);
}

async function main() {
  const facilityCode = process.env.SEED_FACILITY_CODE ?? 'FARHAT';
  const facility = await prisma.facility.findUnique({ where: { code: facilityCode } });
  if (!facility) {
    throw new Error(
      `Facility '${facilityCode}' not found. Run the main seed first (pnpm --filter api db:seed).`,
    );
  }

  const csv = readFileSync(join(__dirname, 'data', 'lab-tests-seed.csv'), 'utf8');
  const rows = parseCsv(csv);
  if (rows.length < 2) {
    throw new Error('lab-tests-seed.csv has no data rows');
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const idx = {
    code: col('code'),
    name: col('name'),
    specimen: col('specimen'),
    unit: col('unit'),
    price: col('price'),
    gender: col('gender'),
    minAge: col('minage'),
    maxAge: col('maxage'),
    low: col('low'),
    high: col('high'),
    textValue: col('textvalue'),
  };
  if (idx.code < 0 || idx.name < 0) {
    throw new Error("lab-tests-seed.csv must have 'code' and 'name' columns");
  }

  const at = (cells: string[], i: number) => (i >= 0 ? (cells[i] ?? '').trim() : '');

  const testIds = new Map<string, string>();
  let testsSeeded = 0;
  let rangesSeeded = 0;
  let skipped = 0;

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const code = at(cells, idx.code);
    const name = at(cells, idx.name);
    if (!code || !name) {
      skipped++;
      console.warn(`  skipped line ${r + 1}: missing code/name`);
      continue;
    }

    let testId = testIds.get(code);
    if (!testId) {
      const test = await prisma.labTest.upsert({
        where: { facilityId_code: { facilityId: facility.id, code } },
        update: { name, specimen: at(cells, idx.specimen) || null, unit: at(cells, idx.unit) || null },
        create: {
          facilityId: facility.id,
          code,
          name,
          specimen: at(cells, idx.specimen) || null,
          unit: at(cells, idx.unit) || null,
          price: null,
        },
      });
      testId = test.id;
      testIds.set(code, testId);
      await prisma.referenceRange.deleteMany({ where: { testId } });
      testsSeeded++;
    }

    const low = toNum(at(cells, idx.low));
    const high = toNum(at(cells, idx.high));
    const textValue = at(cells, idx.textValue) || null;
    if (low == null && high == null && !textValue) {
      continue; // nothing to record for this range row
    }

    await prisma.referenceRange.create({
      data: {
        testId,
        gender: toGender(at(cells, idx.gender)),
        minAge: idx.minAge >= 0 ? (toNum(at(cells, idx.minAge)) ?? null) : null,
        maxAge: idx.maxAge >= 0 ? (toNum(at(cells, idx.maxAge)) ?? null) : null,
        lowValue: low,
        highValue: high,
        textValue,
      },
    });
    rangesSeeded++;
  }

  console.log(
    `lab tests: ${testsSeeded} seeded, ${rangesSeeded} reference ranges, for ${facility.code}` +
      `${skipped ? `, ${skipped} rows skipped` : ''} — no prices, needs lab-lead review`,
  );
}

main()
  .catch((error) => {
    console.error('lab test seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
