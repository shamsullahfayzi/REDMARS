import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import { Prisma } from '@prisma/client';
import type { AuthContext } from '../../auth/auth-context';
import { PrismaService } from '../../prisma/prisma.service';
import { issueTemporaryPassword, rejectDemoPassword } from '../../auth/temporary-password';
import { NumberSequenceService } from '../../services/number-sequence.service';
import type {
  CreateEmployee,
  EmployeeQuery,
  HrConfig,
  SaveHrCredential,
  UpdateEmployee,
} from '@redmars/shared';
import { credentialState, dateOnly, dateString } from './hr-rules';

const EMPLOYEE_INCLUDE = {
  department: { select: { name: true } },
  position: { select: { titleEn: true, isClinical: true } },
  documents: { where: { voidedAt: null }, orderBy: { createdAt: 'desc' as const } },
  credentials: { where: { voidedAt: null }, orderBy: { expiresOn: 'asc' as const } },
} satisfies Prisma.EmployeeInclude;
type EmployeeRow = Prisma.EmployeeGetPayload<{ include: typeof EMPLOYEE_INCLUDE }>;

const fullName = (
  row: Pick<EmployeeRow, 'firstName' | 'fatherName' | 'grandfatherName' | 'lastName'>,
) => [row.firstName, row.fatherName, row.grandfatherName, row.lastName].filter(Boolean).join(' ');
const docView = (d: EmployeeRow['documents'][number]) => ({
  id: d.id,
  employeeId: d.employeeId,
  type: d.type,
  title: d.title,
  fileName: d.fileName,
  mimeType: d.mimeType,
  sizeBytes: d.sizeBytes,
  issuedOn: d.issuedOn ? dateString(d.issuedOn) : null,
  expiresOn: d.expiresOn ? dateString(d.expiresOn) : null,
  note: d.note,
  createdAt: d.createdAt.toISOString(),
});
const credentialView = (c: EmployeeRow['credentials'][number]) => ({
  id: c.id,
  employeeId: c.employeeId,
  type: c.type,
  name: c.name,
  issuingAuthority: c.issuingAuthority,
  referenceNo: c.referenceNo,
  issuedOn: c.issuedOn ? dateString(c.issuedOn) : null,
  expiresOn: c.expiresOn ? dateString(c.expiresOn) : null,
  blocksClinicalWork: c.blocksClinicalWork,
  documentId: c.documentId,
  note: c.note,
  ...credentialState(c.expiresOn),
});

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: NumberSequenceService,
  ) {}

  private employeeView(row: EmployeeRow, includeSalary: boolean, detail = false) {
    return {
      id: row.id,
      employeeNo: row.employeeNo,
      userId: row.userId,
      firstName: row.firstName,
      fatherName: row.fatherName,
      grandfatherName: row.grandfatherName,
      lastName: row.lastName,
      fullName: fullName(row),
      sex: row.sex,
      dateOfBirth: row.dateOfBirth ? dateString(row.dateOfBirth) : null,
      nationalId: row.nationalId,
      photoUrl: row.photoUrl,
      phone: row.phone,
      alternatePhone: row.alternatePhone,
      addressProvince: row.addressProvince,
      addressDistrict: row.addressDistrict,
      addressText: row.addressText,
      emergencyName: row.emergencyName,
      emergencyRelation: row.emergencyRelation,
      emergencyPhone: row.emergencyPhone,
      departmentId: row.departmentId,
      departmentName: row.department.name,
      positionId: row.positionId,
      positionTitle: row.position.titleEn,
      reportsToEmployeeId: row.reportsToEmployeeId,
      employmentType: row.employmentType,
      joinedOn: dateString(row.joinedOn),
      contractStartsOn: row.contractStartsOn ? dateString(row.contractStartsOn) : null,
      contractEndsOn: row.contractEndsOn ? dateString(row.contractEndsOn) : null,
      status: row.status,
      exitDate: row.exitDate ? dateString(row.exitDate) : null,
      exitReason: row.exitReason,
      ...(includeSalary
        ? { baseSalaryMinor: row.baseSalaryMinor, salaryCurrency: row.salaryCurrency }
        : {}),
      notes: row.notes,
      ...(detail
        ? {
            documents: row.documents.map(docView),
            credentials: row.credentials.map(credentialView),
          }
        : {}),
    };
  }

  private async scopedEmployee(auth: AuthContext, id: string): Promise<EmployeeRow> {
    const row = await this.prisma.db.employee.findFirst({
      where: { id, facilityId: auth.facilityId, voidedAt: null },
      include: EMPLOYEE_INCLUDE,
    });
    if (!row) throw new NotFoundException('Employee not found');
    return row;
  }

  private async validateReferences(
    facilityId: string,
    departmentId: string,
    positionId: string,
    managerId?: string | null,
  ) {
    const [department, position, manager] = await Promise.all([
      this.prisma.db.department.count({ where: { id: departmentId, facilityId, isActive: true } }),
      this.prisma.db.position.count({
        where: { id: positionId, facilityId, isActive: true, voidedAt: null },
      }),
      managerId
        ? this.prisma.db.employee.count({
            where: { id: managerId, facilityId, status: { not: 'exited' }, voidedAt: null },
          })
        : Promise.resolve(1),
    ]);
    if (!department) throw new BadRequestException('Department is not active in this facility.');
    if (!position) throw new BadRequestException('Position is not active in this facility.');
    if (!manager)
      throw new BadRequestException(
        'Reporting manager is not an active employee in this facility.',
      );
  }

  async positions(auth: AuthContext) {
    return this.prisma.db.position.findMany({
      where: { facilityId: auth.facilityId, voidedAt: null },
      orderBy: [{ isActive: 'desc' }, { titleEn: 'asc' }],
      select: {
        id: true,
        titleEn: true,
        titlePrs: true,
        titlePs: true,
        category: true,
        isClinical: true,
        isActive: true,
      },
    });
  }

  async createPosition(
    auth: AuthContext,
    input: {
      titleEn: string;
      titlePrs?: string | null;
      titlePs?: string | null;
      category?: string | null;
      isClinical?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.prisma.db.position.create({
      data: {
        facilityId: auth.facilityId,
        ...input,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      },
      select: {
        id: true,
        titleEn: true,
        titlePrs: true,
        titlePs: true,
        category: true,
        isClinical: true,
        isActive: true,
      },
    });
  }

  async updatePosition(auth: AuthContext, id: string, input: Record<string, unknown>) {
    const found = await this.prisma.db.position.findFirst({
      where: { id, facilityId: auth.facilityId, voidedAt: null },
    });
    if (!found) throw new NotFoundException('Position not found');
    return this.prisma.db.position.update({
      where: { id },
      data: { ...input, updatedBy: auth.userId },
      select: {
        id: true,
        titleEn: true,
        titlePrs: true,
        titlePs: true,
        category: true,
        isClinical: true,
        isActive: true,
      },
    });
  }

  async list(auth: AuthContext, input: EmployeeQuery) {
    const where: Prisma.EmployeeWhereInput = {
      facilityId: auth.facilityId,
      voidedAt: null,
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      ...(input.positionId ? { positionId: input.positionId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.employmentType ? { employmentType: input.employmentType } : {}),
      ...(input.q
        ? {
            OR: [
              { employeeNo: { contains: input.q, mode: 'insensitive' } },
              { firstName: { contains: input.q, mode: 'insensitive' } },
              { fatherName: { contains: input.q, mode: 'insensitive' } },
              { lastName: { contains: input.q, mode: 'insensitive' } },
              { phone: { contains: input.q } },
              { nationalId: { contains: input.q } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.db.employee.findMany({
        where,
        include: EMPLOYEE_INCLUDE,
        orderBy: [{ status: 'asc' }, { firstName: 'asc' }],
        skip: (input.page - 1) * 50,
        take: 50,
      }),
      this.prisma.db.employee.count({ where }),
    ]);
    const salary = auth.permissions.has('hr.salary.view');
    if (salary) await this.prisma.recordRead('EmployeeSalary', null);
    return { items: items.map((r) => this.employeeView(r, salary)), total, page: input.page };
  }

  async detail(auth: AuthContext, id: string) {
    const row = await this.scopedEmployee(auth, id);
    const salary = auth.permissions.has('hr.salary.view') || row.userId === auth.userId;
    if (salary) await this.prisma.recordRead('EmployeeSalary', row.id);
    return this.employeeView(row, salary, true);
  }

  async me(auth: AuthContext) {
    const row = await this.prisma.db.employee.findFirst({
      where: { facilityId: auth.facilityId, userId: auth.userId, voidedAt: null },
      include: EMPLOYEE_INCLUDE,
    });
    if (!row)
      throw new NotFoundException({
        code: 'employee_profile_missing',
        message: 'Your account is not linked to an employee record.',
      });
    await this.prisma.recordRead('EmployeeSalary', row.id);
    return this.employeeView(row, true, true);
  }

  async create(auth: AuthContext, input: CreateEmployee) {
    await this.validateReferences(
      auth.facilityId,
      input.departmentId,
      input.positionId,
      input.reportsToEmployeeId,
    );
    if (
      input.baseSalaryMinor !== undefined &&
      input.baseSalaryMinor !== null &&
      !auth.permissions.has('hr.salary.edit')
    )
      throw new ForbiddenException();
    const created = await this.prisma.db.$transaction(async (tx) => {
      const no = await this.sequences.next(auth.facilityId, 'employee_no', new Date(), tx);
      return tx.employee.create({
        data: {
          facilityId: auth.facilityId,
          employeeNo: no.formatted,
          ...input,
          dateOfBirth: input.dateOfBirth ? dateOnly(input.dateOfBirth) : null,
          joinedOn: dateOnly(input.joinedOn),
          contractStartsOn: input.contractStartsOn ? dateOnly(input.contractStartsOn) : null,
          contractEndsOn: input.contractEndsOn ? dateOnly(input.contractEndsOn) : null,
          createdBy: auth.userId,
          updatedBy: auth.userId,
        },
        include: EMPLOYEE_INCLUDE,
      });
    });
    return this.employeeView(created, auth.permissions.has('hr.salary.view'), true);
  }

  async update(auth: AuthContext, id: string, input: UpdateEmployee) {
    const existing = await this.scopedEmployee(auth, id);
    await this.validateReferences(
      auth.facilityId,
      input.departmentId ?? existing.departmentId,
      input.positionId ?? existing.positionId,
      input.reportsToEmployeeId === undefined
        ? existing.reportsToEmployeeId
        : input.reportsToEmployeeId,
    );
    if (input.reportsToEmployeeId === id)
      throw new BadRequestException('An employee cannot report to themself.');
    if ('baseSalaryMinor' in input && !auth.permissions.has('hr.salary.edit'))
      throw new ForbiddenException();
    const data: Prisma.EmployeeUncheckedUpdateInput = {
      ...input,
      updatedBy: auth.userId,
      ...(input.dateOfBirth !== undefined
        ? { dateOfBirth: input.dateOfBirth ? dateOnly(input.dateOfBirth) : null }
        : {}),
      ...(input.joinedOn !== undefined ? { joinedOn: dateOnly(input.joinedOn) } : {}),
      ...(input.contractStartsOn !== undefined
        ? { contractStartsOn: input.contractStartsOn ? dateOnly(input.contractStartsOn) : null }
        : {}),
      ...(input.contractEndsOn !== undefined
        ? { contractEndsOn: input.contractEndsOn ? dateOnly(input.contractEndsOn) : null }
        : {}),
    };
    const row = await this.prisma.db.employee.update({
      where: { id },
      data,
      include: EMPLOYEE_INCLUDE,
    });
    return this.employeeView(row, auth.permissions.has('hr.salary.view'), true);
  }

  async exit(auth: AuthContext, id: string, input: { exitDate: string; exitReason: string }) {
    await this.prisma.db.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id, facilityId: auth.facilityId, voidedAt: null },
      });
      if (!employee) throw new NotFoundException('Employee not found');
      if (employee.status === 'exited') throw new ConflictException('Employee has already exited.');
      await tx.employee.update({
        where: { id },
        data: {
          status: 'exited',
          exitDate: dateOnly(input.exitDate),
          exitReason: input.exitReason,
          updatedBy: auth.userId,
        },
      });
      if (employee.userId) {
        await tx.appUser.update({ where: { id: employee.userId }, data: { isActive: false } });
        await tx.session.updateMany({
          where: { userId: employee.userId, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'deactivated' },
        });
      }
    });
    return this.detail(auth, id);
  }

  async addDocument(
    auth: AuthContext,
    employeeId: string,
    meta: { type: string; title: string; issuedOn?: string; expiresOn?: string; note?: string },
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    await this.scopedEmployee(auth, employeeId);
    if (!file?.buffer || file.size > 10 * 1024 * 1024)
      throw new BadRequestException('A file up to 10 MB is required.');
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.mimetype))
      throw new BadRequestException('Only PDF, JPEG and PNG documents are allowed.');
    const d = await this.prisma.db.employeeDocument.create({
      data: {
        facilityId: auth.facilityId,
        employeeId,
        type: meta.type as never,
        title: meta.title,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        content: Uint8Array.from(file.buffer),
        issuedOn: meta.issuedOn ? dateOnly(meta.issuedOn) : null,
        expiresOn: meta.expiresOn ? dateOnly(meta.expiresOn) : null,
        note: meta.note || null,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      },
    });
    return docView(d);
  }

  async document(auth: AuthContext, employeeId: string, documentId: string) {
    const d = await this.prisma.db.employeeDocument.findFirst({
      where: { id: documentId, employeeId, facilityId: auth.facilityId, voidedAt: null },
    });
    if (!d) throw new NotFoundException('Document not found');
    await this.prisma.recordRead('EmployeeDocument', d.id);
    return d;
  }

  async removeDocument(auth: AuthContext, employeeId: string, documentId: string) {
    const d = await this.document(auth, employeeId, documentId);
    await this.prisma.db.employeeDocument.update({
      where: { id: d.id },
      data: {
        voidedAt: new Date(),
        voidedBy: auth.userId,
        voidReason: 'Removed by HR',
        updatedBy: auth.userId,
      },
    });
    return { ok: true };
  }

  async credentials(auth: AuthContext, state?: string) {
    const rows = await this.prisma.db.credential.findMany({
      where: { facilityId: auth.facilityId, voidedAt: null },
      include: { employee: true },
      orderBy: { expiresOn: 'asc' },
    });
    const items = rows.map((c) => ({
      ...credentialView(c as EmployeeRow['credentials'][number]),
      employeeName: fullName(c.employee as EmployeeRow),
    }));
    return state ? items.filter((c) => c.state === state) : items;
  }

  async addCredential(auth: AuthContext, employeeId: string, input: SaveHrCredential) {
    await this.scopedEmployee(auth, employeeId);
    const c = await this.prisma.db.credential.create({
      data: {
        facilityId: auth.facilityId,
        employeeId,
        ...input,
        issuedOn: input.issuedOn ? dateOnly(input.issuedOn) : null,
        expiresOn: input.expiresOn ? dateOnly(input.expiresOn) : null,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      },
    });
    return credentialView(c);
  }

  async updateCredential(auth: AuthContext, id: string, input: Partial<SaveHrCredential>) {
    const found = await this.prisma.db.credential.findFirst({
      where: { id, facilityId: auth.facilityId, voidedAt: null },
    });
    if (!found) throw new NotFoundException('Credential not found');
    const c = await this.prisma.db.credential.update({
      where: { id },
      data: {
        ...input,
        ...(input.issuedOn !== undefined
          ? { issuedOn: input.issuedOn ? dateOnly(input.issuedOn) : null }
          : {}),
        ...(input.expiresOn !== undefined
          ? { expiresOn: input.expiresOn ? dateOnly(input.expiresOn) : null }
          : {}),
        updatedBy: auth.userId,
      },
    });
    return credentialView(c);
  }

  async removeCredential(auth: AuthContext, id: string) {
    const found = await this.prisma.db.credential.findFirst({
      where: { id, facilityId: auth.facilityId, voidedAt: null },
    });
    if (!found) throw new NotFoundException('Credential not found');
    await this.prisma.db.credential.update({
      where: { id },
      data: {
        voidedAt: new Date(),
        voidedBy: auth.userId,
        voidReason: 'Removed by HR',
        updatedBy: auth.userId,
      },
    });
    return { ok: true };
  }

  async runCredentialReminders(auth: AuthContext) {
    const config = await this.getConfig(auth);
    const rows = await this.prisma.db.credential.findMany({
      where: { facilityId: auth.facilityId, expiresOn: { not: null }, voidedAt: null },
      include: { employee: true },
    });
    let created = 0;
    for (const row of rows) {
      const { daysUntilExpiry } = credentialState(row.expiresOn);
      if (daysUntilExpiry === null) continue;
      const threshold =
        daysUntilExpiry < 0 ? -1 : config.credentialReminderDays.find((d) => daysUntilExpiry === d);
      if (threshold === undefined) continue;
      const exists = await this.prisma.db.credentialReminder.findUnique({
        where: { credentialId_threshold: { credentialId: row.id, threshold } },
      });
      if (exists) continue;
      const recipients = await this.prisma.db.appUser.findMany({
        where: {
          facilityId: auth.facilityId,
          isActive: true,
          deletedAt: null,
          userRoles: { some: { role: { code: 'admin' } } },
        },
        select: { id: true },
      });
      await this.prisma.db.$transaction(async (tx) => {
        await tx.credentialReminder.create({
          data: {
            facilityId: auth.facilityId,
            credentialId: row.id,
            threshold,
            recipients: recipients.map((r) => r.id),
          },
        });
        if (recipients.length)
          await tx.hrNotification.createMany({
            data: recipients.map((r) => ({
              facilityId: auth.facilityId,
              recipientUserId: r.id,
              type: 'credential_expiry',
              title: 'Credential expiry',
              message: `${fullName(row.employee as EmployeeRow)}: ${row.name}`,
              payload: { credentialId: row.id, daysUntilExpiry },
            })),
          });
      });
      created++;
    }
    return { checked: rows.length, created };
  }

  async getConfig(auth: AuthContext): Promise<HrConfig> {
    const row = await this.prisma.db.setting.findUnique({
      where: { facilityId_key: { facilityId: auth.facilityId, key: 'hr.config' } },
    });
    return {
      weeklyRestDays: [],
      leavePastEntryDays: 7,
      maxConsecutiveNightShifts: 3,
      credentialReminderDays: [90, 60, 30, 0],
      staffingRequirements: [],
      ...((row?.value as Partial<HrConfig>) ?? {}),
    };
  }

  async setConfig(auth: AuthContext, input: HrConfig) {
    await this.prisma.db.setting.upsert({
      where: { facilityId_key: { facilityId: auth.facilityId, key: 'hr.config' } },
      create: { facilityId: auth.facilityId, key: 'hr.config', value: input },
      update: { value: input },
    });
    return input;
  }

  async createAccount(
    auth: AuthContext,
    employeeId: string,
    input: { username: string; email?: string | null; password: string; roleCodes: string[] },
  ) {
    const employee = await this.scopedEmployee(auth, employeeId);
    if (employee.userId) throw new ConflictException('Employee already has a user account.');
    if (employee.status === 'exited' || employee.status === 'suspended') {
      throw new BadRequestException('An exited or suspended employee cannot receive a login.');
    }
    const roles = await this.prisma.db.role.findMany({ where: { code: { in: input.roleCodes } } });
    if (roles.length !== new Set(input.roleCodes).size)
      throw new BadRequestException('One or more roles are invalid.');
    const createsDoctor = roles.some((role) => role.code === 'doctor');
    if (createsDoctor && !employee.position.isClinical) {
      throw new BadRequestException({
        code: 'clinical_position_required',
        message: 'A doctor account can only be assigned to an employee in a clinical position.',
      });
    }
    const usernameClash = await this.prisma.db.appUser.findUnique({
      where: {
        facilityId_username: { facilityId: auth.facilityId, username: input.username },
      },
      select: { id: true },
    });
    if (usernameClash) throw new ConflictException('That username is already in use.');

    // Employee number is the stable shared identifier between HR and the clinical
    // practitioner directory. Reuse a profile created earlier with that code; this
    // avoids a second doctor record when HR onboarding happens after master-data setup.
    const existingPractitioner = createsDoctor
      ? await this.prisma.db.practitioner.findUnique({
          where: {
            facilityId_code: { facilityId: auth.facilityId, code: employee.employeeNo },
          },
          select: { id: true, userId: true },
        })
      : null;
    if (existingPractitioner?.userId) {
      throw new ConflictException('This employee number already belongs to a linked practitioner.');
    }

    rejectDemoPassword(input.password);
    const passwordHash = await hash(input.password);
    return this.prisma.db.$transaction(async (tx) => {
      const current = await tx.employee.findFirst({
        where: {
          id: employeeId,
          facilityId: auth.facilityId,
          userId: null,
          voidedAt: null,
          status: { in: ['active', 'on_leave'] },
        },
        include: { position: true },
      });
      if (!current || (createsDoctor && !current.position.isClinical)) {
        throw new ConflictException('Employee changed. Reload before creating an account.');
      }
      if (existingPractitioner) {
        const profile = await tx.practitioner.findFirst({
          where: {
            id: existingPractitioner.id,
            facilityId: auth.facilityId,
            userId: null,
            deletedAt: null,
          },
        });
        if (!profile)
          throw new ConflictException('Practitioner already has an account or was removed.');
      }
      const user = await tx.appUser.create({
        data: {
          facilityId: auth.facilityId,
          username: input.username,
          email: input.email,
          fullName: fullName(employee),
          passwordHash,
          mustChangePassword: true,
        },
      });
      await tx.userRole.createMany({
        data: roles.map((role) => ({ userId: user.id, roleId: role.id })),
      });
      await tx.employee.update({
        where: { id: employeeId },
        data: { userId: user.id, updatedBy: auth.userId },
      });

      let practitionerId: string | null = null;
      if (createsDoctor) {
        const professionalLicense = employee.credentials.find(
          (credential) => credential.type === 'professional_license' && credential.referenceNo,
        );
        const practitioner = existingPractitioner
          ? await tx.practitioner.update({
              where: { id: existingPractitioner.id },
              data: {
                userId: user.id,
                firstName: employee.firstName,
                lastName: employee.lastName ?? employee.fatherName ?? '',
                licenseNo: professionalLicense?.referenceNo ?? null,
                phone: employee.phone,
                isActive: employee.status === 'active',
              },
            })
          : await tx.practitioner.create({
              data: {
                facilityId: auth.facilityId,
                userId: user.id,
                code: employee.employeeNo,
                firstName: employee.firstName,
                lastName: employee.lastName ?? employee.fatherName ?? '',
                licenseNo: professionalLicense?.referenceNo ?? null,
                phone: employee.phone,
                isActive: employee.status === 'active',
              },
            });
        practitionerId = practitioner.id;
        await tx.practitionerDepartment.upsert({
          where: {
            practitionerId_departmentId: {
              practitionerId: practitioner.id,
              departmentId: employee.departmentId,
            },
          },
          create: { practitionerId: practitioner.id, departmentId: employee.departmentId },
          update: {},
        });
      }

      return {
        id: user.id,
        username: user.username,
        active: user.isActive,
        roleCodes: roles.map((r) => r.code),
        practitionerId,
      };
    });
  }

  async setAccountActive(auth: AuthContext, employeeId: string, active: boolean) {
    await this.prisma.db.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, facilityId: auth.facilityId, voidedAt: null },
      });
      if (!employee?.userId) throw new NotFoundException('Employee has no user account.');
      if (employee.userId === auth.userId && !active)
        throw new BadRequestException('You cannot deactivate your own account.');
      if (active && (employee.status === 'exited' || employee.status === 'suspended'))
        throw new BadRequestException(
          'An exited or suspended employee cannot have an active login.',
        );
      await tx.appUser.update({ where: { id: employee.userId! }, data: { isActive: active } });
      if (!active)
        await tx.session.updateMany({
          where: { userId: employee.userId!, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'deactivated' },
        });
    });
    return { active };
  }

  async resetPassword(auth: AuthContext, employeeId: string, password: string) {
    const employee = await this.scopedEmployee(auth, employeeId);
    if (!employee.userId) throw new NotFoundException('Employee has no user account.');
    await issueTemporaryPassword(
      this.prisma,
      auth.facilityId,
      auth.userId,
      employee.userId,
      password,
    );
    return { ok: true };
  }

  async orphans(auth: AuthContext) {
    const [users, employees] = await Promise.all([
      this.prisma.db.appUser.findMany({
        where: { facilityId: auth.facilityId, deletedAt: null, employee: null },
        select: { id: true, username: true, fullName: true, isActive: true },
      }),
      this.prisma.db.employee.findMany({
        where: {
          facilityId: auth.facilityId,
          userId: null,
          status: { not: 'exited' },
          voidedAt: null,
        },
        select: { id: true, employeeNo: true, firstName: true, fatherName: true, lastName: true },
      }),
    ]);
    return {
      users,
      employees: employees.map((e) => ({
        ...e,
        fullName: [e.firstName, e.fatherName, e.lastName].filter(Boolean).join(' '),
      })),
    };
  }
}
