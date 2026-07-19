import { ConflictException, Injectable } from '@nestjs/common';
import type {
  CreateSpecialityRequest,
  SpecialityListResponse,
  SpecialitySummary,
} from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

const SPECIALITY_SELECT = { id: true, code: true, name: true } as const;

type SpecialityRow = { id: string; code: string; name: string };

function toSummary(row: SpecialityRow): SpecialitySummary {
  return { id: row.id, code: row.code, name: row.name };
}

@Injectable()
export class SpecialityService {
  constructor(private readonly prisma: PrismaService) {}

  // No facility scope: Speciality is global reference data shared across hospitals.
  async list(): Promise<SpecialityListResponse> {
    const specialities = await this.prisma.db.speciality.findMany({
      orderBy: { name: 'asc' },
      select: SPECIALITY_SELECT,
    });
    return { specialities: specialities.map(toSummary) };
  }

  async create(input: CreateSpecialityRequest): Promise<SpecialitySummary> {
    // code is globally unique. Friendly 409 before the insert; the unique index is
    // the real guarantee.
    const clash = await this.prisma.db.speciality.findUnique({ where: { code: input.code } });
    if (clash) {
      throw new ConflictException(`Speciality code '${input.code}' already exists`);
    }

    const created = await this.prisma.db.speciality.create({
      data: { code: input.code, name: input.name },
      select: SPECIALITY_SELECT,
    });
    return toSummary(created);
  }
}
