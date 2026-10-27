import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { NumberSequenceService } from '../src/services/number-sequence.service';
import { ReceptionOperationsService } from '../src/modules/reception/reception-operations.service';
import { requestContext } from '../src/audit/request-context';

describe('Reception operations (real test database)', () => {
  const raw = new PrismaClient();
  const prisma = new PrismaService();
  const operations = new ReceptionOperationsService(prisma, new NumberSequenceService(prisma));
  let facilityId: string;
  let otherFacilityId: string;
  let requesterId: string;
  let reviewerId: string;
  let patientId: string;
  let departmentId: string;

  const asActor = <T>(userId: string, run: () => Promise<T>) =>
    requestContext.run({ facilityId, userId }, run);

  beforeAll(async () => {
    await prisma.$connect();
    facilityId = (await raw.facility.create({ data: { code: `reception_${randomUUID()}`, name: 'Reception test' } })).id;
    otherFacilityId = (await raw.facility.create({ data: { code: `other_${randomUUID()}`, name: 'Other test' } })).id;
    requesterId = (await raw.appUser.create({ data: { facilityId, username: 'desk', fullName: 'Desk user', passwordHash: 'test' } })).id;
    reviewerId = (await raw.appUser.create({ data: { facilityId, username: 'reviewer', fullName: 'Clinical reviewer', passwordHash: 'test' } })).id;
    patientId = (await raw.patient.create({ data: { facilityId, mrn: 'REC-T-1', firstName: 'Synthetic', gender: 'unknown' } })).id;
    departmentId = (await raw.department.create({ data: { facilityId, code: 'IPD', name: 'IPD', type: 'ipd' } })).id;
  });

  afterAll(async () => {
    if (facilityId) {
      await raw.commandReceipt.deleteMany({ where: { facilityId } });
      await raw.auditLog.deleteMany({ where: { facilityId } });
      await raw.integrationEvent.deleteMany({ where: { facilityId } });
      await raw.receptionReminder.deleteMany({ where: { facilityId } });
      await raw.patientContact.deleteMany({ where: { facilityId } });
      await raw.receptionCareRequest.deleteMany({ where: { facilityId } });
      await raw.receptionBed.deleteMany({ where: { facilityId } });
      await raw.numberSequence.deleteMany({ where: { facilityId } });
      await raw.patient.deleteMany({ where: { facilityId } });
      await raw.department.deleteMany({ where: { facilityId } });
      await raw.appUser.deleteMany({ where: { facilityId } });
      await raw.facility.delete({ where: { id: facilityId } });
    }
    if (otherFacilityId) await raw.facility.delete({ where: { id: otherFacilityId } });
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('requires a separate reviewer and moves a reserved bed only after approval', async () => {
    const bed = await asActor(requesterId, () => operations.createBed(facilityId, requesterId, {
      departmentId, roomId: null, code: 'T-01', label: 'Test bed', status: 'available', notes: '', isActive: true,
      idempotencyKey: randomUUID(),
    }));
    const request = await asActor(requesterId, () => operations.createCareRequest(facilityId, requesterId, {
      kind: 'admission', patientId, targetPatientId: null, visitId: null, appointmentId: null,
      departmentId, sourceBedId: null, targetBedId: bed.id, priority: 'routine', reason: 'Synthetic test', notes: '',
      idempotencyKey: randomUUID(),
    }));
    await expect(asActor(requesterId, () => operations.reviewCareRequest(facilityId, requesterId, request.id, {
      status: 'approved', note: '', idempotencyKey: randomUUID(),
    }))).rejects.toBeInstanceOf(ConflictException);
    await asActor(reviewerId, () => operations.reviewCareRequest(facilityId, reviewerId, request.id, {
      status: 'approved', note: '', idempotencyKey: randomUUID(),
    }));
    expect((await raw.receptionBed.findUniqueOrThrow({ where: { id: bed.id } })).status).toBe('reserved');
    await asActor(reviewerId, () => operations.reviewCareRequest(facilityId, reviewerId, request.id, {
      status: 'completed', note: '', idempotencyKey: randomUUID(),
    }));
    expect((await raw.receptionBed.findUniqueOrThrow({ where: { id: bed.id } })).status).toBe('occupied');
  });

  it('requires channel-specific consent and masks reminder destinations', async () => {
    const phone = '+93000000000';
    const contact = await asActor(requesterId, () => operations.addContact(facilityId, requesterId, patientId, {
      name: 'Synthetic contact', relationship: 'guardian', phone, kind: 'guardian', isPrimary: true,
      isEmergency: true, canCall: true, canSms: true, canWhatsapp: false, safeInstructions: 'SMS only',
      idempotencyKey: randomUUID(),
    }));
    const base = { patientId, appointmentId: null, contactId: contact.id, destination: phone, template: 'Synthetic reminder', scheduledFor: new Date().toISOString() };
    await expect(asActor(requesterId, () => operations.createReminder(facilityId, requesterId, {
      ...base, channel: 'whatsapp', idempotencyKey: randomUUID(),
    }))).rejects.toThrow('has not permitted');
    await asActor(requesterId, () => operations.createReminder(facilityId, requesterId, {
      ...base, channel: 'sms', idempotencyKey: randomUUID(),
    }));
    const workspace = await operations.workspace(facilityId);
    expect(workspace.reminders[0].destinationMasked).not.toContain(phone);
  });

  it('does not expose a patient across facility boundaries', async () => {
    await expect(operations.patientProfile(otherFacilityId, patientId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
