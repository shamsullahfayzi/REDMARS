import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import type {
  CreatePractitionerAccountRequest,
  CreatePractitionerRequest,
  PractitionerAccountResult,
  PractitionerListResponse,
  PractitionerSummary,
  SetActiveRequest,
  SetPractitionerDepartmentsRequest,
} from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { rejectDemoPassword } from '../../auth/temporary-password';

const PRACTITIONER_SELECT = {
  id: true,
  code: true,
  firstName: true,
  lastName: true,
  specialityId: true,
  userId: true,
  licenseNo: true,
  phone: true,
  isActive: true,
  speciality: { select: { name: true } },
  departments: { select: { departmentId: true } },
} as const;

type PractitionerRow = {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  specialityId: string | null;
  userId: string | null;
  licenseNo: string | null;
  phone: string | null;
  isActive: boolean;
  speciality: { name: string } | null;
  departments: Array<{ departmentId: string }>;
};

function toSummary(p: PractitionerRow): PractitionerSummary {
  return {
    id: p.id,
    code: p.code,
    firstName: p.firstName,
    lastName: p.lastName,
    specialityId: p.specialityId,
    specialityName: p.speciality?.name ?? null,
    userId: p.userId,
    licenseNo: p.licenseNo,
    phone: p.phone,
    isActive: p.isActive,
    departmentIds: p.departments.map((d) => d.departmentId),
  };
}

@Injectable()
export class PractitionerService {
  constructor(private readonly prisma: PrismaService) {}

