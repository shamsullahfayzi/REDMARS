import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

/**
 * DEV ONLY — one login-able user per role, so a developer can click through the
 * role-based nav (task 1.6) as each role without waiting for the admin user-
 * management screens (task 1.7).
 *
 * NOT part of the production seed. Farhat's real staff are created by a named
 * admin through the audited 1.7 flow, never baked into a script — that is the
 * whole point of 1.7. This file exists so local verification does not need it yet,
 * and it refuses to run anywhere NODE_ENV says is production.
 *
 * Idempotent: re-running leaves existing dev users (and their passwords) untouched
 * and only fills in whatever is missing. Every account shares one obvious dev
 * password; these are not secrets and must never reach a real deployment.
 *
 * Remove them with:  DELETE FROM app_user WHERE username LIKE 'dev\_%';
 */

const prisma = new PrismaClient();

const DEV_PASSWORD = 'redmars-dev';

const ROLE_CODES = [
  'admin',
  'receptionist',
  'nurse',
  'doctor',
  'lab_tech',
  'pharmacist',
  'management',
] as const;

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('dev-seed refuses to run with NODE_ENV=production — these are throwaway accounts.');
  }

  const facility = await prisma.facility.findFirstOrThrow();

  // One hash for all of them: same password, and argon2 embeds its own salt, so a
  // shared hash string is correct and saves six ~100ms hashes.
  const passwordHash = await hash(DEV_PASSWORD);

  const created: Array<{ username: string; role: string; status: string }> = [];

  for (const roleCode of ROLE_CODES) {
    const username = `dev_${roleCode}`;
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) {
      created.push({ username, role: roleCode, status: 'SKIPPED — role not seeded (run db:seed first)' });
      continue;
    }

    const existing = await prisma.appUser.findUnique({
      where: { facilityId_username: { facilityId: facility.id, username } },
    });

    if (existing) {
      // Make sure the role assignment is present even if the user already existed.
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: existing.id, roleId: role.id } },
        update: {},
        create: { userId: existing.id, roleId: role.id },
      });
      created.push({ username, role: roleCode, status: 'already existed' });
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const user = await tx.appUser.create({
        data: {
          facilityId: facility.id,
          username,
          fullName: `Dev ${roleCode}`,
          passwordHash,
        },
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
    });
    created.push({ username, role: roleCode, status: 'created' });
  }

  console.log(`\nDev users on facility ${facility.code} — password for all: ${DEV_PASSWORD}\n`);
  for (const row of created) {
    console.log(`  ${row.username.padEnd(16)} role=${row.role.padEnd(13)} ${row.status}`);
  }
  console.log('');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
