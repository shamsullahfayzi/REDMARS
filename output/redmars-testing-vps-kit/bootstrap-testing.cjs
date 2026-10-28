'use strict';
// Operator-only bootstrap. No real hospital configuration or demo seed is used.
const { createRequire } = require('node:module');
const req = createRequire(`${process.cwd()}/package.json`);
const { PrismaClient } = req('@prisma/client');
const { hash } = req('@node-rs/argon2');
const { isKnownDemoPassword } = req('@redmars/shared');
const { ROLES, PERMISSION_MATRIX, splitPermissionCode } = req(`${process.cwd()}/dist/auth/permissions.js`);
const prisma = new PrismaClient();
async function main() {
  const database = new URL(process.env.DATABASE_URL).pathname;
  if (process.env.ALLOW_TEST_BOOTSTRAP !== 'YES_TEST_ONLY' || database !== '/redmars_testing')
    throw new Error('Only the explicit redmars_testing database is supported.');
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 16 || password.length > 256 || isKnownDemoPassword(password))
    throw new Error('Supply a unique temporary password of 16-256 characters.');
  const passwordHash = await hash(password);
  await prisma.$transaction(async tx => {
    // Serialize two accidental concurrent bootstrap invocations.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(58219023)`;
    if (await tx.facility.count() || await tx.appUser.count())
      throw new Error('Database already has a facility or account. Bootstrap is one-time only.');
    for (const role of ROLES) await tx.role.upsert({ where: { code: role.code }, update: { name: role.name, description: role.description }, create: role });
    for (const code of Object.keys(PERMISSION_MATRIX)) {
      const fields = splitPermissionCode(code);
      await tx.permission.upsert({ where: { code }, update: fields, create: { code, ...fields } });
    }
    const roles = new Map((await tx.role.findMany()).map(r => [r.code, r.id]));
    const permissions = new Map((await tx.permission.findMany()).map(p => [p.code, p.id]));
    await tx.rolePermission.deleteMany({});
    for (const [code, grants] of Object.entries(PERMISSION_MATRIX))
      for (const [role, condition] of Object.entries(grants))
        await tx.rolePermission.create({ data: { roleId: roles.get(role), permissionId: permissions.get(code), condition } });
    const facility = await tx.facility.create({ data: {
      code: 'REDMARS_TEST_ONLY', name: 'REDMARS TESTING - SYNTHETIC ONLY',
      currency: 'AFN', timezone: 'Asia/Kabul',
    } });
    const user = await tx.appUser.create({ data: {
      facilityId: facility.id, username: 'staging.admin',
      fullName: 'Testing Administrator', passwordHash, mustChangePassword: true,
    } });
    await tx.userRole.create({ data: { userId: user.id, roleId: roles.get('admin') } });
  }, { timeout: 60000, maxWait: 10000 });
  console.log('Synthetic testing facility and staging.admin created. Change the temporary password at first login.');
}
main().catch(error => { console.error(`Testing bootstrap refused or failed (${error.name}${error.code ? ':' + error.code : ''}). Check target, password policy and empty-database status; no credentials are logged.`); process.exitCode = 1; }).finally(() => prisma.$disconnect());
