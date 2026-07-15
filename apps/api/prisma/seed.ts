import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { DepartmentType, PrismaClient } from '@prisma/client';
import {
  PERMISSION_MATRIX,
  ROLES,
  splitPermissionCode,
  type PermissionCode,
  type RoleCode,
} from '../src/auth/permissions';

/**
 * Seeds the minimum a fresh REDMARS database needs to be usable: the facility
 * this deployment belongs to, its departments, and one administrator to log in
 * with.
 *
 * Idempotent — every write is an upsert, so running it twice is safe and never
 * overwrites data that is already there. In particular a re-seed will NOT reset
 * an existing admin's password.
 *
 * The RBAC matrix (task 1.2) is the exception to "never overwrite": it
 * reconciles. See seedRbac.
 *
 * Scope note: the admin user is created without any role attached. Assigning
 * roles to users is task 1.7, and doing it here would hand out authority from a
 * script instead of from an audited action.
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

/**
 * Writes the RBAC matrix from src/auth/permissions.ts into the database.
 *
 * Unlike everything else in this file, this RECONCILES rather than only adding.
 * The document is the authority, so a grant deleted from the matrix must
 * disappear from the database on the next seed. The alternative — "only ever
 * add" — means a permission the hospital revoked on paper stays live in
 * Postgres forever, which is privilege outliving its justification and exactly
 * the kind of drift an audit is supposed to catch.
 *
 * Runs in one transaction. A half-applied matrix is worse than an unapplied
 * one: it is a state nobody designed, where some grants are revoked and others
 * are not, and no one can tell which.
 */
async function seedRbac() {
  await prisma.$transaction(
    async (tx) => {
      // --- Roles ------------------------------------------------------------
      for (const role of ROLES) {
        await tx.role.upsert({
          where: { code: role.code },
          update: { name: role.name, description: role.description },
          create: { code: role.code, name: role.name, description: role.description },
        });
      }

      // Roles no longer in the matrix are reported, never deleted. UserRole
      // cascades on role deletion, so dropping a renamed role would silently
      // strip every user holding it — a person losing access without anyone
      // deciding that. A human looks at this.
      const staleRoles = await tx.role.findMany({
        where: { code: { notIn: ROLES.map((r) => r.code) } },
        include: { _count: { select: { userRoles: true } } },
      });

      for (const role of staleRoles) {
        console.warn(
          `  WARNING: role '${role.code}' is in the database but not in the matrix ` +
            `(${role._count.userRoles} user(s) hold it). Left alone — remove it by hand.`,
        );
      }

      // --- Permissions ------------------------------------------------------
      const codes = Object.keys(PERMISSION_MATRIX) as PermissionCode[];

      for (const code of codes) {
        const { resource, action } = splitPermissionCode(code);
        await tx.permission.upsert({
          where: { code },
          update: { resource, action },
          create: { code, resource, action },
        });
      }

      // Safe to delete: a Permission holds no user data, and RolePermission
      // cascades, so this revokes any grant that depended on it.
      const removed = await tx.permission.deleteMany({ where: { code: { notIn: codes } } });

      // --- Grants -----------------------------------------------------------
      const roleIds = new Map(
        (await tx.role.findMany({ select: { id: true, code: true } })).map((r) => [r.code, r.id]),
      );
      const permissionIds = new Map(
        (await tx.permission.findMany({ select: { id: true, code: true } })).map((p) => [
          p.code,
          p.id,
        ]),
      );

      let conditional = 0;
      const wanted = new Set<string>();

      for (const [code, grants] of Object.entries(PERMISSION_MATRIX)) {
        const permissionId = permissionIds.get(code)!;

        for (const [role, condition] of Object.entries(grants) as Array<
          [RoleCode, string | null]
        >) {
          const roleId = roleIds.get(role)!;
          wanted.add(`${roleId}:${permissionId}`);
          if (condition !== null) conditional++;

          await tx.rolePermission.upsert({
            where: { roleId_permissionId: { roleId, permissionId } },
            // update matters: a grant whose condition changed from R10 to null
            // in the document must lose its ceiling here too, and vice versa.
            update: { condition },
            create: { roleId, permissionId, condition },
          });
        }
      }

      const existing = await tx.rolePermission.findMany();
      const stale = existing.filter((g) => !wanted.has(`${g.roleId}:${g.permissionId}`));

      for (const grant of stale) {
        await tx.rolePermission.delete({
          where: {
            roleId_permissionId: { roleId: grant.roleId, permissionId: grant.permissionId },
          },
        });
      }

      console.log(`roles: ${ROLES.length} (${ROLES.map((r) => r.code).join(', ')})`);
      console.log(
        `permissions: ${codes.length} seeded` +
          (removed.count > 0 ? `, ${removed.count} stale removed` : ''),
      );
      console.log(
        `grants: ${wanted.size} (${conditional} conditional)` +
          (stale.length > 0 ? `, ${stale.length} revoked` : ''),
      );
    },
    // The default 5s is not enough for ~200 sequential upserts on a cold
    // database, and a timeout here would roll back the whole matrix.
    { timeout: 60_000 },
  );
}

async function main() {
  const facility = await seedFacility();
  await seedDepartments(facility.id);
  await seedRbac();
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
