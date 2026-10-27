import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { CollectSampleRequest, CollectSampleResponse } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Phase 5, third slice — collecting the sample.
 *
 * The first write that moves a test's OWN state (ordered → sample_collected) rather than the
 * order as a whole. The bench draws once per patient, so it collects an order's tests
 * together: the request is a set of item ids and the server treats them as one act — either
 * all are drawn or none are, because a half-collected order is a worse record than an
 * uncollected one.
 *
 * PAID BEFORE DRAWN. This is where the billing decision stops being advisory. Axon collects
 * at the window before a sample is taken, and the queue has shown who has paid all along; here
 * the server refuses to draw a test whose invoice is not settled. A test that raised no charge
 * (an unpriced one, no invoice line) is collectable — there was nothing to pay.
 *
 * Only a test still `ordered` can be collected: one already drawn is not drawn twice, and one
 * further along the lab's state machine is not wound back. The final ordered→collected check
 * runs inside the transaction so two benches clicking at once cannot both draw the same
 * sample.
 */

/** The invoice line's refType for a lab charge — see InvoiceItem in the schema. */
const LAB_REF_TYPE = 'lab_order_item';

@Injectable()
export class LabSampleService {
  constructor(private readonly prisma: PrismaService) {}

  async collect(
    facilityId: string,
    userId: string,
    input: CollectSampleRequest,
  ): Promise<CollectSampleResponse> {
    return this.prisma.db.$transaction(async (tx) => {
      const itemIds = [...new Set(input.itemIds)];

      // Scoped to the caller's facility — an id from another facility is simply unknown here.
      const items = await tx.labOrderItem.findMany({
        where: { id: { in: itemIds }, labOrder: { facilityId } },
        select: { id: true, status: true },
      });
      if (items.length !== itemIds.length) {
        throw new BadRequestException({
          message: 'One of those tests is not on this facility’s orders.',
          code: 'unknown_item',
        });
      }

      const notOrdered = items.filter((item) => item.status !== 'ordered');
      if (notOrdered.length > 0) {
        throw new BadRequestException({
          message: 'A sample can only be taken for a test still waiting to be drawn.',
          code: 'not_collectable',
        });
      }

      // The gate, now PER LINE. A test's own charge must be settled before its sample is drawn —
      // not the whole invoice, so paying one test on an order of four frees THAT test and leaves
      // the rest waiting. A line that costs nothing is born paid; a test with no invoice line at
      // all owes nothing either. Only an unpaid priced line closes the door.
      const lines = await tx.invoiceItem.findMany({
        where: { refType: LAB_REF_TYPE, refId: { in: itemIds } },
        select: { refId: true, isPaid: true, invoice: { select: { status: true } } },
      });
      const paidByItem = new Map(
        lines.map((line) => [
          line.refId,
          line.isPaid && line.invoice.status !== 'cancelled' && line.invoice.status !== 'draft',
        ]),
      );
      const unpaid = items.filter((item) => paidByItem.get(item.id) === false);
      if (unpaid.length > 0) {
        throw new BadRequestException({
          message: 'The reception has not been paid for this test yet.',
          code: 'unpaid',
        });
      }

      const now = new Date();
      // Status and payment checks share this transaction with the collection.
      const stillOrdered = await tx.labOrderItem.count({
        where: { id: { in: itemIds }, status: 'ordered' },
      });
      if (stillOrdered !== itemIds.length) {
        throw new ConflictException({
          message: 'One of those samples was just taken by someone else. Reload the queue.',
          code: 'already_collected',
        });
      }
      // Each collected item retains its own audit entry.
      for (const id of itemIds) {
        await tx.labOrderItem.update({
          where: { id },
          data: { status: 'sample_collected', sampleCollectedAt: now, sampleCollectedBy: userId },
        });
      }

      return {
        items: itemIds.map((itemId) => ({
          itemId,
          status: 'sample_collected' as const,
          sampleCollectedAt: now.toISOString(),
        })),
      };
    });
  }
}
