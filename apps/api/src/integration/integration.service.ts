import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationEvent } from '@prisma/client';
import { PrismaService, AuditedTx } from '../prisma/prisma.service';
import { requestContext } from '../audit/request-context';

@Injectable()
export class IntegrationService {
  constructor(private readonly prisma: PrismaService) {}

  async pending(facilityId: string, consumer: string, types: string[], limit = 100) {
    this.validateConsumer(consumer);
    if (!types.length || !Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new BadRequestException('Choose event types and a limit between 1 and 500');
    }
    return this.prisma.db.integrationEvent.findMany({
      where: { facilityId, type: { in: types }, receipts: { none: { consumer } } },
      orderBy: [{ sequence: 'asc' }],
      take: limit,
    });
  }

  /** Local database effects only. External delivery needs its own remote idempotency key. */
  async consume(
    facilityId: string,
    consumer: string,
    eventId: string,
    handle: (event: IntegrationEvent, tx: AuditedTx) => Promise<void>,
  ): Promise<boolean> {
    this.validateConsumer(consumer);
    return requestContext.run({ ...requestContext.getStore(), facilityId }, () =>
      this.prisma.db.$transaction(async (tx) => {
        // The unique receipt and serializable transaction reject concurrent delivery.
        // Retry a conflict by event id; all losing local effects roll back.
        const event = await tx.integrationEvent.findFirst({ where: { id: eventId, facilityId } });
        if (!event) throw new NotFoundException('Integration event not found');
        const receipt = await tx.integrationReceipt.findUnique({
          where: { eventId_consumer: { eventId, consumer } },
        });
        if (receipt) return false;
        await tx.integrationReceipt.create({ data: { eventId, consumer } });
        await handle(event, tx);
        return true;
      }),
    );
  }

  private validateConsumer(consumer: string) {
    if (!/^[a-z][a-z0-9._-]{2,79}$/.test(consumer))
      throw new BadRequestException('Invalid consumer name');
  }
}
