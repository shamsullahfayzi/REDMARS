import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditedTx } from '../prisma/prisma.service';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

/** Invoke INSIDE the command's transaction. A retry returns the original result. */
export async function idempotentCommand<T>(
  tx: AuditedTx,
  scope: { facilityId: string; userId: string; operation: string; key?: string; input: unknown },
  run: () => Promise<T>,
): Promise<T> {
  if (!scope.key) return run(); // compatibility for existing API clients
  const requestHash = createHash('sha256').update(canonical(scope.input)).digest('hex');
  const where = {
    facilityId_userId_operation_key: {
      facilityId: scope.facilityId,
      userId: scope.userId,
      operation: scope.operation,
      key: scope.key,
    },
  };
  const previous = await tx.commandReceipt.findUnique({ where });
  if (previous) {
    if (previous.requestHash !== requestHash)
      throw new ConflictException({
        code: 'idempotency_mismatch',
        message: 'This request key was already used for a different command.',
      });
    return previous.response as T;
  }
  const result = await run();
  await tx.commandReceipt.create({
    data: {
      ...where.facilityId_userId_operation_key,
      requestHash,
      response: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
    },
  });
  return result;
}
