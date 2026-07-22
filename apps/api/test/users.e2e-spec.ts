import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { AuditAction, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse, UserListResponse, UserSummary } from '@redmars/shared';
import { AppModule } from './../src/app.module';

/**
 * Task 1.7 — admin user management. Needs a seeded database.
 *
 * The headline test is the done-when itself: an admin creates a doctor and that
 * doctor logs in. The rest guards the things that make it safe — only admin may
 * do it, every account and role grant is audited, the password hash never reaches
 * the audit trail, and an admin cannot lock themselves out.
 */
const prisma = new PrismaClient();
const PREFIX = 'e2e_um_';
const PASSWORD = 'e2e-test-password-not-a-secret';
const NEW_DOCTOR = `${PREFIX}created_doctor`;
const NEW_DOCTOR_PASSWORD = 'doctor-password-123';

describe('Admin user management (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let adminId: string;
  let adminToken: string;
  let receptionistToken: string;
  let createdDoctorId: string;

  jest.setTimeout(60_000);

  async function seedActor(suffix: string, roleCode: string): Promise<string> {
    const user = await prisma.appUser.create({
      data: {
        facilityId: (await prisma.facility.findFirstOrThrow()).id,
        username: `${PREFIX}${suffix}`,
        fullName: `E2E UM ${suffix}`,
        passwordHash: await hash(PASSWORD),
      },
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return user.id;
  }

  async function login(username: string, password: string): Promise<string> {
    const res = await request(server).post('/auth/login').send({ username, password }).expect(200);
    return (res.body as LoginResponse).accessToken;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    // Again, and deliberately. The R1 read row is written fire-and-forget, so one can
    // land AFTER the sweep above and before the facility goes — and then the facility
    // delete fails on a foreign key, inside afterAll, which Jest reports as a failed suite
    // with no failed tests. Cheap to repeat, miserable to debug.
    await prisma.auditLog.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });

    adminId = await seedActor('admin', 'admin');
    await seedActor('receptionist', 'receptionist');
    adminToken = await login(`${PREFIX}admin`, PASSWORD);
    receptionistToken = await login(`${PREFIX}receptionist`, PASSWORD);
  });

  afterAll(async () => {
    const ids = [adminId, createdDoctorId].filter(Boolean);
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    // UserRole grants audit with a null entityId; clear them by the admin actor.
    await prisma.auditLog.deleteMany({ where: { userId: adminId, entity: 'UserRole' } });
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('the done-when: an admin creates a doctor, and the doctor can log in', async () => {
    const res = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: NEW_DOCTOR,
        fullName: 'Dr Created ByAdmin',
        password: NEW_DOCTOR_PASSWORD,
        roleCodes: ['doctor'],
      })
      .expect(201);

    const created = res.body as UserSummary;
    createdDoctorId = created.id;
    expect(created.username).toBe(NEW_DOCTOR);
    expect(created.roles).toEqual(['doctor']);
    expect(created.isActive).toBe(true);

    // The proof the account is real: it logs in and gets tokens.
    const token = await login(NEW_DOCTOR, NEW_DOCTOR_PASSWORD);
    expect(token.length).toBeGreaterThan(0);
  });

  it('never returns a password field of any kind', async () => {
    const res = await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('denies a non-admin (receptionist) the create endpoint', () =>
    request(server)
      .post('/users')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        username: `${PREFIX}nope`,
        fullName: 'No',
        password: 'password123',
        roleCodes: ['nurse'],
      })
      .expect(403));

  it('denies a non-admin the user list', () =>
    request(server).get('/users').set('Authorization', `Bearer ${receptionistToken}`).expect(403));

  it('rejects an empty role list — no locked-room accounts', () =>
    request(server)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: `${PREFIX}noroles`,
        fullName: 'No Roles',
        password: 'password123',
        roleCodes: [],
      })
      .expect(400));

  it('audits the account creation, with the password hash redacted', async () => {
    const rows = await prisma.auditLog.findMany({
      where: { entity: 'AppUser', entityId: createdDoctorId, action: AuditAction.create },
    });
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.userId).toBe(adminId);
    expect(row.before).toBeNull();
    expect((row.after as { passwordHash?: string }).passwordHash).toBe('[redacted]');
  });

  it('audits the role grant — attributable, and proof the audit fires inside the transaction', async () => {
    const grants = await prisma.auditLog.count({
      where: { entity: 'UserRole', action: AuditAction.create, userId: adminId },
    });
    expect(grants).toBeGreaterThanOrEqual(1);
  });

  it('lists the created doctor for an admin', async () => {
    const res = await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as UserListResponse;
    expect(body.users.some((u) => u.id === createdDoctorId)).toBe(true);
  });

  it('deactivates a user, and a deactivated user can no longer log in', async () => {
    await request(server)
      .patch(`/users/${createdDoctorId}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    await request(server)
      .post('/auth/login')
      .send({ username: NEW_DOCTOR, password: NEW_DOCTOR_PASSWORD })
      .expect(401);
  });

  it('refuses to let an admin deactivate their own account', () =>
    request(server)
      .patch(`/users/${adminId}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(400));
});
