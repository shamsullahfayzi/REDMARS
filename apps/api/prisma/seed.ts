import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { DepartmentType, ModuleKey, PrismaClient } from '@prisma/client';
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
 * Scope note: the admin user is created holding exactly one role — admin — and
 * only at the moment it is created. Every other role assignment belongs to task
 * 1.7, where it is an audited action by a named person rather than a line in a
 * script. See seedAdminUser for why this one cannot wait for that.
 *
 * One DB per hospital, so there is exactly one facility here. Parameterising it
 * per deployment is Phase 7 work; for now these constants describe Farhat.
 */

const prisma = new PrismaClient();

const FACILITY = {
  code: 'FARHAT',
  name: 'Farhat Hospital',
  nameLocalPrs: 'شفاخانه فرحت',
  nameLocalPs: 'د فرحت روغتون',
  // From Farhat's own printed bill footer — the address and contact that head/foot the
  // invoice. Real values so the printed bill looks like the one the hospital hands out.
  address: 'Kolola Pushta Bus Stop, Kabul, Afghanistan',
  phone: '+93 788 991 144',
  email: 'farhathsp.af@gmail.com',
  timezone: 'Asia/Kabul',
  currency: 'AFN',
};

// Local names in both regional languages (2.1 rework — was a single Dari column).
// The Pashto strings are best-effort and want a native check, same as the UI
// locale files.
const DEPARTMENTS: Array<{
  code: string;
  name: string;
  nameLocalPrs: string;
  nameLocalPs: string;
  type: DepartmentType;
}> = [
  {
    code: 'OPD',
    name: 'Outpatient Department',
    nameLocalPrs: 'بخش سراپا',
    nameLocalPs: 'د سرپایي څانګه',
    type: DepartmentType.opd,
  },
  {
    code: 'LAB',
    name: 'Laboratory',
    nameLocalPrs: 'لابراتوار',
    nameLocalPs: 'لابراتوار',
    type: DepartmentType.laboratory,
  },
  {
    code: 'PHARM',
    name: 'Pharmacy',
    nameLocalPrs: 'دواخانه',
    nameLocalPs: 'درملتون',
    type: DepartmentType.pharmacy,
  },
  {
    code: 'ADMIN',
    name: 'Administration',
    nameLocalPrs: 'اداره',
    nameLocalPs: 'اداره',
    type: DepartmentType.administration,
  },
  // The rest of these (task: Medi-Pro migration) come from the grp codes actually
  // used on the old system's service list — a real multi-specialty OPD roster, not
  // just Farhat's psych focus. DepartmentType only has 7 buckets, so most specialty
  // clinics land under `opd` (they ARE outpatient clinics); imaging modalities
  // (ultrasound, doppler) fold into RAD rather than getting their own type.
  {
    code: 'IPD',
    name: 'Inpatient Department',
    nameLocalPrs: 'بخش بستری',
    nameLocalPs: 'د بستري کیدو څانګه',
    type: DepartmentType.ipd,
  },
  {
    code: 'EME',
    name: 'Emergency',
    nameLocalPrs: 'عاجل',
    nameLocalPs: 'عاجل',
    type: DepartmentType.emergency,
  },
  {
    code: 'RAD',
    name: 'Radiology',
    nameLocalPrs: 'رادیولوژی',
    nameLocalPs: 'رادیولوژي',
    type: DepartmentType.radiology,
  },
  {
    code: 'CAR',
    name: 'Cardiology',
    nameLocalPrs: 'قلب',
    nameLocalPs: 'زړه',
    type: DepartmentType.opd,
  },
  {
    code: 'NEURO',
    name: 'Neurosurgery',
    nameLocalPrs: 'نیوروسرجری',
    nameLocalPs: 'نیوروسرجري',
    type: DepartmentType.opd,
  },
  {
    code: 'OPEN',
    name: 'General & Open Surgery',
    nameLocalPrs: 'جراحی عمومی',
    nameLocalPs: 'عمومي جراحي',
    type: DepartmentType.opd,
  },
  {
    code: 'DENTA',
    name: 'Dental',
    nameLocalPrs: 'دندان',
    nameLocalPs: 'غاښونه',
    type: DepartmentType.opd,
  },
  {
    code: 'URO',
    name: 'Urology',
    nameLocalPrs: 'یورولوژی',
    nameLocalPs: 'یورولوژي',
    type: DepartmentType.opd,
  },
  {
    code: 'GYN',
    name: 'Gynecology & Obstetrics',
    nameLocalPrs: 'نسائی و ولادی',
    nameLocalPs: 'ښځینه او زیږون',
    type: DepartmentType.opd,
  },
  {
    code: 'PED',
    name: 'Pediatrics',
    nameLocalPrs: 'اطفال',
    nameLocalPs: 'ماشومان',
    type: DepartmentType.opd,
  },
  {
    code: 'INTER',
    name: 'Internal Medicine',
    nameLocalPrs: 'داخله',
    nameLocalPs: 'داخله',
    type: DepartmentType.opd,
  },
  {
    code: 'PHYS',
    name: 'Physiotherapy',
    nameLocalPrs: 'فزیوتراپی',
    nameLocalPs: 'فزیوتراپي',
    type: DepartmentType.opd,
  },
  {
    code: 'DIALY',
    name: 'Dialysis',
    nameLocalPrs: 'دیالیز',
    nameLocalPs: 'ډیالیز',
    type: DepartmentType.opd,
  },
  {
    code: 'ENDO',
    name: 'Endoscopy',
    nameLocalPrs: 'اندوسکوپی',
    nameLocalPs: 'اندوسکوپي',
    type: DepartmentType.opd,
  },
  {
    code: 'ANE',
    name: 'Anesthesia',
    nameLocalPrs: 'بیهوشی',
    nameLocalPs: 'بیهوښي',
    type: DepartmentType.opd,
  },
];

