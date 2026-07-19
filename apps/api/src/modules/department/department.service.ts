import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateDepartmentRequest,
  DepartmentListResponse,
  DepartmentSummary,
  DepartmentType,
  SetDepartmentActiveRequest,
} from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The shape every department response is built from. One place, so the list and
 * the create/set-active responses cannot describe a department differently. No
 * facilityId — the browser is single-tenant and never needs it.
 */
const DEPARTMENT_SUMMARY_SELECT = {
  id: true,
  code: true,
  name: true,
  type: true,
  nameLocalPrs: true,
  nameLocalPs: true,
  isActive: true,
  createdAt: true,
} as const;

type DepartmentRow = {
  id: string;
  code: string;
  name: string;
  type: DepartmentType;
  nameLocalPrs: string | null;
  nameLocalPs: string | null;
  isActive: boolean;
  createdAt: Date;
};

function toSummary(dep: DepartmentRow): DepartmentSummary {
  return {
    id: dep.id,
    code: dep.code,
    name: dep.name,
    type: dep.type,
    nameLocalPrs: dep.nameLocalPrs,
    nameLocalPs: dep.nameLocalPs,
    isActive: dep.isActive,
    // ISO string on the wire — the server owns the format, the browser never guesses.
    createdAt: dep.createdAt.toISOString(),
  };
}

@Injectable()
export class DepartmentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every department in the facility, active AND inactive. This is the admin
   * management screen: a deactivated department must still be listed so it can be
   * reactivated. Filtering it out here would make deactivation a one-way trap.
   */
  async list(facilityId: string): Promise<DepartmentListResponse> {
    const departments = await this.prisma.db.department.findMany({
      where: { facilityId },
      orderBy: { createdAt: 'asc' },
      select: DEPARTMENT_SUMMARY_SELECT,
    });
    return { departments: departments.map(toSummary) };
  }

  async create(facilityId: string, input: CreateDepartmentRequest): Promise<DepartmentSummary> {
    // Friendly duplicate check before the insert. The @@unique(facilityId, code)
    // index is the real guarantee; this turns the race-losing case into a clean
    // 409 instead of a raw constraint error.
    const clash = await this.prisma.db.department.findUnique({
      where: { facilityId_code: { facilityId, code: input.code } },
    });
    if (clash) {
      throw new ConflictException(`Department code '${input.code}' already exists`);
    }

    const created = await this.prisma.db.department.create({
      data: {
        facilityId,
        code: input.code,
        name: input.name,
        type: input.type,
        nameLocalPrs: input.nameLocalPrs ?? null,
        nameLocalPs: input.nameLocalPs ?? null,
      },
      select: DEPARTMENT_SUMMARY_SELECT,
    });
    return toSummary(created);
  }

  async setActive(
    facilityId: string,
    id: string,
    input: SetDepartmentActiveRequest,
  ): Promise<DepartmentSummary> {
    // Scoped to the caller's facility: an id from another tenant reads as "not
    // found", never reachable.
    const department = await this.prisma.db.department.findFirst({
      where: { id, facilityId },
      select: { id: true },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const updated = await this.prisma.db.department.update({
      where: { id },
      data: { isActive: input.isActive },
      select: DEPARTMENT_SUMMARY_SELECT,
    });
    return toSummary(updated);
  }
}
