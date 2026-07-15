import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { DepartmentType, PrismaClient } from '@prisma/client';

/**
 * Seeds the minimum a fresh REDMARS database needs to be usable: the facility
 * this deployment belongs to, its departments, and one administrator to log in
 * with.
 *
 * Idempotent — every write is an upsert, so running it twice is safe and never
 * overwrites data that is already there. In particular a re-seed will NOT reset
 * an existing admin's password.
 *
 * Scope note: roles and permissions are task 1.2, so the admin user is created
 * without any role attached. It cannot do anything yet, and there is no auth to
 * do it with. This file grows in 1.2.
 *
 * One DB per hospital, so there is exactly one facility here. Parameterising it
 * per deployment is Phase 7 work; for now these constants describe Farhat.
 */

const prisma = new PrismaClient();

const FACILITY = {
  code: 'FARHAT',
  name: 'Farhat Hospital',
  nameLocal: 'شفاخانه فرحت',
  timezone: 'Asia/Kabul',
  currency: 'AFN',
};

// nameLocal is Dari only — the schema has a single local-name column, which
// does not survive contact with Dari + Pashto. Flagged for the 2.1 rework.
const DEPARTMENTS: Array<{
  code: string;
  name: string;
  nameLocal: string;
  type: DepartmentType;
}> = [
  { code: 'OPD', name: 'Outpatient Department', nameLocal: 'بخش سراپا', type: DepartmentType.opd },
  { code: 'LAB', name: 'Laboratory', nameLocal: 'لابراتوار', type: DepartmentType.laboratory },
  { code: 'PHARM', name: 'Pharmacy', nameLocal: 'دواخانه', type: DepartmentType.pharmacy },
  {
    code: 'ADMIN',
    name: 'Administration',
    nameLocal: 'اداره',
    type: DepartmentType.administration,
  },
];

async function seedFacility() {
  const facility = await prisma.facility.upsert({
    where: { code: FACILITY.code },
    update: {},
    create: FACILITY,
  });

  console.log(`facility: ${facility.code} (${facility.name})`);
  return facility;
}

async function seedDepartments(facilityId: string) {
  for (const department of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { facilityId_code: { facilityId, code: department.code } },
      update: {},
      create: { ...department, facilityId },
    });
  }

  console.log(`departments: ${DEPARTMENTS.map((d) => d.code).join(', ')}`);
}

async function seedAdminUser(facilityId: string) {
  const username = process.env.SEED_ADMIN_USERNAME ?? 'admin';

  const existing = await prisma.appUser.findUnique({
    where: { facilityId_username: { facilityId, username } },
  });

  if (existing) {
    // Never silently reset a password on re-seed — that would lock out whoever
    // is already using this database.
    console.log(`admin user: '${username}' already exists, left untouched`);
    return;
  }

  // No default password, ever (task 7.3). Either the operator supplies one or we
  // mint a strong random one and show it exactly once.
  const supplied = process.env.SEED_ADMIN_PASSWORD;
  const password = supplied ?? randomBytes(18).toString('base64url');

  await prisma.appUser.create({
    data: {
      facilityId,
      username,
      fullName: 'System Administrator',
      // Only the argon2id hash is ever stored.
      passwordHash: await hash(password),
    },
  });

  console.log(`admin user: '${username}' created`);

  if (!supplied) {
    console.log('');
    console.log('  ---------------------------------------------------------');
    console.log('   Generated admin password — shown once, never stored:');
    console.log('');
    console.log(`     ${password}`);
    console.log('');
    console.log('   Write it down now. Set SEED_ADMIN_PASSWORD to choose your own.');
    console.log('  ---------------------------------------------------------');
    console.log('');
  }
}

async function main() {
  const facility = await seedFacility();
  await seedDepartments(facility.id);
  await seedAdminUser(facility.id);
  console.log('seed complete');
}

main()
  .catch((error) => {
    console.error('seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
