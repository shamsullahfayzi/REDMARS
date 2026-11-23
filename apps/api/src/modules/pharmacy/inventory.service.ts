import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { intakeSchema, stockSettingsSchema, receiptPackSchema } from '@redmars/shared';
import type { z } from 'zod';
import { facilityDateString } from '../../common/facility-time';
import { PrismaService } from '../../prisma/prisma.service';

const today = () => new Date(facilityDateString() + 'T00:00:00Z');
const day = (date: Date) => date.toISOString().slice(0, 10);
const name = (d: {
  genericName: string;
  brandName: string | null;
  strength: string | null;
  form: string | null;
}) => [d.genericName, d.brandName, d.strength, d.form].filter(Boolean).join(' · ');
const usable = (date: Date) => ({
  expiresOn: { gte: date },
  quarantined: false,
  quantity: { gt: 0 },
});
const total = (rows: { quantity: number }[]) => rows.reduce((sum, row) => sum + row.quantity, 0);

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async availability(facilityId: string, ids: string[]) {
    const date = today();
    const drugs = await this.prisma.drug.findMany({
      where: { facilityId, id: { in: ids } },
      select: {
        id: true,
        reorderThreshold: true,
        alternatives: {
          where: { alternative: { facilityId, isActive: true } },
          select: {
            alternative: {
              select: {
                id: true,
                genericName: true,
                brandName: true,
                strength: true,
                form: true,
              },
            },
          },
        },
      },
    });
    const requested = new Set(ids);
    for (const drug of drugs)
      for (const pair of drug.alternatives) requested.add(pair.alternative.id);
    const balances = await this.prisma.pharmacyBatch.groupBy({
      by: ['drugId', 'packaging'],
      where: { drugId: { in: [...requested] }, drug: { facilityId }, ...usable(date) },
      _sum: { quantity: true },
    });
    const units = new Map<string, number>();
    const packets = new Map<string, { size: number; unitName: string } | null>();
    for (const row of balances) {
      units.set(row.drugId, (units.get(row.drugId) ?? 0) + (row._sum.quantity ?? 0));
      const pack = row.packaging ? receiptPackSchema.parse(row.packaging) : null;
      const prior = packets.get(row.drugId);
      if (
        !pack ||
        (prior !== undefined &&
          (prior?.size !== pack.unitsPerPacket ||
            prior.unitName.toLowerCase() !== pack.unitName.toLowerCase()))
      ) {
        packets.set(row.drugId, null);
      } else {
        packets.set(row.drugId, { size: pack.unitsPerPacket, unitName: pack.unitName });
      }
    }
    return drugs.map((d) => ({
      id: d.id,
      reorderThreshold: d.reorderThreshold,
      available: units.get(d.id) ?? 0,
      packet: packets.get(d.id) ?? null,
      alternatives: d.alternatives
        .map(({ alternative: a }) => ({
          id: a.id,
          name: name(a),
          available: units.get(a.id) ?? 0,
        }))
        .filter((a) => a.available > 0),
    }));
  }

  async dashboard(facilityId: string) {
    const date = today();
    const [drugs, suppliers] = await Promise.all([
      this.prisma.drug.findMany({
        where: {
          facilityId,
          OR: [{ isActive: true }, { stockBatches: { some: { quantity: { gt: 0 } } } }],
        },
        orderBy: [{ genericName: 'asc' }, { id: 'asc' }],
        include: {
          alternatives: { select: { alternativeId: true } },
          stockBatches: {
            where: { quantity: { gt: 0 } },
            orderBy: [{ expiresOn: 'asc' }, { id: 'asc' }],
            include: { supplier: { select: { name: true } } },
          },
        },
      }),
      this.prisma.financeSupplier.findMany({
        where: { facilityId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      today: day(date),
      expiryLimit: day(new Date(date.getTime() + 30 * 86400000)),
      suppliers,
      drugs: drugs.map((d) => ({
        id: d.id,
        name: name(d),
        dispensingUnit: d.dispensingUnit,
        reorderThreshold: d.reorderThreshold,
        available: total(d.stockBatches.filter((b) => !b.quarantined && b.expiresOn >= date)),
        alternativeIds: d.alternatives.map((a) => a.alternativeId),
        batches: d.stockBatches.map((b) => ({
          id: b.id,
          lot: b.lot,
          location: b.location,
          expiresOn: day(b.expiresOn),
          quantity: b.quantity,
          quarantined: b.quarantined,
          supplier: b.supplier?.name ?? null,
          packaging: b.packaging ? receiptPackSchema.parse(b.packaging) : null,
        })),
      })),
    };
  }

  async history(facilityId: string, drugId: string, cursor?: string) {
    const where = { batch: { drugId, drug: { facilityId } } };
    if (cursor && !(await this.prisma.pharmacyMovement.count({ where: { ...where, id: cursor } })))
      throw new BadRequestException('Invalid history cursor');
    const rows = await this.prisma.pharmacyMovement.findMany({
      where,
      include: { batch: { select: { lot: true, location: true, packaging: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return {
      movements: rows.slice(0, 50).map((m) => ({
        id: m.id,
        lot: m.batch.lot,
        location: m.batch.location,
        kind: m.kind,
        quantity: m.quantity,
        at: m.createdAt.toISOString(),
        reason: m.reason,
        packaging:
          m.kind === 'receipt' && m.batch.packaging
            ? receiptPackSchema.parse(m.batch.packaging)
            : null,
      })),
      next: rows.length > 50 ? rows[49].id : null,
    };
  }

  async receive(facilityId: string, actorId: string, body: z.infer<typeof intakeSchema>) {
    await this.prisma.db.$transaction(async (tx) => {
      const drug = await tx.drug.findFirst({
        where: { id: body.drugId, facilityId, isActive: true },
      });
      if (!drug) throw new NotFoundException('Active medication not found');
      const prior = await tx.pharmacyBatch.findUnique({
        where: { receiptKey: body.receiptKey },
        include: { movements: { where: { kind: 'receipt' } } },
      });
      if (prior) {
        if (
          prior.drugId === drug.id &&
          prior.supplierId === body.supplierId &&
          prior.lot === body.lot &&
          prior.location === body.location &&
          day(prior.expiresOn) === body.expiresOn &&
          prior.movements[0]?.quantity === body.quantity &&
          JSON.stringify(prior.packaging ? receiptPackSchema.parse(prior.packaging) : null) ===
            JSON.stringify(body.packaging ?? null)
        )
          return;
        throw new ConflictException('Receipt reference already used');
      }
      if (
        body.supplierId &&
        !(await tx.financeSupplier.count({
          where: { id: body.supplierId, facilityId, isActive: true },
        }))
      )
        throw new BadRequestException('Unknown supplier');
      // Package sizes may vary by batch, but every prescription and stock balance
      // for this formulary entry must count the same physical dispensing unit.
      if (body.packaging) {
        const unit = body.packaging.unitName;
        if (drug.dispensingUnit && drug.dispensingUnit.toLowerCase() !== unit.toLowerCase()) {
          throw new BadRequestException(
            'This medication is counted in ' + drug.dispensingUnit + '.',
          );
        }
        if (!drug.dispensingUnit) {
          await tx.drug.update({ where: { id: drug.id }, data: { dispensingUnit: unit } });
        }
      }
      const batch = await tx.pharmacyBatch.create({
        data: { ...body, expiresOn: new Date(body.expiresOn) },
      });
      await tx.pharmacyMovement.create({
        data: { batchId: batch.id, actorId, kind: 'receipt', quantity: body.quantity },
      });
    });
    return { ok: true };
  }

  async settings(facilityId: string, id: string, body: z.infer<typeof stockSettingsSchema>) {
    await this.prisma.db.$transaction(async (tx) => {
      const ids = [...new Set(body.alternativeIds)];
      if (
        ids.includes(id) ||
        (await tx.drug.count({ where: { facilityId, isActive: true, id: { in: ids } } })) !==
          ids.length
      )
        throw new BadRequestException('Select active alternatives in this facility');
      const updated = await tx.drug.updateMany({
        where: { id, facilityId },
        data: { reorderThreshold: body.reorderThreshold },
      });
      if (!updated.count) throw new NotFoundException('Medication not found');
      await tx.pharmacyAlternative.deleteMany({ where: { drugId: id } });
      for (const alternativeId of ids)
        await tx.pharmacyAlternative.create({ data: { drugId: id, alternativeId } });
    });
    return { ok: true };
  }

  async quarantine(facilityId: string, actorId: string, id: string, reason: string) {
    await this.prisma.db.$transaction(async (tx) => {
      const batch = await tx.pharmacyBatch.findFirst({ where: { id, drug: { facilityId } } });
      if (!batch) throw new NotFoundException('Batch not found');
      if (batch.quarantined) return;
      await tx.pharmacyBatch.update({ where: { id }, data: { quarantined: true } });
      await tx.pharmacyMovement.create({
        data: { batchId: id, actorId, kind: 'quarantine', quantity: 0, reason },
      });
    });
    return { ok: true };
  }
}

interface Item {
  id: string;
  drugId: string;
  quantity: number | null;
  drugNameAtTime: string;
}

// Simulate the same allocation at billing. Only physical handover writes the ledger.
// The caller's serializable transaction rolls back the entire sheet on any shortage.
export async function allocateStock(
  tx: Prisma.TransactionClient,
  facilityId: string,
  items: Item[],
  actorId?: string,
) {
  const batches = await tx.pharmacyBatch.findMany({
    where: { drugId: { in: items.map((i) => i.drugId) }, drug: { facilityId }, ...usable(today()) },
    orderBy: [{ drugId: 'asc' }, { expiresOn: 'asc' }, { id: 'asc' }],
  });
  for (const item of items) {
    let needed = item.quantity ?? 1;
    for (const batch of batches) {
      if (!needed) break;
      if (batch.drugId !== item.drugId || !batch.quantity) continue;
      const take = Math.min(batch.quantity, needed);
      if (actorId) {
        const change = await tx.pharmacyBatch.updateMany({
          where: { id: batch.id, quarantined: false, quantity: { gte: take } },
          data: { quantity: { decrement: take } },
        });
        if (!change.count) throw new ConflictException('Stock changed. Reload before handover.');
        await tx.pharmacyMovement.create({
          data: { batchId: batch.id, itemId: item.id, actorId, kind: 'dispense', quantity: -take },
        });
      }
      batch.quantity -= take;
      needed -= take;
    }
    if (needed)
      throw new ConflictException({
        code: 'insufficient_stock',
        message: `Insufficient usable stock for ${item.drugNameAtTime} (short by ${needed} units).`,
      });
  }
}
