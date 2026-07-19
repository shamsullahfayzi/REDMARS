import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateRoomRequest,
  RoomListResponse,
  RoomSummary,
  SetRoomActiveRequest,
} from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The shape every room response is built from. No facilityId — single-tenant
 * browser — but departmentId stays, because the UI groups rooms under their
 * parent department.
 */
const ROOM_SUMMARY_SELECT = {
  id: true,
  departmentId: true,
  code: true,
  name: true,
  isActive: true,
  createdAt: true,
} as const;

type RoomRow = {
  id: string;
  departmentId: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
};

function toSummary(room: RoomRow): RoomSummary {
  return {
    id: room.id,
    departmentId: room.departmentId,
    code: room.code,
    name: room.name,
    isActive: room.isActive,
    createdAt: room.createdAt.toISOString(),
  };
}

@Injectable()
export class RoomService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every room in the facility, active AND inactive — the admin screen must be
   * able to reactivate a deactivated room. The UI groups these by departmentId.
   */
  async list(facilityId: string): Promise<RoomListResponse> {
    const rooms = await this.prisma.db.room.findMany({
      where: { facilityId },
      orderBy: { createdAt: 'asc' },
      select: ROOM_SUMMARY_SELECT,
    });
    return { rooms: rooms.map(toSummary) };
  }

  async create(facilityId: string, input: CreateRoomRequest): Promise<RoomSummary> {
    // The parent must be a department in THIS facility. A departmentId from
    // another tenant (or a deleted one) reads as "not found" — a room can never
    // be orphaned onto a foreign department.
    const department = await this.prisma.db.department.findFirst({
      where: { id: input.departmentId, facilityId },
      select: { id: true },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }

    // Friendly duplicate check before the insert. @@unique(facilityId, code) is
    // the real guarantee — note code is unique per FACILITY, not per department,
    // so two departments cannot share a room code.
    const clash = await this.prisma.db.room.findUnique({
      where: { facilityId_code: { facilityId, code: input.code } },
    });
    if (clash) {
      throw new ConflictException(`Room code '${input.code}' already exists`);
    }

    const created = await this.prisma.db.room.create({
      data: {
        facilityId,
        departmentId: input.departmentId,
        code: input.code,
        name: input.name,
      },
      select: ROOM_SUMMARY_SELECT,
    });
    return toSummary(created);
  }

  async setActive(
    facilityId: string,
    id: string,
    input: SetRoomActiveRequest,
  ): Promise<RoomSummary> {
    const room = await this.prisma.db.room.findFirst({
      where: { id, facilityId },
      select: { id: true },
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const updated = await this.prisma.db.room.update({
      where: { id },
      data: { isActive: input.isActive },
      select: ROOM_SUMMARY_SELECT,
    });
    return toSummary(updated);
  }
}
