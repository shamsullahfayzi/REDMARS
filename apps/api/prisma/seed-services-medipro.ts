import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { parseCsv } from '../src/modules/drug/csv';

/**
 * Seeds the real service catalog (~355 items) migrated from the old system's SERVICE
 * table, filtered down to genuine clinical services — doctor-fee rows (grp=CON), drug
 * price rows (grp=Medi/MED, those became the drug formulary instead), lab test rows
 * (grp=LAB, those feed the LabTest catalog instead) and bookkeeping rows (CASHR/ASSIS)
 * are excluded. See `medipro-services.csv` and the transform script referenced in its
 * git history if you need to regenerate it. Each row's grp code was mapped to one of
 * the departments seeded in `seed.ts`'s DEPARTMENTS array.
 *
 * IMPORTANT: the old export carried no price column, so every row seeds with fee =
 * 0.00. That is deliberately visible (a 0.00 line on an invoice gets noticed
 * immediately) rather than a guessed number that could quietly undercharge. An admin
 * must bulk-price these in the Services screen before this facility goes live on them.
 *
 * Upserts on (facility, code) — re-running is safe. Run: pnpm --filter api exec ts-node prisma/seed-services-medipro.ts
 */

const prisma = new PrismaClient();

async function main() {
  const facilityCode = process.env.SEED_FACILITY_CODE ?? 'FARHAT';
  const facility = await prisma.facility.findUnique({ where: { code: facilityCode } });
  if (!facility) {
    throw new Error(
      `Facility '${facilityCode}' not found. Run the main seed first (pnpm --filter api db:seed).`,
    );
  }

  const departments = await prisma.department.findMany({ where: { facilityId: facility.id } });
  const deptByCode = new Map(departments.map((d) => [d.code, d.id]));

  const csv = readFileSync(join(__dirname, 'data', 'medipro-services.csv'), 'utf8');
  const rows = parseCsv(csv);
  if (rows.length < 2) {
    throw new Error('medipro-services.csv has no data rows');
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const idx = { code: col('code'), name: col('name'), departmentCode: col('departmentcode'), fee: col('fee') };
  if (idx.code < 0 || idx.name < 0 || idx.departmentCode < 0) {
    throw new Error("medipro-services.csv must have 'code', 'name' and 'departmentCode' columns");
  }

  let imported = 0;
  let skipped = 0;
  const at = (cells: string[], i: number) => (i >= 0 ? (cells[i] ?? '').trim() : '');

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const code = at(cells, idx.code);
    const name = at(cells, idx.name);
    const departmentCode = at(cells, idx.departmentCode);
    const feeRaw = at(cells, idx.fee);

    if (!code || !name || !departmentCode) {
      skipped++;
      console.warn(`  skipped line ${r + 1}: missing code/name/departmentCode`);
      continue;
    }
    const departmentId = deptByCode.get(departmentCode);
    if (!departmentId) {
      skipped++;
      console.warn(`  skipped line ${r + 1}: unknown department code '${departmentCode}'`);
      continue;
    }

    const fee = feeRaw && !Number.isNaN(Number(feeRaw)) ? feeRaw : '0.00';

    await prisma.service.upsert({
      where: { facilityId_code: { facilityId: facility.id, code } },
      update: { name, departmentId, fee },
      create: { facilityId: facility.id, code, name, departmentId, fee },
    });
    imported++;
  }

  console.log(
    `medipro services: ${imported} seeded for ${facility.code}${skipped ? `, ${skipped} skipped` : ''} — all at fee 0.00, needs admin pricing`,
  );
}

main()
  .catch((error) => {
    console.error('medipro service seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
