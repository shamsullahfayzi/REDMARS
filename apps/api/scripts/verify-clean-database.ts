import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';

// Deliberately do not load a development .env file. Both values must be supplied
// explicitly by the operator. Verification is read-only and never removes data.
const connection = process.env.DATABASE_URL;
const expectedDatabase = process.env.CLEAN_DATABASE_NAME;
let actualDatabase: string | undefined;
try {
  actualDatabase = connection ? new URL(connection).pathname : undefined;
} catch {
  // Do not let URL parsing errors echo a connection string containing secrets.
}
if (!connection || !expectedDatabase || actualDatabase !== `/${expectedDatabase}`) {
  throw new Error('Supply DATABASE_URL and the matching CLEAN_DATABASE_NAME explicitly.');
}

const referenceModels = new Set(['Role', 'Permission', 'RolePermission']);
type Counter = { count(): Promise<number> };
class CleanDatabaseError extends Error {}
const prisma = new PrismaClient();

async function main() {
  const migrations = readdirSync(join(__dirname, '../prisma/migrations'))
    .filter((name) => /^\d/.test(name))
    .sort();
  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const applied = await tx.$queryRaw<
        Array<{
          migration_name: string;
          checksum: string;
          finished_at: Date | null;
          rolled_back_at: Date | null;
        }>
      >`SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
      if (
        applied.length !== migrations.length ||
        applied.some(
          (row, i) =>
            row.migration_name !== migrations[i] || !row.finished_at || row.rolled_back_at,
        )
      ) {
        throw new CleanDatabaseError(
          'Migration history does not match the complete repository sequence.',
        );
      }
      for (const row of applied) {
        const sql = readFileSync(
          join(__dirname, '../prisma/migrations', row.migration_name, 'migration.sql'),
          'utf8',
        );
        const variants = [sql, sql.replace(/\r\n/g, '\n'), sql.replace(/\r?\n/g, '\r\n')];
        if (
          !variants.some((text) => createHash('sha256').update(text).digest('hex') === row.checksum)
        ) {
          throw new CleanDatabaseError(`Migration checksum differs: ${row.migration_name}`);
        }
      }
      const counts: Record<string, number> = {};
      const delegates = tx as unknown as Record<string, Counter>;
      for (const model of Object.values(Prisma.ModelName)) {
        counts[model] = await delegates[model[0].toLowerCase() + model.slice(1)].count();
      }
      const nonempty = Object.entries(counts).filter(
        ([model, count]) => !referenceModels.has(model) && count !== 0,
      );
      if (nonempty.length) {
        throw new CleanDatabaseError(
          `Database is not clean; nonempty application tables: ${nonempty.map(([model]) => model).join(', ')}`,
        );
      }
      return {
        database: expectedDatabase,
        migrations: applied.length,
        modelsChecked: Object.keys(counts).length,
        applicationRecords: 0,
        facilityRecords: counts.Facility,
        userRecords: counts.AppUser,
        patientRecords: counts.Patient,
        employeeRecords: counts.Employee,
        financialJournals: counts.FinanceJournal,
        referenceRows: Object.fromEntries(
          Object.entries(counts).filter(([model]) => referenceModels.has(model)),
        ),
      };
    },
    { timeout: 60000 },
  );
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error: unknown) => {
    // Counts/table names are sufficient diagnostics; never print connection data.
    console.error(
      error instanceof CleanDatabaseError
        ? error.message
        : 'Clean database verification failed. Check connectivity and migration state.',
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
