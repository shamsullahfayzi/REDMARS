import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { DepartmentType, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { LoginResponse } from '@redmars/shared';
import { AppModule } from './../src/app.module';

const prisma = new PrismaClient();
const PREFIX = 'e2e_staff_account_';
const PASSWORD = 'e2e-test-password-not-a-secret';
const DOCTOR_PASSWORD = 'doctor-password-123';

describe('Employee account onboarding (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let facilityId: string;
  let adminId: string;
  let employeeId: string;
  let doctorUserId: string | undefined;
  let adminToken: string;

  jest.setTimeout(60_000);

  async function cleanup(): Promise<void> {
    await prisma.auditLog.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.practitioner.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.employee.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.position.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.appUser.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.department.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.auditLog.deleteMany({ where: { facility: { code: { startsWith: PREFIX } } } });
    await prisma.facility.deleteMany({ where: { code: { startsWith: PREFIX } } });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    await cleanup();
    const facility = await prisma.facility.create({
      data: { code: `${PREFIX}facility`, name: 'E2E Staff Account Facility' },
    });
    facilityId = facility.id;
    await prisma.facilityModule.create({
      data: { facilityId, module: 'hr', enabled: true, enabledAt: new Date() },
    });
    const department = await prisma.department.create({
      data: {
        facilityId,
        code: `${PREFIX}opd`,
        name: 'E2E OPD',
        type: DepartmentType.opd,
      },
    });
    const admin = await prisma.appUser.create({
      data: {
        facilityId,
        username: `${PREFIX}admin`,
        fullName: 'E2E Staff Admin',
        passwordHash: await hash(PASSWORD),
      },
    });
    adminId = admin.id;
    const adminRole = await prisma.role.upsert({
      where: { code: 'admin' },
      create: { code: 'admin', name: 'Administrator' },
      update: {},
    });
    await prisma.role.upsert({
      where: { code: 'doctor' },
      create: { code: 'doctor', name: 'Doctor' },
      update: {},
    });
    const createUserPermission = await prisma.permission.upsert({
      where: { code: 'user.create' },
      create: { code: 'user.create', resource: 'user', action: 'create' },
      update: {},
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: createUserPermission.id,
        },
      },
      create: { roleId: adminRole.id, permissionId: createUserPermission.id },
      update: {},
    });
    await prisma.userRole.create({ data: { userId: adminId, roleId: adminRole.id } });
    const position = await prisma.position.create({
      data: {
        facilityId,
        titleEn: `${PREFIX}Psychiatrist`,
        isClinical: true,
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
    const employee = await prisma.employee.create({
      data: {
        facilityId,
        employeeNo: `${PREFIX}001`,
        firstName: 'Mina',
        lastName: 'Rahimi',
        sex: 'female',
        phone: '+93700000000',
        departmentId: department.id,
        positionId: position.id,
        employmentType: 'permanent',
        joinedOn: new Date('2026-01-01T00:00:00.000Z'),
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
    employeeId = employee.id;
    const login = await request(server)
      .post('/auth/login')
      .send({ username: `${PREFIX}admin`, password: PASSWORD })
      .expect(200);
    adminToken = (login.body as LoginResponse).accessToken;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  async function extraEmployee(
    suffix: string,
    status: 'active' | 'exited' | 'suspended' = 'active',
  ) {
    const source = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
    return prisma.employee.create({
      data: {
        facilityId,
        employeeNo: `${PREFIX}${suffix}`,
        firstName: 'Test',
        lastName: suffix,
        sex: 'female',
        phone: '+93700000000',
        departmentId: source.departmentId,
        positionId: source.positionId,
        employmentType: 'permanent',
        joinedOn: source.joinedOn,
        status,
        createdBy: adminId,
        updatedBy: adminId,
        ...(status === 'exited'
          ? { exitDate: new Date('2026-10-27T00:00:00Z'), exitReason: 'Synthetic regression test' }
          : {}),
      },
    });
  }

  it('refuses account creation for exited and suspended employees', async () => {
    for (const status of ['exited', 'suspended'] as const) {
      const employee = await extraEmployee(status, status);
      await request(server)
        .post(`/employees/${employee.id}/account`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username: `${PREFIX}${status}`, password: DOCTOR_PASSWORD, roleCodes: ['doctor'] })
        .expect(400);
      expect(await prisma.appUser.count({ where: { username: `${PREFIX}${status}` } })).toBe(0);
    }
  });

  it('rolls back the losing account when two requests onboard one employee', async () => {
    const employee = await extraEmployee('race');
    const usernames = [`${PREFIX}race_a`, `${PREFIX}race_b`];
    const responses = await Promise.all(
      usernames.map((username) =>
        request(server)
          .post(`/employees/${employee.id}/account`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ username, password: DOCTOR_PASSWORD, roleCodes: ['doctor'] }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const users = await prisma.appUser.findMany({
      where: { username: { in: usernames }, facilityId },
    });
    expect(users).toHaveLength(1);
    const linked = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } });
    expect(linked.userId).toBe(users[0].id);
    expect(
      await prisma.practitioner.count({ where: { facilityId, code: employee.employeeNo } }),
    ).toBe(1);
  });

  it('creates a doctor login, practitioner and department link atomically', async () => {
    const response = await request(server)
      .post(`/employees/${employeeId}/account`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: `${PREFIX}doctor`,
        password: DOCTOR_PASSWORD,
        roleCodes: ['doctor'],
      })
      .expect(201);

    const body = response.body as {
      id: string;
      roleCodes: string[];
      practitionerId: string;
    };
    doctorUserId = body.id;
    expect(body.roleCodes).toEqual(['doctor']);
    expect(body.practitionerId).toEqual(expect.any(String));

    const employee = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
    const practitioner = await prisma.practitioner.findUniqueOrThrow({
      where: { userId: doctorUserId },
      include: { departments: true },
    });
    expect(employee.userId).toBe(doctorUserId);
    expect(practitioner.code).toBe(`${PREFIX}001`);
    expect(practitioner.departments).toHaveLength(1);

    const login = await request(server)
      .post('/auth/login')
      .send({ username: `${PREFIX}doctor`, password: DOCTOR_PASSWORD })
      .expect(200);
    expect((login.body as LoginResponse).accessToken.length).toBeGreaterThan(0);
    expect((login.body as LoginResponse).user.mustChangePassword).toBe(true);
    await request(server)
      .get('/patients')
      .set('Authorization', `Bearer ${(login.body as LoginResponse).accessToken}`)
      .expect(403);
  });

  it('HR reset requires a first-login change and revokes the doctor session', async () => {
    const login = await request(server)
      .post('/auth/login')
      .send({ username: `${PREFIX}doctor`, password: DOCTOR_PASSWORD })
      .expect(200);
    await request(server)
      .post(`/employees/${employeeId}/account/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: DOCTOR_PASSWORD })
      .expect(201);
    await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${(login.body as LoginResponse).accessToken}`)
      .expect(401);
    const updated = await prisma.appUser.findUniqueOrThrow({ where: { id: doctorUserId } });
    expect(updated.mustChangePassword).toBe(true);
    expect(updated.credentialVersion).toBe(1);
  });

  it('revokes access on exit and refuses to reactivate the exited account', async () => {
    await request(server)
      .post(`/employees/${employeeId}/exit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ exitDate: '2026-10-27', exitReason: 'Synthetic regression test' })
      .expect(201);
    expect((await prisma.appUser.findUniqueOrThrow({ where: { id: doctorUserId } })).isActive).toBe(
      false,
    );
    expect(await prisma.session.count({ where: { userId: doctorUserId, revokedAt: null } })).toBe(
      0,
    );
    await request(server)
      .patch(`/employees/${employeeId}/account/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: true })
      .expect(400);
    await request(server)
      .patch(`/users/${doctorUserId}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true })
      .expect(400);
    await request(server)
      .post('/auth/login')
      .send({ username: `${PREFIX}doctor`, password: DOCTOR_PASSWORD })
      .expect(401);
  });
});