async function seedFacility() {
  const facility = await prisma.facility.upsert({
    where: { code: FACILITY.code },
    // Sync the letterhead fields onto an existing facility — they were added after the
    // row first existed, so create alone would never reach a database already seeded.
    update: {
      address: FACILITY.address,
      phone: FACILITY.phone,
      email: FACILITY.email,
    },
    create: FACILITY,
  });

  console.log(`facility: ${facility.code} (${facility.name})`);
  return facility;
}

// Which optional modules a fresh Farhat install has on. OPD is not here — it is the
// core and is never toggleable (see the ModuleKey enum). Farhat runs a lab and a
// pharmacy alongside its OPD, so those two ship on; the rest are off until licensed
// and an admin flips them (task 2.12). Enabling here is only the recorded flag — the
// ModuleGuard (2.13) is what turns a disabled module into a 403.
const ENABLED_MODULES = new Set<ModuleKey>([ModuleKey.lab, ModuleKey.pharmacy]);

async function seedModules(facilityId: string) {
  // Upsert every toggleable module so the admin screen always shows the full set of
  // switches. Idempotent, and it never overwrites `enabled`: once an admin has
  // toggled a module, a re-seed must not silently flip it back.
  for (const module of Object.values(ModuleKey)) {
    const enabled = ENABLED_MODULES.has(module);
    await prisma.facilityModule.upsert({
      where: { facilityId_module: { facilityId, module } },
      update: {},
      create: { facilityId, module, enabled, enabledAt: enabled ? new Date() : null },
    });
  }

  console.log(
    `modules: ${Object.values(ModuleKey).length} seeded ` +
      `(${[...ENABLED_MODULES].join(', ')} on)`,
  );
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

/**
 * Creates the one account a fresh deployment can be opened with.
 *
 * The admin role is attached here, at creation, and nowhere else. That is a
 * bootstrap, not a shortcut: from task 1.3 the guards deny any route the caller
 * holds no permission for, and the screens that assign roles are themselves
 * admin-only. An admin user with no roles cannot log in and grant itself the
 * role it needs to grant roles. Someone has to be let in from outside the
 * system, once, or the database is a locked room with the key inside.
 *
 * Only on creation. A re-seed never re-attaches it — if an operator deliberately
 * stripped the admin role from this account, handing it back because a script
 * ran again would be the script overruling a person about who holds authority.
 */
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

  const adminRole = await prisma.role.findUnique({ where: { code: 'admin' } });
  if (!adminRole) {
    // seedRbac runs before this in main(). If the role is missing the matrix
    // did not land, and creating a roleless admin here would produce exactly
    // the locked room described above — with no error to explain it.
    throw new Error("Cannot create the admin user: role 'admin' does not exist. Did seedRbac run?");
  }

  // One transaction: an admin user without its role is the locked room, and the
  // failure would be silent until the first login 403s on everything.
  await prisma.$transaction(async (tx) => {
    const user = await tx.appUser.create({
      data: {
        facilityId,
        username,
        fullName: 'System Administrator',
        // Only the argon2id hash is ever stored.
        passwordHash: await hash(password),
      },
    });

    await tx.userRole.create({ data: { userId: user.id, roleId: adminRole.id } });
  });

  console.log(`admin user: '${username}' created, holding role 'admin'`);

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
  await seedModules(facility.id);
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
