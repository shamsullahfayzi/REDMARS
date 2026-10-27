import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { savePrescriptionRequestSchema, saveLabResultRequestSchema } from '@redmars/shared';
import { PrismaService } from '../src/prisma/prisma.service';
import { requestContext } from '../src/audit/request-context';
import { NumberSequenceService } from '../src/services/number-sequence.service';
import { PaymentService } from '../src/modules/invoice/payment.service';
import { LabBillingService } from '../src/modules/lab-billing/lab-billing.service';
import { PrescriptionService } from '../src/modules/prescription/prescription.service';
import { VisitService } from '../src/modules/visit/visit.service';
import { IntegrationService } from '../src/integration/integration.service';
import { LabResultService } from '../src/modules/lab-order/lab-result.service';
import { LabSampleService } from '../src/modules/lab-order/lab-sample.service';
import { DispenseService } from '../src/modules/pharmacy/dispense.service';

describe('Foundation integrity (real database)', () => {
  const raw = new PrismaClient();
  const prisma = new PrismaService();
  const sequence = new NumberSequenceService(prisma);
  const payments = new PaymentService(prisma, sequence);
  const labs = new LabBillingService(prisma, sequence);
  const integrations = new IntegrationService(prisma);
  let facilityId: string;
  let userId: string;
  let patientId: string;
  let departmentId: string;
  let visitId: string;
  let practitionerId: string;
  let drugId: string;
  const actor = <T>(run: () => Promise<T>) => requestContext.run({ facilityId, userId }, run);

  beforeAll(async () => {
    await prisma.$connect();
    facilityId = (
      await raw.facility.create({ data: { code: `foundation_${randomUUID()}`, name: 'Test only' } })
    ).id;
    userId = (
      await raw.appUser.create({
        data: {
          facilityId,
          username: 'foundation_actor',
          fullName: 'Test actor',
          passwordHash: 'not-a-real-password-hash',
        },
      })
    ).id;
    patientId = (
      await raw.patient.create({
        data: { facilityId, mrn: 'F-1', firstName: 'Test patient', gender: 'unknown' },
      })
    ).id;
    departmentId = (
      await raw.department.create({ data: { facilityId, code: 'OPD', name: 'OPD', type: 'opd' } })
    ).id;
    practitionerId = (
      await raw.practitioner.create({
        data: { facilityId, userId, code: 'DR1', firstName: 'Test', lastName: 'Doctor' },
      })
    ).id;
    visitId = (
      await raw.visit.create({
        data: {
          facilityId,
          patientId,
          departmentId,
          practitionerId,
          visitNo: 'V-1',
          type: 'opd_consult',
        },
      })
    ).id;
    drugId = (await raw.drug.create({ data: { facilityId, code: 'D1', genericName: 'Test drug' } }))
      .id;
  });

  afterAll(async () => {
    if (facilityId) {
      await raw.auditLog.deleteMany({ where: { facilityId } });
      await raw.payment.deleteMany({ where: { invoice: { facilityId } } });
      await raw.invoiceItem.deleteMany({ where: { invoice: { facilityId } } });
      await raw.invoice.deleteMany({ where: { facilityId } });
      await raw.prescriptionItem.deleteMany({ where: { prescription: { visit: { facilityId } } } });
      await raw.prescription.deleteMany({ where: { visit: { facilityId } } });
      await raw.labResult.deleteMany({ where: { labOrderItem: { labOrder: { facilityId } } } });
      await raw.labOrderItem.deleteMany({ where: { labOrder: { facilityId } } });
      await raw.labOrder.deleteMany({ where: { facilityId } });
      await raw.referenceRange.deleteMany({ where: { test: { facilityId } } });
      await raw.labTest.deleteMany({ where: { facilityId } });
      await raw.visitStatusHistory.deleteMany({ where: { visit: { facilityId } } });
      await raw.visit.deleteMany({ where: { facilityId } });
      await raw.patient.deleteMany({ where: { facilityId } });
      await raw.practitioner.deleteMany({ where: { facilityId } });
      await raw.drug.deleteMany({ where: { facilityId } });
      await raw.department.deleteMany({ where: { facilityId } });
      await raw.appUser.deleteMany({ where: { facilityId } });
      await raw.setting.deleteMany({ where: { facilityId } });
      await raw.numberSequence.deleteMany({ where: { facilityId } });
      await raw.facility.delete({ where: { id: facilityId } });
    }
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  async function invoice(total = '100.00', lines = false) {
    return raw.invoice.create({
      data: {
        facilityId,
        patientId,
        visitId,
        invoiceNo: randomUUID(),
        subtotal: total,
        total,
        status: 'issued',
        ...(lines
          ? {
              items: {
                create: [1, 2].map(() => ({
                  refType: 'lab_order_item',
                  refId: randomUUID(),
                  description: 'Test',
                  unitPrice: '50.00',
                  total: '50.00',
                })),
              },
            }
          : {}),
      },
      include: { items: true },
    });
  }

  it('rolls back business rows, audit and outbox together', async () => {
    const id = randomUUID();
    await expect(
      actor(() =>
        prisma.db.$transaction(async (tx) => {
          await tx.department.create({
            data: { id, facilityId, code: 'ROLLBACK', name: 'Rollback', type: 'administration' },
          });
          throw new Error('injected failure');
        }),
      ),
    ).rejects.toThrow('injected failure');
    expect(await raw.department.count({ where: { id } })).toBe(0);
    expect(await raw.auditLog.count({ where: { entityId: id } })).toBe(0);
    expect(await raw.integrationEvent.count({ where: { aggregateId: id } })).toBe(0);
  });

  it('rejects write arrays before any operation starts', async () => {
    const write = prisma.db.department.create({
      data: { facilityId, code: 'BAD_ARRAY', name: 'Must not run', type: 'administration' },
    });
    expect(() => prisma.db.$transaction([write])).toThrow('callback transaction');
    expect(await raw.department.count({ where: { facilityId, code: 'BAD_ARRAY' } })).toBe(0);
  });

  it('audits upserts and batches with full before/after despite a narrow select', async () => {
    await actor(() =>
      prisma.db.setting.upsert({
        where: { facilityId_key: { facilityId, key: 'foundation.test' } },
        create: { facilityId, key: 'foundation.test', value: 'before' },
        update: { value: 'before' },
        select: { key: true },
      }),
    );
    await actor(() =>
      prisma.db.setting.updateMany({
        where: { facilityId, key: 'foundation.test' },
        data: { value: 'after' },
      }),
    );
    const log = await raw.auditLog.findFirstOrThrow({
      where: { facilityId, entity: 'Setting', action: 'update' },
    });
    expect(log.before).toMatchObject({ value: 'before' });
    expect(log.after).toMatchObject({ value: 'after' });
    const created = await prisma.db.department.createManyAndReturn({
      data: [{ facilityId, code: 'BATCH', name: 'Batch snapshot', type: 'administration' }],
      select: { id: true },
    });
    expect(Object.keys(created[0])).toEqual(['id']);
    const batchLog = await raw.auditLog.findFirstOrThrow({ where: { entityId: created[0].id } });
    expect(batchLog.after).toMatchObject({ facilityId, name: 'Batch snapshot' });
  });

  it('attributes child writes outside requests through their parent facility', async () => {
    const bill = await invoice();
    const payment = await prisma.db.payment.create({
      data: { invoiceId: bill.id, amount: '1.00', method: 'cash', receivedBy: userId },
      select: { id: true },
    });
    const log = await raw.auditLog.findFirstOrThrow({ where: { entityId: payment.id } });
    expect(log.facilityId).toBe(facilityId);
    expect(log.userId).toBeNull();
    const event = await raw.integrationEvent.findUniqueOrThrow({
      where: { sourceAuditId: log.id },
    });
    expect(event.payload).toMatchObject({
      invoice: { currency: bill.currency, patientId, visitId },
    });
  });

  it('an audit storage failure aborts the associated business write', async () => {
    await raw.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION foundation_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity = 'Department' AND NEW.after->>'code' = 'FAIL_AUDIT' THEN RAISE EXCEPTION 'injected audit failure'; END IF; RETURN NEW; END $$`,
    );
    await raw.$executeRawUnsafe(
      'CREATE TRIGGER foundation_fail_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION foundation_fail_audit()',
    );
    try {
      await expect(
        actor(() =>
          prisma.db.department.create({
            data: {
              facilityId,
              code: 'FAIL_AUDIT',
              name: 'Must roll back',
              type: 'administration',
            },
          }),
        ),
      ).rejects.toThrow();
      expect(await raw.department.count({ where: { facilityId, code: 'FAIL_AUDIT' } })).toBe(0);
    } finally {
      await raw.$executeRawUnsafe('DROP TRIGGER foundation_fail_audit ON audit_log');
      await raw.$executeRawUnsafe('DROP FUNCTION foundation_fail_audit()');
    }
  });

  it('replays a payment without charging twice and rejects reusing its key for a different amount', async () => {
    const bill = await invoice();
    const input = { amount: '40.00', method: 'cash' as const, idempotencyKey: randomUUID() };
    const first = await actor(() => payments.pay(facilityId, userId, bill.id, input));
    const retry = await actor(() => payments.pay(facilityId, userId, bill.id, input));
    expect(retry).toEqual(first);
    expect(await raw.payment.count({ where: { invoiceId: bill.id } })).toBe(1);
    await expect(
      actor(() => payments.pay(facilityId, userId, bill.id, { ...input, amount: '45.00' })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('concurrent payments never overwrite the balance or leave phantom events', async () => {
    const bill = await invoice();
    const attempts = await Promise.allSettled(
      [1, 2].map(() =>
        actor(() => payments.pay(facilityId, userId, bill.id, { amount: '60.00', method: 'cash' })),
      ),
    );
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const saved = await raw.invoice.findUniqueOrThrow({ where: { id: bill.id } });
    expect(saved.paidAmount.toFixed(2)).toBe('60.00');
    const entries = await raw.payment.findMany({ where: { invoiceId: bill.id } });
    expect(entries).toHaveLength(1);
    const events = await raw.integrationEvent.findMany({
      where: { facilityId, type: 'hmis.Payment.create.v1', aggregateId: entries[0].id },
    });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({
      after: { amount: '60', receiptNo: entries[0].receiptNo },
      invoice: { currency: 'AFN' },
    });
  });

  it('generic payment settles lab gates and a refund closes unpaid gates', async () => {
    const bill = await invoice('100.00', true);
    const paid = await actor(() =>
      payments.pay(facilityId, userId, bill.id, { amount: '100.00', method: 'cash' }),
    );
    expect(await raw.invoiceItem.count({ where: { invoiceId: bill.id, isPaid: true } })).toBe(2);
    await actor(() =>
      payments.refund(
        facilityId,
        userId,
        new Map([['payment.refund', null]]),
        bill.id,
        paid.payment.id,
        { reason: 'Test refund' },
      ),
    );
    expect(await raw.invoiceItem.count({ where: { invoiceId: bill.id, isPaid: true } })).toBe(0);
  });

  it('different lab-line payments reconcile and both issue receipts', async () => {
    const bill = await invoice('100.00', true);
    for (const line of bill.items)
      await actor(() => labs.pay(facilityId, userId, { itemIds: [line.refId!], method: 'cash' }));
    const saved = await raw.invoice.findUniqueOrThrow({ where: { id: bill.id } });
    expect(saved.paidAmount.toFixed(2)).toBe('100.00');
    const entries = await raw.payment.findMany({ where: { invoiceId: bill.id } });
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map((p) => p.receiptNo)).size).toBe(2);
    expect(entries.every((p) => p.receiptNo)).toBe(true);
  });

  it('a rejected prescription cannot auto-start the visit or leave half a sheet', async () => {
    const prescriptions = new PrescriptionService(prisma, new VisitService(prisma, sequence));
    const input = savePrescriptionRequestSchema.parse({
      items: [
        { drugId, frequency: 'OD', duration: '1 day', route: 'PO' },
        { id: randomUUID(), drugId, frequency: 'OD', duration: '1 day', route: 'PO' },
      ],
    });
    await expect(
      actor(() => prescriptions.save(facilityId, userId, visitId, input)),
    ).rejects.toThrow();
    expect(await raw.prescription.count({ where: { visitId } })).toBe(0);
    expect((await raw.visit.findUniqueOrThrow({ where: { id: visitId } })).status).toBe('arrived');
  });

  it('a failure on the second prescription item rolls back the first item, sheet and auto-start', async () => {
    const prescriptions = new PrescriptionService(prisma, new VisitService(prisma, sequence));
    const count = await raw.auditLog.count({ where: { facilityId } });
    await raw.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION foundation_fail_rx() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.instructions = 'FAIL_RX' THEN RAISE EXCEPTION 'injected item failure'; END IF; RETURN NEW; END $$`,
    );
    await raw.$executeRawUnsafe(
      'CREATE TRIGGER foundation_fail_rx BEFORE INSERT ON prescription_item FOR EACH ROW EXECUTE FUNCTION foundation_fail_rx()',
    );
    try {
      const input = savePrescriptionRequestSchema.parse({
        items: [
          { drugId, frequency: 'OD', duration: '1 day', route: 'PO' },
          { drugId, frequency: 'BID', duration: '1 day', route: 'PO', instructions: 'FAIL_RX' },
        ],
      });
      await expect(
        actor(() => prescriptions.save(facilityId, userId, visitId, input)),
      ).rejects.toThrow();
      expect(await raw.prescription.count({ where: { visitId } })).toBe(0);
      expect((await raw.visit.findUniqueOrThrow({ where: { id: visitId } })).status).toBe(
        'arrived',
      );
      expect(await raw.auditLog.count({ where: { facilityId } })).toBe(count);
    } finally {
      await raw.$executeRawUnsafe('DROP TRIGGER foundation_fail_rx ON prescription_item');
      await raw.$executeRawUnsafe('DROP FUNCTION foundation_fail_rx()');
    }
  });

  it('detects a stale prescription version and refuses editing a billed prescription', async () => {
    const prescriptions = new PrescriptionService(prisma, new VisitService(prisma, sequence));
    const input = savePrescriptionRequestSchema.parse({
      expectedVersion: 0,
      items: [{ drugId, frequency: 'OD', duration: '1 day', route: 'PO' }],
    });
    const saved = await actor(() => prescriptions.save(facilityId, userId, visitId, input));
    expect(saved.prescription?.version).toBe(1);
    await expect(
      actor(() => prescriptions.save(facilityId, userId, visitId, input)),
    ).rejects.toBeInstanceOf(ConflictException);
    const bill = await invoice();
    await raw.invoiceItem.create({
      data: {
        invoiceId: bill.id,
        refType: 'prescription_item',
        refId: saved.prescription!.items[0].id,
        description: 'Drug',
        unitPrice: '100',
        total: '100',
      },
    });
    await expect(
      actor(() =>
        prescriptions.save(facilityId, userId, visitId, { ...input, expectedVersion: 1 }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lab history retains the reference range used when the result was entered', async () => {
    const results = new LabResultService(prisma);
    const test = await raw.labTest.create({
      data: { facilityId, code: 'SNAPSHOT', name: 'Snapshot test', unit: 'units' },
    });
    const range = await raw.referenceRange.create({
      data: { testId: test.id, lowValue: '10', highValue: '20' },
    });
    const order = await raw.labOrder.create({
      data: {
        facilityId,
        visitId,
        orderNo: 'SNAPSHOT',
        items: {
          create: { testId: test.id, testNameAtTime: test.name, status: 'sample_collected' },
        },
      },
      include: { items: true },
    });
    const itemId = order.items[0].id;
    await actor(() =>
      results.save(
        facilityId,
        userId,
        itemId,
        saveLabResultRequestSchema.parse({ valueNumeric: '15' }),
      ),
    );
    await actor(() => results.verify(facilityId, userId, { itemIds: [itemId] }));
    await raw.referenceRange.update({
      where: { id: range.id },
      data: { lowValue: '30', highValue: '40' },
    });
    const report = await results.forVisit(facilityId, visitId);
    expect(report.items[0]).toMatchObject({
      referenceLow: '10',
      referenceHigh: '20',
      isAbnormal: false,
    });
    await expect(
      actor(() =>
        results.save(
          facilityId,
          userId,
          itemId,
          saveLabResultRequestSchema.parse({ valueNumeric: '35' }),
        ),
      ),
    ).rejects.toThrow();
  });

  it('rejects a visit pointing at another facility even through direct SQL/Prisma', async () => {
    const other = await raw.facility.create({
      data: { code: randomUUID(), name: 'Other test facility' },
    });
    try {
      await expect(
        raw.visit.create({
          data: { facilityId: other.id, patientId, departmentId, visitNo: 'bad', type: 'ipd' },
        }),
      ).rejects.toThrow();
    } finally {
      await raw.facility.delete({ where: { id: other.id } });
    }
  });

  it('consumer failure rolls back effects and delivery receipt; success is deduplicated', async () => {
    const event = await raw.integrationEvent.findFirstOrThrow({ where: { facilityId } });
    await expect(
      integrations.consume(facilityId, 'finance.test', event.id, async (_event, tx) => {
        await tx.setting.create({ data: { facilityId, key: 'consumer.failure', value: 'no' } });
        throw new Error('consumer failed');
      }),
    ).rejects.toThrow('consumer failed');
    expect(await raw.setting.count({ where: { facilityId, key: 'consumer.failure' } })).toBe(0);
    expect(await raw.integrationReceipt.count({ where: { eventId: event.id } })).toBe(0);
    const handle = jest.fn(async () => {});
    expect(await integrations.consume(facilityId, 'finance.test', event.id, handle)).toBe(true);
    expect(await integrations.consume(facilityId, 'finance.test', event.id, handle)).toBe(false);
    expect(handle).toHaveBeenCalledTimes(1);
    await expect(
      integrations.consume(randomUUID(), 'finance.test', event.id, handle),
    ).rejects.toThrow('Integration event not found');
  });

  it('refuses pharmacy handover and lab collection against cancelled zero-value bills', async () => {
    const rx = await raw.prescription.create({
      data: {
        visitId,
        practitionerId,
        items: {
          create: {
            drugId,
            drugNameAtTime: 'Test drug',
            frequency: 'BID',
            duration: '1 day',
            route: 'PO',
          },
        },
      },
      include: { items: true },
    });
    const test = await raw.labTest.create({
      data: { facilityId, code: 'CANCEL_GATE', name: 'Cancelled gate test' },
    });
    const order = await raw.labOrder.create({
      data: {
        facilityId,
        visitId,
        orderNo: 'CANCEL_GATE',
        items: { create: { testId: test.id, testNameAtTime: test.name } },
      },
      include: { items: true },
    });
    await raw.invoice.create({
      data: {
        facilityId,
        patientId,
        visitId,
        invoiceNo: randomUUID(),
        subtotal: '0',
        total: '0',
        status: 'cancelled',
        items: {
          create: [
            {
              refType: 'prescription_item',
              refId: rx.items[0].id,
              description: 'Free medicine',
              unitPrice: '0',
              total: '0',
              isPaid: true,
            },
            {
              refType: 'lab_order_item',
              refId: order.items[0].id,
              description: 'Free test',
              unitPrice: '0',
              total: '0',
              isPaid: true,
            },
          ],
        },
      },
    });
    const pharmacy = new DispenseService(prisma, sequence);
    const samples = new LabSampleService(prisma);
    await expect(actor(() => pharmacy.confirmHandover(facilityId, userId, rx.id))).rejects.toThrow(
      'not fully paid',
    );
    await expect(
      actor(() => samples.collect(facilityId, userId, { itemIds: [order.items[0].id] })),
    ).rejects.toThrow('not been paid');
    expect(
      (await raw.prescription.findUniqueOrThrow({ where: { id: rx.id } })).dispensedAt,
    ).toBeNull();
    expect(
      (await raw.labOrderItem.findUniqueOrThrow({ where: { id: order.items[0].id } })).status,
    ).toBe('ordered');
  });
});
