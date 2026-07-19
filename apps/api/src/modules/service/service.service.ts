import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateServiceRequest,
  ServiceListResponse,
  ServiceSummary,
  SetActiveRequest,
  UpdateServiceRequest,
} from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

const SERVICE_SELECT = {
  id: true,
  departmentId: true,
  code: true,
  name: true,
  fee: true,
  isActive: true,
} as const;

type ServiceRow = {
  id: string;
  departmentId: string;
  code: string;
  name: string;
  fee: Prisma.Decimal;
  isActive: boolean;
};

function toSummary(row: ServiceRow): ServiceSummary {
  return {
    id: row.id,
    departmentId: row.departmentId,
    code: row.code,
    name: row.name,
    // Always two places on the wire. toFixed on a Prisma.Decimal keeps exact money
    // — never a float.
    fee: row.fee.toFixed(2),
    isActive: row.isActive,
  };
}

@Injectable()
export class ServiceCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(facilityId: string): Promise<ServiceListResponse> {
    const services = await this.prisma.db.service.findMany({
      where: { facilityId },
      orderBy: { code: 'asc' },
      select: SERVICE_SELECT,
    });
    return { services: services.map(toSummary) };
  }

  async create(facilityId: string, input: CreateServiceRequest): Promise<ServiceSummary> {
    const department = await this.prisma.db.department.findFirst({
      where: { id: input.departmentId, facilityId },
      select: { id: true },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const clash = await this.prisma.db.service.findUnique({
      where: { facilityId_code: { facilityId, code: input.code } },
    });
    if (clash) {
      throw new ConflictException(`Service code '${input.code}' already exists`);
    }

    const created = await this.prisma.db.service.create({
      data: {
        facilityId,
        departmentId: input.departmentId,
        code: input.code,
        name: input.name,
        // A string into a Decimal column: Prisma parses it exactly, no float step.
        fee: new Prisma.Decimal(input.fee),
      },
      select: SERVICE_SELECT,
    });
    return toSummary(created);
  }

  async update(
    facilityId: string,
    id: string,
    input: UpdateServiceRequest,
  ): Promise<ServiceSummary> {
    await this.assertServiceInFacility(facilityId, id);
    const updated = await this.prisma.db.service.update({
      where: { id },
      data: { name: input.name, fee: new Prisma.Decimal(input.fee) },
      select: SERVICE_SELECT,
    });
    return toSummary(updated);
  }

  async setActive(
    facilityId: string,
    id: string,
    input: SetActiveRequest,
  ): Promise<ServiceSummary> {
    await this.assertServiceInFacility(facilityId, id);
    const updated = await this.prisma.db.service.update({
      where: { id },
      data: { isActive: input.isActive },
      select: SERVICE_SELECT,
    });
    return toSummary(updated);
  }

  private async assertServiceInFacility(facilityId: string, id: string): Promise<void> {
    const service = await this.prisma.db.service.findFirst({
      where: { id, facilityId },
      select: { id: true },
    });
    if (!service) {
      throw new NotFoundException('Service not found');
    }
  }
}
