import { BadRequestException, NotFoundException } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import { isKnownDemoPassword } from '@redmars/shared';
import type { PrismaService } from '../prisma/prisma.service';

export function rejectDemoPassword(password: string): void {
  if (isKnownDemoPassword(password)) {
    throw new BadRequestException('Choose a password that is not a development or demo password.');
  }
}

/** Shared by Users and HR. Credentials and session revocation must commit together. */
export async function issueTemporaryPassword(
  prisma: PrismaService,
  facilityId: string,
  callerUserId: string,
  targetUserId: string,
  password: string,
): Promise<void> {
  if (callerUserId === targetUserId) {
    throw new BadRequestException('Use Change password for your own account.');
  }
  rejectDemoPassword(password);
  const passwordHash = await hash(password);
  await prisma.db.$transaction(async (tx) => {
    const changed = await tx.appUser.updateMany({
      where: { id: targetUserId, facilityId, deletedAt: null },
      data: { passwordHash, mustChangePassword: true, credentialVersion: { increment: 1 } },
    });
    if (changed.count !== 1) throw new NotFoundException('User not found');
    await tx.session.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'logout' },
    });
  });
}
