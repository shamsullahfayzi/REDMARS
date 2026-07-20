import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import type {
  CreateUserRequest,
  SetUserActiveRequest,
  UserListResponse,
  UserSummary,
} from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The shape every user response is built from. One place, so the list and the
 * create/deactivate responses cannot describe a user differently — and note there
 * is no passwordHash in it, so a summary physically cannot carry the hash.
 */
const USER_SUMMARY_SELECT = {
  id: true,
  username: true,
  fullName: true,
  email: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  userRoles: { select: { role: { select: { code: true } } } },
} as const;

type UserRow = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  userRoles: Array<{ role: { code: string } }>;
};

function toSummary(user: UserRow): UserSummary {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    isActive: user.isActive,
    roles: user.userRoles.map((ur) => ur.role.code),
    // ISO strings on the wire — the server owns the format, the browser never guesses.
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(facilityId: string): Promise<UserListResponse> {
    const users = await this.prisma.db.appUser.findMany({
      where: { facilityId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: USER_SUMMARY_SELECT,
    });
    return { users: users.map(toSummary) };
  }

  async create(facilityId: string, input: CreateUserRequest): Promise<UserSummary> {
    // Validate the role codes against the roles that actually exist, so a bad code
    // is a clean 400 here rather than a foreign-key explosion mid-transaction.
    const roles = await this.prisma.db.role.findMany({
      where: { code: { in: input.roleCodes } },
    });
    if (roles.length !== new Set(input.roleCodes).size) {
      const found = new Set(roles.map((r) => r.code));
      const missing = input.roleCodes.filter((code) => !found.has(code));
      throw new BadRequestException(`Unknown role(s): ${missing.join(', ')}`);
    }

    // Check the name is free before hashing — argon2 is ~100ms, no point spending
    // it to then reject on a duplicate. The unique index is the real guarantee;
    // this is the friendly error.
    const clash = await this.prisma.db.appUser.findUnique({
      where: { facilityId_username: { facilityId, username: input.username } },
    });
    if (clash) {
      throw new ConflictException(`Username '${input.username}' already exists`);
    }

    const passwordHash = await hash(input.password);

    // One transaction: a user without their roles is the "locked room" — an account
    // that can log in and do nothing. Each role is a separate create (not
    // createMany) so every grant lands in the audit trail as its own row; role
    // assignment is an action that must be attributable.
    const created = await this.prisma.db.$transaction(async (tx) => {
      const user = await tx.appUser.create({
        data: {
          facilityId,
          username: input.username,
          fullName: input.fullName,
          email: input.email,
          passwordHash,
        },
      });
      for (const role of roles) {
        await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
      }
      return user;
    });

    const full = await this.prisma.db.appUser.findUniqueOrThrow({
      where: { id: created.id },
      select: USER_SUMMARY_SELECT,
    });
    return toSummary(full);
  }

  async setActive(
    facilityId: string,
    callerUserId: string,
    targetUserId: string,
    input: SetUserActiveRequest,
  ): Promise<UserSummary> {
    // An admin deactivating the account they are signed in as is a self-lockout,
    // and if they are the last admin it locks everyone out. Refuse it. Re-enabling
    // yourself is impossible anyway (you would be logged out), so this only guards
    // the deactivate direction.
    if (targetUserId === callerUserId && !input.isActive) {
      throw new BadRequestException('You cannot deactivate your own account.');
    }

    // Scoped to the caller's facility: a user id from another tenant must read as
    // "not found", never be reachable.
    const user = await this.prisma.db.appUser.findFirst({
      where: { id: targetUserId, facilityId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.db.appUser.update({
      where: { id: targetUserId },
      data: { isActive: input.isActive },
    });

    const full = await this.prisma.db.appUser.findUniqueOrThrow({
      where: { id: targetUserId },
      select: USER_SUMMARY_SELECT,
    });
    return toSummary(full);
  }
}
