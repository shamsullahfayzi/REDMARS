import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { interactionSeveritySchema } from '@redmars/shared';
import { parseCsv } from '../src/modules/drug/csv';

/**
 * Seeds drug–drug interactions (task 2.11) for a facility from a checked-in CSV of
 * curated psychiatric pairs.
 *
 * HONEST LIMIT — this is NOT a comprehensive interaction database. Comprehensive
 * ones are commercially licensed. This is the handful of most-dangerous psych pairs,
 * and the UI says so plainly: a clean result is "no seeded pair matched", not "safe".
 *
 * The rules are keyed by GENERIC NAME, but the DrugInteraction model links two
 * concrete, facility-scoped drug rows. So the seeder resolves each rule against THIS
 * facility's formulary: it inserts a row only when the facility stocks both generics,
 * and expands one rule across every strength on hand (Sertraline 50mg AND 100mg both
 * pair with Venlafaxine). A generic the facility does not stock — e.g. an MAOI at
 * Farhat — produces no rows; that pair sits dormant in the CSV until such a drug is
 * added, which is correct: no MAOI stocked means no MAOI interaction is possible.
 *
 * The pair is stored in a canonical id order (drugAId < drugBId) so the unique
 * constraint (drugAId, drugBId) dedupes regardless of the direction it was checked,
 * and the checker's single "both endpoints in the set" query finds it either way.
 *
 * Bootstrap data: bare client (no audit actor), upsert on the unique pair, so
 * re-running is safe and refreshes severity/description in place. Additive by design
 * — it never deletes, so an interaction a pharmacist adds by hand later is left alone.
 *
 * Run: pnpm --filter api db:seed:interactions
 */

const prisma = new PrismaClient();

interface Rule {
  genericA: string;
  genericB: string;
  severity: string;
  description: string;
  line: number;
}

async function main() {
  const facilityCode = process.env.SEED_FACILITY_CODE ?? 'FARHAT';
  const facility = await prisma.facility.findUnique({ where: { code: facilityCode } });
  if (!facility) {
    throw new Error(
      `Facility '${facilityCode}' not found. Run the main seed first (pnpm --filter api db:seed).`,
    );
  }

  const csv = readFileSync(join(__dirname, 'data', 'drug-interactions-seed.csv'), 'utf8');
  const rows = parseCsv(csv);
  if (rows.length < 2) {
    throw new Error('drug-interactions-seed.csv has no data rows');
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const idx = {
    genericA: col('generica'),
    genericB: col('genericb'),
    severity: col('severity'),
    description: col('description'),
  };
  if (Object.values(idx).some((i) => i < 0)) {
    throw new Error(
      'drug-interactions-seed.csv must have genericA, genericB, severity, description columns',
    );
  }

  const at = (cells: string[], i: number) => (cells[i] ?? '').trim();
  const rules: Rule[] = [];
  let skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const severity = at(cells, idx.severity);
    if (!interactionSeveritySchema.safeParse(severity).success) {
      skipped++;
      console.warn(`  skipped line ${r + 1}: invalid severity '${severity}'`);
      continue;
    }
    const genericA = at(cells, idx.genericA);
    const genericB = at(cells, idx.genericB);
    const description = at(cells, idx.description);
    if (!genericA || !genericB || !description) {
      skipped++;
      console.warn(`  skipped line ${r + 1}: missing generic or description`);
      continue;
    }
    rules.push({ genericA, genericB, severity, description, line: r + 1 });
  }

  // Index the facility's active drugs by lower-cased generic name — one generic may
  // map to several rows (different strengths), all of which a rule must expand across.
  const drugs = await prisma.drug.findMany({
    where: { facilityId: facility.id },
    select: { id: true, genericName: true },
  });
  const byGeneric = new Map<string, string[]>();
  for (const drug of drugs) {
    const key = drug.genericName.trim().toLowerCase();
    const list = byGeneric.get(key) ?? [];
    list.push(drug.id);
    byGeneric.set(key, list);
  }

  let seeded = 0;
  let dormant = 0;
  for (const rule of rules) {
    const aIds = byGeneric.get(rule.genericA.toLowerCase()) ?? [];
    const bIds = byGeneric.get(rule.genericB.toLowerCase()) ?? [];
    if (aIds.length === 0 || bIds.length === 0) {
      // Facility stocks neither side or only one — nothing to link. Dormant, not an error.
      dormant++;
      continue;
    }

    for (const a of aIds) {
      for (const b of bIds) {
        if (a === b) continue; // same drug row (would only happen if a rule paired a generic with itself)
        // Canonical order so (x,y) and (y,x) collapse to one unique row.
        const [drugAId, drugBId] = a < b ? [a, b] : [b, a];
        await prisma.drugInteraction.upsert({
          where: { drugAId_drugBId: { drugAId, drugBId } },
          update: { severity: rule.severity, description: rule.description },
          create: { drugAId, drugBId, severity: rule.severity, description: rule.description },
        });
        seeded++;
      }
    }
  }

  console.log(
    `drug interactions: ${seeded} pair(s) seeded for ${facility.code}` +
      `, ${dormant} rule(s) dormant (a drug not stocked)` +
      (skipped ? `, ${skipped} row(s) skipped` : ''),
  );
}

main()
  .catch((error) => {
    console.error('drug interaction seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