  async list(facilityId: string): Promise<PractitionerListResponse> {
    const practitioners = await this.prisma.db.practitioner.findMany({
      where: { facilityId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: PRACTITIONER_SELECT,
    });
    return { practitioners: practitioners.map(toSummary) };
  }

  async create(facilityId: string, input: CreatePractitionerRequest): Promise<PractitionerSummary> {
    await this.assertSpecialityExists(input.specialityId);
    await this.assertUserLinkable(facilityId, input.userId, null);
    await this.assertDepartmentsInFacility(facilityId, input.departmentIds);

    const clash = await this.prisma.db.practitioner.findUnique({
      where: { facilityId_code: { facilityId, code: input.code } },
    });
    if (clash) {
      throw new ConflictException(`Practitioner code '${input.code}' already exists`);
    }

    // One transaction: a practitioner and their department links land together, or
    // not at all. Each link is a separate create (not createMany) so every
    // membership is its own attributable audit row — same reason users grants roles
    // one at a time.
    const created = await this.prisma.db.$transaction(async (tx) => {
      const practitioner = await tx.practitioner.create({
        data: {
          facilityId,
          code: input.code,
          firstName: input.firstName,
          lastName: input.lastName,
          specialityId: input.specialityId ?? null,
          userId: input.userId ?? null,
          licenseNo: input.licenseNo ?? null,
          phone: input.phone ?? null,
        },
      });
      for (const departmentId of input.departmentIds) {
        await tx.practitionerDepartment.create({
          data: { practitionerId: practitioner.id, departmentId },
        });
      }
      return practitioner;
    });

    return this.getSummaryOrThrow(created.id);
  }

  async createAccount(
    facilityId: string,
    id: string,
    input: CreatePractitionerAccountRequest,
  ): Promise<PractitionerAccountResult> {
    const practitioner = await this.prisma.db.practitioner.findFirst({
      where: { id, facilityId, deletedAt: null },
      select: { id: true, userId: true, firstName: true, lastName: true, isActive: true },
    });
    if (!practitioner) throw new NotFoundException('Practitioner not found');
    if (!practitioner.isActive) {
      throw new BadRequestException({
        code: 'inactive_practitioner',
        message: 'Reactivate this practitioner before creating a login account.',
      });
    }
    if (practitioner.userId) {
      throw new ConflictException({
        code: 'practitioner_account_exists',
        message: 'This practitioner already has a linked login account.',
      });
    }
    const clash = await this.prisma.db.appUser.findUnique({
      where: { facilityId_username: { facilityId, username: input.username } },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException({
        code: 'username_exists',
        message: 'That username is already in use.',
      });
    }
    const doctorRole = await this.prisma.db.role.findUnique({ where: { code: 'doctor' } });
    if (!doctorRole) throw new BadRequestException('Doctor role is not configured.');
    rejectDemoPassword(input.password);
    const passwordHash = await hash(input.password);

    const userId = await this.prisma.db.$transaction(async (tx) => {
      const user = await tx.appUser.create({
        data: {
          facilityId,
          username: input.username,
          email: input.email,
          fullName: [practitioner.firstName, practitioner.lastName].filter(Boolean).join(' '),
          passwordHash,
          mustChangePassword: true,
        },
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: doctorRole.id } });
      // The preflight read is only for a helpful response. Claim the link inside
      // the transaction so another request cannot replace it and leave an orphan
      // Doctor account with clinical access.
      const linked = await tx.practitioner.updateMany({
        where: { id, facilityId, userId: null, isActive: true, deletedAt: null },
        data: { userId: user.id },
      });
      if (linked.count !== 1) {
        throw new ConflictException({
          code: 'practitioner_account_changed',
          message: 'This practitioner changed. Reload before creating a login account.',
        });
      }
      return user.id;
    });
    return this.accountResult(id, userId, true);
  }

  async grantDoctorRole(facilityId: string, id: string): Promise<PractitionerAccountResult> {
    const practitioner = await this.prisma.db.practitioner.findFirst({
      where: { id, facilityId, deletedAt: null },
      select: { id: true, userId: true, isActive: true },
    });
    if (!practitioner) throw new NotFoundException('Practitioner not found');
    if (!practitioner.isActive) {
      throw new BadRequestException({
        code: 'inactive_practitioner',
        message: 'Reactivate this practitioner before granting Doctor access.',
      });
    }
    if (!practitioner.userId) {
      throw new BadRequestException({
        code: 'practitioner_account_missing',
        message: 'Create a login account for this practitioner first.',
      });
    }
    const doctorRole = await this.prisma.db.role.findUnique({ where: { code: 'doctor' } });
    if (!doctorRole) throw new BadRequestException('Doctor role is not configured.');
    await this.prisma.db.userRole.upsert({
      where: {
        userId_roleId: { userId: practitioner.userId, roleId: doctorRole.id },
      },
      create: { userId: practitioner.userId, roleId: doctorRole.id },
      update: {},
    });
    return this.accountResult(id, practitioner.userId, false);
  }

  async setActive(
    facilityId: string,
    id: string,
    input: SetActiveRequest,
  ): Promise<PractitionerSummary> {
    await this.assertPractitionerInFacility(facilityId, id);
    await this.prisma.db.practitioner.update({
      where: { id },
      data: { isActive: input.isActive },
    });
    return this.getSummaryOrThrow(id);
  }

  /**
   * Replaces a practitioner's whole department set. This is the edit-memberships
   * action — the point of the task ("doctor in OPD and IPD"). Delete-then-recreate
   * inside one transaction so a half-changed set can never be observed.
   */
  async setDepartments(
    facilityId: string,
    id: string,
    input: SetPractitionerDepartmentsRequest,
  ): Promise<PractitionerSummary> {
    await this.assertPractitionerInFacility(facilityId, id);
    await this.assertDepartmentsInFacility(facilityId, input.departmentIds);

    await this.prisma.db.$transaction(async (tx) => {
      await tx.practitionerDepartment.deleteMany({ where: { practitionerId: id } });
      for (const departmentId of input.departmentIds) {
        await tx.practitionerDepartment.create({ data: { practitionerId: id, departmentId } });
      }
    });

    return this.getSummaryOrThrow(id);
  }

  // --- validation helpers ---------------------------------------------------

  private async assertSpecialityExists(specialityId: string | undefined): Promise<void> {
    if (!specialityId) return;
    // Speciality is global — no facility scope.
    const speciality = await this.prisma.db.speciality.findUnique({
      where: { id: specialityId },
      select: { id: true },
    });
    if (!speciality) {
      throw new BadRequestException('Unknown speciality');
    }
  }

  /**
   * The optional 1:1 to AppUser. The user must exist in this facility, and must
   * not already be another practitioner's account — Practitioner.userId is unique,
   * so a friendly 409 here beats a raw constraint error. `exceptId` lets an edit
   * keep its own existing link.
   */
  private async assertUserLinkable(
    facilityId: string,
    userId: string | undefined,
    exceptId: string | null,
  ): Promise<void> {
    if (!userId) return;

    const user = await this.prisma.db.appUser.findFirst({
      where: { id: userId, facilityId, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException('Unknown user');
    }

    const linked = await this.prisma.db.practitioner.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (linked && linked.id !== exceptId) {
      throw new ConflictException('That user is already linked to a practitioner');
    }
  }

  private async assertDepartmentsInFacility(
    facilityId: string,
    departmentIds: string[],
  ): Promise<void> {
    if (departmentIds.length === 0) return;

    // De-dupe first: a caller sending the same id twice must not pass the count
    // check by coincidence.
    const unique = [...new Set(departmentIds)];
    const found = await this.prisma.db.department.count({
      where: { id: { in: unique }, facilityId },
    });
    if (found !== unique.length) {
      throw new BadRequestException('One or more departments do not exist in this facility');
    }
  }

  private async assertPractitionerInFacility(facilityId: string, id: string): Promise<void> {
    const practitioner = await this.prisma.db.practitioner.findFirst({
      where: { id, facilityId, deletedAt: null },
      select: { id: true },
    });
    if (!practitioner) {
      throw new NotFoundException('Practitioner not found');
    }
  }

  private async getSummaryOrThrow(id: string): Promise<PractitionerSummary> {
    const full = await this.prisma.db.practitioner.findUniqueOrThrow({
      where: { id },
      select: PRACTITIONER_SELECT,
    });
    return toSummary(full);
  }

  private async accountResult(
    practitionerId: string,
    userId: string,
    created: boolean,
  ): Promise<PractitionerAccountResult> {
    const user = await this.prisma.db.appUser.findUniqueOrThrow({
      where: { id: userId },
      select: {
        username: true,
        userRoles: { select: { role: { select: { code: true } } } },
      },
    });
    return {
      practitionerId,
      userId,
      username: user.username,
      roles: user.userRoles.map((entry) => entry.role.code),
      created,
    };
  }
}
