import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  HandoverInput,
  PatientContactInput,
  PatientCoverageInput,
  PatientDepositInput,
  PatientDocumentInput,
  ReceptionBedInput,
  ReceptionBedUpdate,
  ReceptionCareRequestInput,
  ReceptionCareReview,
  ReceptionTillCloseInput,
  ReminderInput,
  WaitlistInput,
  WaitlistUpdate,
} from '@redmars/shared';
import { idempotentCommand } from '../../common/idempotent-command';
import { facilityDayBoundsFor } from '../../common/facility-time';
import { PrismaService, type AuditedTx } from '../../prisma/prisma.service';
import { NumberSequenceService } from '../../services/number-sequence.service';

const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const PRIORITY_VALUE: Record<string, number> = { routine: 0, urgent: 10, emergency: 20 };
const money = (value: Prisma.Decimal | string | number) => new Prisma.Decimal(value).toFixed(2);
const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;
const day = (value: Date | null | undefined) => value?.toISOString().slice(0, 10) ?? null;
const fullName = (patient: { prefix?: string | null; firstName: string; lastName?: string | null }) =>
  [patient.prefix, patient.firstName, patient.lastName].filter(Boolean).join(' ');

@Injectable()
export class ReceptionOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: NumberSequenceService,
  ) {}

  private command<T>(
    facilityId: string,
    userId: string,
    operation: string,
    input: { idempotencyKey: string },
    run: (tx: AuditedTx) => Promise<T>,
  ): Promise<T> {
    return this.prisma.db.$transaction((tx) =>
      idempotentCommand(
        tx,
        { facilityId, userId, operation, key: input.idempotencyKey, input },
        () => run(tx),
      ),
    );
  }

  async workspace(facilityId: string) {
    const [beds, requests, waitlist, reminders, handovers, closes, departments, panels, staff] =
      await Promise.all([
        this.prisma.db.receptionBed.findMany({
          where: { facilityId, isActive: true },
          include: { department: true, room: true },
          orderBy: [{ department: { name: 'asc' } }, { code: 'asc' }],
        }),
        this.prisma.db.receptionCareRequest.findMany({
          where: { facilityId },
          include: { patient: true, targetPatient: true, department: true },
          orderBy: { requestedAt: 'desc' },
          take: 100,
        }),
        this.prisma.db.appointmentWaitlist.findMany({
          where: { facilityId, status: { in: ['waiting', 'offered'] } },
          include: { patient: true, department: true },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        }),
        this.prisma.db.receptionReminder.findMany({
          where: { facilityId, status: { in: ['queued', 'failed'] } },
          include: { patient: true },
          orderBy: { scheduledFor: 'asc' },
          take: 100,
        }),
        this.prisma.db.receptionShiftHandover.findMany({
          where: { facilityId, status: { not: 'closed' } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        this.prisma.db.financeTillClose.findMany({
          where: { facilityId, origin: 'reception' },
          orderBy: { endsAt: 'desc' },
          take: 30,
        }),
        this.prisma.db.department.findMany({
          where: { facilityId, isActive: true },
          select: { id: true, code: true, name: true, type: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.db.panel.findMany({
          where: { facilityId, isActive: true },
          select: { id: true, code: true, name: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.db.appUser.findMany({
          where: { facilityId, isActive: true, deletedAt: null },
          select: { id: true, fullName: true },
          orderBy: { fullName: 'asc' },
        }),
      ]);

    const names = new Map(staff.map((entry) => [entry.id, entry.fullName]));
    const practitionerIds = [...new Set(waitlist.map((entry) => entry.practitionerId).filter(Boolean))] as string[];
    const practitioners = practitionerIds.length
      ? await this.prisma.db.practitioner.findMany({
          where: { facilityId, id: { in: practitionerIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const practitionerNames = new Map(
      practitioners.map((entry) => [entry.id, `${entry.firstName} ${entry.lastName}`.trim()]),
    );

    const careRequests = requests.map((entry) => ({
      id: entry.id,
      reference: entry.reference,
      kind: entry.kind,
      status: entry.status,
      priority: entry.priority,
      patientId: entry.patientId,
      patientName: fullName(entry.patient),
      patientMrn: entry.patient.mrn,
      targetPatientId: entry.targetPatientId,
      targetPatientName: entry.targetPatient ? fullName(entry.targetPatient) : null,
      visitId: entry.visitId,
      appointmentId: entry.appointmentId,
      departmentId: entry.departmentId,
      departmentName: entry.department?.name ?? null,
      sourceBedId: entry.sourceBedId,
      targetBedId: entry.targetBedId,
      reason: entry.reason,
      notes: entry.notes,
      requestedBy: entry.requestedBy,
      requestedByName: names.get(entry.requestedBy) ?? '',
      requestedAt: entry.requestedAt.toISOString(),
      reviewedBy: entry.reviewedBy,
      reviewedByName: entry.reviewedBy ? (names.get(entry.reviewedBy) ?? '') : null,
      reviewedAt: iso(entry.reviewedAt),
      reviewNote: entry.reviewNote,
      completedAt: iso(entry.completedAt),
    }));

    const waitlistRows = waitlist.map((entry) => ({
      id: entry.id,
      patientId: entry.patientId,
      patientName: fullName(entry.patient),
      patientMrn: entry.patient.mrn,
      departmentId: entry.departmentId,
      departmentName: entry.department.name,
      practitionerId: entry.practitionerId,
      practitionerName: entry.practitionerId
        ? (practitionerNames.get(entry.practitionerId) ?? '')
        : null,
      preferredOn: day(entry.preferredOn),
      priority: entry.priority,
      status: entry.status,
      note: entry.note,
      appointmentId: entry.appointmentId,
      createdAt: entry.createdAt.toISOString(),
      contactedAt: iso(entry.contactedAt),
    }));

    const reminderRows = reminders.map((entry) => ({
      id: entry.id,
      patientId: entry.patientId,
      patientName: fullName(entry.patient),
      channel: entry.channel,
      destinationMasked: this.maskDestination(entry.destination),
      template: entry.template,
      status: entry.status,
      scheduledFor: entry.scheduledFor.toISOString(),
      sentAt: iso(entry.sentAt),
      failureReason: entry.failureReason,
    }));
    const handoverRows = handovers.map((entry) => ({
      id: entry.id,
      fromUserId: entry.fromUserId,
      fromUserName: names.get(entry.fromUserId) ?? '',
      toUserId: entry.toUserId,
      toUserName: entry.toUserId ? (names.get(entry.toUserId) ?? '') : null,
      status: entry.status,
      note: entry.note,
      createdAt: entry.createdAt.toISOString(),
      acknowledgedAt: iso(entry.acknowledgedAt),
      closedAt: iso(entry.closedAt),
    }));
    const tillCloses = closes.map((entry) => ({
      id: entry.id,
      userId: entry.userId,
      userName: names.get(entry.userId) ?? '',
      startsAt: entry.startsAt.toISOString(),
      endsAt: entry.endsAt.toISOString(),
      opening: money(entry.opening),
      expected: money(entry.expected),
      counted: money(entry.counted),
      difference: money(entry.difference),
      note: entry.note,
      approvedAt: iso(entry.approvedAt),
    }));

    const stats = {
      availableBeds: beds.filter((entry) => entry.status === 'available').length,
      pendingCareRequests: requests.filter((entry) => entry.status === 'pending').length,
      waitingAppointments: waitlist.filter((entry) => entry.status === 'waiting').length,
      queuedReminders: reminders.filter((entry) => entry.status === 'queued').length,
      openHandovers: handovers.filter((entry) => entry.status === 'open').length,
    };
    const failedReminders = reminders.filter((entry) => entry.status === 'failed').length;
    const unapprovedDifferences = closes.filter(
      (entry) => !entry.approvedAt && !entry.difference.isZero(),
    ).length;
    const alerts = [
      { key: 'care_requests', severity: 'warning' as const, count: stats.pendingCareRequests },
      { key: 'waitlist', severity: 'info' as const, count: stats.waitingAppointments },
      { key: 'reminder_failures', severity: 'urgent' as const, count: failedReminders },
      { key: 'handovers', severity: 'warning' as const, count: stats.openHandovers },
      { key: 'till_differences', severity: 'urgent' as const, count: unapprovedDifferences },
    ].filter((entry) => entry.count > 0);

    return {
      stats,
      beds: beds.map((entry) => ({
        id: entry.id,
        code: entry.code,
        label: entry.label,
        departmentId: entry.departmentId,
        departmentName: entry.department.name,
        roomId: entry.roomId,
        roomName: entry.room?.name ?? null,
        status: entry.status,
        notes: entry.notes,
        isActive: entry.isActive,
      })),
      careRequests,
      waitlist: waitlistRows,
      reminders: reminderRows,
      handovers: handoverRows,
      tillCloses,
      alerts,
      departments: departments.map((entry) => ({ ...entry, type: entry.type })),
      panels,
      staff: staff.map((entry) => ({ id: entry.id, name: entry.fullName })),
    };
  }

  createBed(facilityId: string, userId: string, input: ReceptionBedInput) {
    return this.command(facilityId, userId, 'reception.bed.create', input, async (tx) => {
      if (input.status === 'reserved' || input.status === 'occupied')
        throw new BadRequestException('Reserve or occupy a bed through an approved care request.');
      await this.requireDepartment(tx, facilityId, input.departmentId, 'ipd');
      if (input.roomId) {
        const room = await tx.room.findFirst({
          where: { id: input.roomId, facilityId, departmentId: input.departmentId, isActive: true },
        });
        if (!room) throw new BadRequestException('Choose an active room in that department.');
      }
      const entry = await tx.receptionBed.create({
        data: {
          facilityId,
          departmentId: input.departmentId,
          roomId: input.roomId,
          code: input.code.toUpperCase(),
          label: input.label,
          status: input.status,
          notes: input.notes,
          isActive: input.isActive,
        },
        include: { department: true, room: true },
      });
      return this.bedView(entry);
    });
  }

  updateBed(
    facilityId: string,
    userId: string,
    id: string,
    input: ReceptionBedUpdate,
  ) {
    return this.command(facilityId, userId, `reception.bed.update:${id}`, input, async (tx) => {
      const current = await tx.receptionBed.findFirst({ where: { id, facilityId } });
      if (!current) throw new NotFoundException('Bed not found.');
      if (
        input.status &&
        input.status !== current.status &&
        (input.status === 'reserved' || input.status === 'occupied')
      )
        throw new BadRequestException('Reserve or occupy a bed through an approved care request.');
      const departmentId = input.departmentId ?? current.departmentId;
      await this.requireDepartment(tx, facilityId, departmentId, 'ipd');
      const entry = await tx.receptionBed.update({
        where: { id },
        data: {
          ...(input.departmentId ? { departmentId: input.departmentId } : {}),
          ...(input.roomId !== undefined ? { roomId: input.roomId } : {}),
          ...(input.code ? { code: input.code.toUpperCase() } : {}),
          ...(input.label ? { label: input.label } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        include: { department: true, room: true },
      });
      return this.bedView(entry);
    });
  }

  createCareRequest(
    facilityId: string,
    userId: string,
    input: ReceptionCareRequestInput,
  ) {
    return this.command(facilityId, userId, 'reception.request.create', input, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: input.patientId, facilityId, deletedAt: null },
      });
      if (!patient) throw new NotFoundException('Patient not found.');
      if (input.targetPatientId) {
        if (input.targetPatientId === input.patientId)
          throw new BadRequestException('A patient cannot be merged with the same record.');
        if (!(await tx.patient.findFirst({ where: { id: input.targetPatientId, facilityId } })))
          throw new NotFoundException('Possible duplicate patient not found.');
      }
      if (input.visitId) {
        const visit = await tx.visit.findFirst({
          where: { id: input.visitId, facilityId, patientId: input.patientId },
        });
        if (!visit) throw new BadRequestException('The visit does not belong to this patient.');
      }
      if (input.appointmentId) {
        const appointment = await tx.appointment.findFirst({
          where: { id: input.appointmentId, facilityId, patientId: input.patientId },
        });
        if (!appointment)
          throw new BadRequestException('The appointment does not belong to this patient.');
      }
      if (input.departmentId)
        await this.requireDepartment(tx, facilityId, input.departmentId, 'ipd');
      await this.requireBeds(tx, facilityId, input.sourceBedId, input.targetBedId, input.departmentId);

      const duplicate = await tx.receptionCareRequest.findFirst({
        where: {
          facilityId,
          patientId: input.patientId,
          kind: input.kind,
          status: { in: ['pending', 'approved'] },
        },
      });
      if (duplicate)
        throw new ConflictException(`An open ${input.kind.replace('_', ' ')} request already exists.`);

      const sequence = await this.sequence.next(facilityId, 'reception_request', undefined, tx);
      const created = await tx.receptionCareRequest.create({
        data: {
          facilityId,
          reference: sequence.formatted,
          kind: input.kind,
          patientId: input.patientId,
          targetPatientId: input.targetPatientId,
          visitId: input.visitId,
          appointmentId: input.appointmentId,
          departmentId: input.departmentId,
          sourceBedId: input.sourceBedId,
          targetBedId: input.targetBedId,
          priority: input.priority,
          reason: input.reason,
          notes: input.notes,
          requestedBy: userId,
        },
        include: { patient: true, targetPatient: true, department: true },
      });
      return this.careRequestView(tx, created);
    });
  }

  reviewCareRequest(
    facilityId: string,
    userId: string,
    id: string,
    input: ReceptionCareReview,
  ) {
    return this.command(facilityId, userId, `reception.request.review:${id}`, input, async (tx) => {
      await tx.$queryRaw`SELECT id FROM reception_care_request WHERE id=${id} AND facility_id=${facilityId} FOR UPDATE`;
      const current = await tx.receptionCareRequest.findFirst({
        where: { id, facilityId },
        include: { patient: true, targetPatient: true, department: true },
      });
      if (!current) throw new NotFoundException('Reception request not found.');
      if (['approved', 'rejected'].includes(input.status) && current.requestedBy === userId)
        throw new ConflictException('A different authorised user must review this request.');
      const allowed =
        current.status === 'pending'
          ? ['approved', 'rejected', 'cancelled']
          : current.status === 'approved'
            ? ['completed', 'cancelled']
            : [];
      if (!allowed.includes(input.status))
        throw new ConflictException(`A ${current.status} request cannot become ${input.status}.`);
      if (input.status === 'rejected' && !input.note)
        throw new BadRequestException('A rejection needs a reason.');

      if (input.status === 'approved') {
        if (current.targetBedId) {
          const reserved = await tx.receptionBed.updateMany({
            where: { id: current.targetBedId, facilityId, status: 'available', isActive: true },
            data: { status: 'reserved' },
          });
          if (!reserved.count) throw new ConflictException('The requested bed is no longer available.');
        }
        if (current.kind === 'queue_priority' && current.visitId) {
          await tx.visit.updateMany({
            where: { id: current.visitId, facilityId, endedAt: null },
            data: {
              queuePriority: PRIORITY_VALUE[current.priority] ?? 0,
              queuePriorityReason: current.reason,
              queuePriorityApprovedBy: userId,
              queuePriorityApprovedAt: new Date(),
            },
          });
        }
      }
      if (input.status === 'cancelled' && current.targetBedId) {
        await tx.receptionBed.updateMany({
          where: { id: current.targetBedId, facilityId, status: 'reserved' },
          data: { status: 'available' },
        });
      }
      if (input.status === 'completed') {
        if (current.kind === 'discharge' && current.sourceBedId)
          await tx.receptionBed.updateMany({
            where: { id: current.sourceBedId, facilityId },
            data: { status: 'cleaning' },
          });
        if (current.kind === 'transfer') {
          if (current.sourceBedId)
            await tx.receptionBed.updateMany({
              where: { id: current.sourceBedId, facilityId },
              data: { status: 'cleaning' },
            });
          if (current.targetBedId)
            await tx.receptionBed.updateMany({
              where: { id: current.targetBedId, facilityId, status: 'reserved' },
              data: { status: 'occupied' },
            });
        }
        if (current.kind === 'admission' && current.targetBedId)
          await tx.receptionBed.updateMany({
            where: { id: current.targetBedId, facilityId, status: 'reserved' },
            data: { status: 'occupied' },
          });
      }

      const changed = await tx.receptionCareRequest.update({
        where: { id },
        data: {
          status: input.status,
          reviewNote: input.note,
          reviewedBy: userId,
          reviewedAt: new Date(),
          ...(input.status === 'completed' ? { completedAt: new Date() } : {}),
        },
        include: { patient: true, targetPatient: true, department: true },
      });
      return this.careRequestView(tx, changed);
    });
  }

  createWaitlist(facilityId: string, userId: string, input: WaitlistInput) {
    return this.command(facilityId, userId, 'reception.waitlist.create', input, async (tx) => {
      await this.requirePatient(tx, facilityId, input.patientId);
      await this.requireDepartment(tx, facilityId, input.departmentId);
      const open = await tx.appointmentWaitlist.findFirst({
        where: {
          facilityId,
          patientId: input.patientId,
          departmentId: input.departmentId,
          status: { in: ['waiting', 'offered'] },
        },
      });
      if (open) throw new ConflictException('This patient is already waiting for that department.');
      const row = await tx.appointmentWaitlist.create({
        data: {
          facilityId,
          patientId: input.patientId,
          departmentId: input.departmentId,
          practitionerId: input.practitionerId,
          preferredOn: input.preferredOn ? new Date(`${input.preferredOn}T00:00:00.000Z`) : null,
          priority: input.priority,
          note: input.note,
          createdBy: userId,
        },
      });
      return { id: row.id };
    });
  }

  updateWaitlist(
    facilityId: string,
    userId: string,
    id: string,
    input: WaitlistUpdate,
  ) {
    return this.command(facilityId, userId, `reception.waitlist.update:${id}`, input, async (tx) => {
      const current = await tx.appointmentWaitlist.findFirst({ where: { id, facilityId } });
      if (!current) throw new NotFoundException('Waitlist entry not found.');
      if (['booked', 'declined', 'cancelled'].includes(current.status))
        throw new ConflictException('This waitlist entry is already closed.');
      if (input.status === 'booked') {
        if (!input.appointmentId) throw new BadRequestException('Choose the booked appointment.');
        const appointment = await tx.appointment.findFirst({
          where: {
            id: input.appointmentId,
            facilityId,
            patientId: current.patientId,
            departmentId: current.departmentId,
          },
        });
        if (!appointment) throw new BadRequestException('The appointment does not match this waitlist entry.');
      }
      const row = await tx.appointmentWaitlist.update({
        where: { id },
        data: {
          status: input.status,
          appointmentId: input.appointmentId,
          note: input.note || current.note,
          ...(input.status === 'offered' ? { contactedAt: new Date() } : {}),
        },
      });
      return { id: row.id, status: row.status };
    });
  }

  async patientProfile(facilityId: string, patientId: string) {
    await this.requirePatient(this.prisma.db, facilityId, patientId);
    const [documents, contacts, coverages, deposits] = await Promise.all([
      this.prisma.db.patientDocument.findMany({
        where: { facilityId, patientId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.patientContact.findMany({
        where: { facilityId, patientId, archivedAt: null },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.db.patientCoverage.findMany({
        where: { facilityId, patientId },
        include: { panel: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.receptionPatientDeposit.findMany({
        where: { facilityId, patientId },
        orderBy: { receivedAt: 'desc' },
      }),
    ]);
    return {
      documents: documents.map((entry) => ({
        id: entry.id,
        category: entry.category,
        fileName: entry.fileName,
        mimeType: entry.mimeType,
        sizeBytes: entry.sizeBytes,
        sha256: entry.sha256,
        createdAt: entry.createdAt.toISOString(),
        voidedAt: iso(entry.voidedAt),
      })),
      contacts: contacts.map((entry) => ({
        id: entry.id,
        name: entry.name,
        relationship: entry.relationship,
        phone: entry.phone,
        kind: entry.kind,
        isPrimary: entry.isPrimary,
        isEmergency: entry.isEmergency,
        canCall: entry.canCall,
        canSms: entry.canSms,
        canWhatsapp: entry.canWhatsapp,
        safeInstructions: entry.safeInstructions,
        createdAt: entry.createdAt.toISOString(),
        archivedAt: iso(entry.archivedAt),
      })),
      coverages: coverages.map((entry) => ({
        id: entry.id,
        panelId: entry.panelId,
        panelName: entry.panel.name,
        memberNo: entry.memberNo,
        status: entry.status,
        validFrom: day(entry.validFrom),
        validTo: day(entry.validTo),
        notes: entry.notes,
        verifiedAt: iso(entry.verifiedAt),
      })),
      deposits: deposits.map((entry) => this.depositView(entry)),
    };
  }

  addDocument(
    facilityId: string,
    userId: string,
    patientId: string,
    input: PatientDocumentInput,
  ) {
    return this.command(facilityId, userId, `reception.document.create:${patientId}`, input, async (tx) => {
      await this.requirePatient(tx, facilityId, patientId);
      let content: Buffer;
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.contentBase64) || input.contentBase64.length % 4 !== 0)
        throw new BadRequestException('The document data is not valid base64.');
      try {
        content = Buffer.from(input.contentBase64, 'base64');
      } catch {
        throw new BadRequestException('The document data is not valid base64.');
      }
      if (!content.length || content.length > MAX_DOCUMENT_BYTES)
        throw new BadRequestException('Documents must be between 1 byte and 2 MB.');
      const signatureMatches =
        (input.mimeType === 'application/pdf' && content.subarray(0, 4).toString() === '%PDF') ||
        (input.mimeType === 'image/jpeg' && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) ||
        (input.mimeType === 'image/png' && content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
      if (!signatureMatches) throw new BadRequestException('The file content does not match its declared type.');
      const sha256 = createHash('sha256').update(content).digest('hex');
      const row = await tx.patientDocument.create({
        data: {
          facilityId,
          patientId,
          category: input.category,
          fileName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: content.length,
          sha256,
          content: new Uint8Array(content),
          uploadedBy: userId,
        },
      });
      return { id: row.id, sha256, sizeBytes: row.sizeBytes };
    });
  }

  async document(facilityId: string, patientId: string, documentId: string) {
    const row = await this.prisma.db.patientDocument.findFirst({
      where: { id: documentId, facilityId, patientId, voidedAt: null },
    });
    if (!row) throw new NotFoundException('Document not found.');
    return {
      fileName: row.fileName,
      mimeType: row.mimeType,
      contentBase64: Buffer.from(row.content).toString('base64'),
    };
  }

  addContact(
    facilityId: string,
    userId: string,
    patientId: string,
    input: PatientContactInput,
  ) {
    return this.command(facilityId, userId, `reception.contact.create:${patientId}`, input, async (tx) => {
      await this.requirePatient(tx, facilityId, patientId);
      if ((input.canCall || input.canSms || input.canWhatsapp) && !input.phone)
        throw new BadRequestException('A contact method needs a phone number.');
      if (input.isPrimary)
        await tx.patientContact.updateMany({
          where: { facilityId, patientId, archivedAt: null },
          data: { isPrimary: false },
        });
      const row = await tx.patientContact.create({
        data: {
          facilityId,
          patientId,
          name: input.name,
          relationship: input.relationship,
          phone: input.phone || null,
          kind: input.kind,
          isPrimary: input.isPrimary,
          isEmergency: input.isEmergency,
          canCall: input.canCall,
          canSms: input.canSms,
          canWhatsapp: input.canWhatsapp,
          safeInstructions: input.safeInstructions,
          createdBy: userId,
        },
      });
      return { id: row.id };
    });
  }

  archiveContact(facilityId: string, userId: string, id: string, idempotencyKey: string) {
    return this.command(
      facilityId,
      userId,
      `reception.contact.archive:${id}`,
      { idempotencyKey },
      async (tx) => {
        const row = await tx.patientContact.updateMany({
          where: { id, facilityId, archivedAt: null },
          data: { archivedAt: new Date(), canCall: false, canSms: false, canWhatsapp: false },
        });
        if (!row.count) throw new NotFoundException('Contact not found.');
        return { archived: true };
      },
    );
  }

  addCoverage(
    facilityId: string,
    userId: string,
    patientId: string,
    input: PatientCoverageInput,
    canVerify: boolean,
  ) {
    return this.command(facilityId, userId, `reception.coverage.create:${patientId}`, input, async (tx) => {
      await this.requirePatient(tx, facilityId, patientId);
      const panel = await tx.panel.findFirst({
        where: { id: input.panelId, facilityId, isActive: true },
      });
      if (!panel) throw new BadRequestException('Choose an active panel.');
      const status = canVerify ? input.status : 'pending';
      const row = await tx.patientCoverage.create({
        data: {
          facilityId,
          patientId,
          panelId: input.panelId,
          memberNo: input.memberNo,
          status,
          validFrom: input.validFrom ? new Date(`${input.validFrom}T00:00:00.000Z`) : null,
          validTo: input.validTo ? new Date(`${input.validTo}T00:00:00.000Z`) : null,
          notes: input.notes,
          createdBy: userId,
          ...(status !== 'pending' ? { verifiedBy: userId, verifiedAt: new Date() } : {}),
        },
      });
      return { id: row.id, status: row.status };
    });
  }

  createDeposit(facilityId: string, userId: string, input: PatientDepositInput) {
    return this.command(facilityId, userId, 'reception.deposit.create', input, async (tx) => {
      await this.requirePatient(tx, facilityId, input.patientId);
      const row = await tx.receptionPatientDeposit.create({
        data: {
          facilityId,
          patientId: input.patientId,
          amount: input.amount,
          method: input.method,
          reference: input.reference || null,
          receivedBy: userId,
        },
      });
      return this.depositView(row);
    });
  }

  closeDeposit(
    facilityId: string,
    userId: string,
    id: string,
    input: { status: 'applied' | 'refunded'; invoiceId: string | null; reason: string; idempotencyKey: string },
  ) {
    return this.command(facilityId, userId, `reception.deposit.close:${id}`, input, async (tx) => {
      const row = await tx.receptionPatientDeposit.findFirst({ where: { id, facilityId } });
      if (!row) throw new NotFoundException('Patient deposit not found.');
      if (row.status !== 'active') throw new ConflictException('This deposit is already closed.');
      if (input.status === 'applied') {
        const invoice = await tx.invoice.findFirst({
          where: { id: input.invoiceId ?? '', facilityId, patientId: row.patientId },
        });
        if (!invoice) throw new BadRequestException('Choose an invoice for the same patient.');
      }
      const changed = await tx.receptionPatientDeposit.update({
        where: { id },
        data: {
          status: input.status,
          appliedInvoiceId: input.status === 'applied' ? input.invoiceId : null,
          closedBy: userId,
          closedAt: new Date(),
          closeReason: input.reason,
        },
      });
      return this.depositView(changed);
    });
  }

  createReminder(facilityId: string, userId: string, input: ReminderInput) {
    return this.command(facilityId, userId, 'reception.reminder.create', input, async (tx) => {
      await this.requirePatient(tx, facilityId, input.patientId);
      if (!input.contactId)
        throw new BadRequestException('Choose a contact with recorded communication permission.');
      const contact = await tx.patientContact.findFirst({
        where: { id: input.contactId, facilityId, patientId: input.patientId, archivedAt: null },
      });
      const allowed =
        contact &&
        contact.phone === input.destination &&
        ((input.channel === 'sms' && contact.canSms) ||
          (input.channel === 'whatsapp' && contact.canWhatsapp));
      if (!allowed) throw new BadRequestException('That contact has not permitted this channel.');
      if (input.appointmentId) {
        const appointment = await tx.appointment.findFirst({
          where: { id: input.appointmentId, facilityId, patientId: input.patientId },
        });
        if (!appointment) throw new BadRequestException('Appointment does not match the patient.');
      }
      const row = await tx.receptionReminder.create({
        data: {
          facilityId,
          patientId: input.patientId,
          appointmentId: input.appointmentId,
          contactId: input.contactId,
          channel: input.channel,
          destination: input.destination,
          template: input.template,
          scheduledFor: new Date(input.scheduledFor),
          createdBy: userId,
        },
      });
      return { id: row.id, status: row.status };
    });
  }

  updateReminder(
    facilityId: string,
    userId: string,
    id: string,
    input: { status: 'sent' | 'failed' | 'cancelled'; failureReason: string; idempotencyKey: string },
  ) {
    return this.command(facilityId, userId, `reception.reminder.update:${id}`, input, async (tx) => {
      const row = await tx.receptionReminder.findFirst({ where: { id, facilityId } });
      if (!row) throw new NotFoundException('Reminder not found.');
      if (row.status !== 'queued') throw new ConflictException('Reminder is already final.');
      if (input.status === 'failed' && !input.failureReason)
        throw new BadRequestException('Record why delivery failed.');
      const changed = await tx.receptionReminder.update({
        where: { id },
        data: {
          status: input.status,
          failureReason: input.failureReason || null,
          ...(input.status === 'sent' ? { sentAt: new Date() } : {}),
        },
      });
      return { id: changed.id, status: changed.status };
    });
  }

  createHandover(facilityId: string, userId: string, input: HandoverInput) {
    return this.command(facilityId, userId, 'reception.handover.create', input, async (tx) => {
      if (input.toUserId) {
        const target = await tx.appUser.findFirst({
          where: { id: input.toUserId, facilityId, isActive: true, deletedAt: null },
        });
        if (!target) throw new BadRequestException('Choose an active staff member.');
      }
      const row = await tx.receptionShiftHandover.create({
        data: { facilityId, fromUserId: userId, toUserId: input.toUserId, note: input.note },
      });
      return { id: row.id, status: row.status };
    });
  }

  updateHandover(
    facilityId: string,
    userId: string,
    id: string,
    input: { status: 'acknowledged' | 'closed'; idempotencyKey: string },
  ) {
    return this.command(facilityId, userId, `reception.handover.update:${id}`, input, async (tx) => {
      const current = await tx.receptionShiftHandover.findFirst({ where: { id, facilityId } });
      if (!current) throw new NotFoundException('Handover not found.');
      if (input.status === 'acknowledged' && current.status !== 'open')
        throw new ConflictException('Only an open handover can be acknowledged.');
      if (input.status === 'closed' && current.status !== 'acknowledged')
        throw new ConflictException('A handover must be acknowledged before it closes.');
      if (input.status === 'acknowledged' && current.fromUserId === userId)
        throw new ConflictException('The receiving staff member must acknowledge the handover.');
      const row = await tx.receptionShiftHandover.update({
        where: { id },
        data:
          input.status === 'acknowledged'
            ? { status: 'acknowledged', acknowledgedBy: userId, acknowledgedAt: new Date() }
            : { status: 'closed', closedAt: new Date() },
      });
      return { id: row.id, status: row.status };
    });
  }

  closeTill(facilityId: string, userId: string, input: ReceptionTillCloseInput) {
    return this.command(facilityId, userId, 'reception.till.close', input, async (tx) => {
      const start = new Date(input.startsAt);
      const end = new Date(input.endsAt);
      if (end > new Date() || end.getTime() - start.getTime() > 86_400_000)
        throw new BadRequestException('Choose a completed reception shift of at most 24 hours.');
      const payments = await tx.payment.findMany({
        where: {
          receivedBy: userId,
          receivedAt: { gte: start, lt: end },
          method: 'cash',
          invoice: { facilityId },
        },
        select: { id: true, amount: true },
      });
      const deposits = await tx.receptionPatientDeposit.findMany({
        where: { facilityId, receivedBy: userId, receivedAt: { gte: start, lt: end }, method: 'cash' },
      });
      const cash = payments.reduce((sum, entry) => sum.add(entry.amount), new Prisma.Decimal(0));
      const advanceCash = deposits.reduce((sum, entry) => sum.add(entry.amount), new Prisma.Decimal(0));
      const refundedAdvanceCash = deposits
        .filter(
          (entry) =>
            entry.status === 'refunded' &&
            entry.closedAt &&
            entry.closedAt >= start &&
            entry.closedAt < end,
        )
        .reduce((sum, entry) => sum.add(entry.amount), new Prisma.Decimal(0));
      const expected = new Prisma.Decimal(input.opening).add(cash).add(advanceCash).sub(refundedAdvanceCash);
      const counted = new Prisma.Decimal(input.counted);
      const difference = counted.sub(expected);
      if (!difference.isZero() && !input.note)
        throw new BadRequestException('Explain the cash difference before closing.');
      const row = await tx.financeTillClose.create({
        data: {
          facilityId,
          userId,
          origin: 'reception',
          label: 'Reception shift',
          startsAt: start,
          endsAt: end,
          opening: input.opening,
          expected,
          counted,
          difference,
          paymentIds: payments.map((entry) => entry.id),
          note: input.note,
          createdBy: userId,
        },
      });
      return { id: row.id, expected: money(expected), difference: money(difference) };
    });
  }

  approveTill(facilityId: string, userId: string, id: string, idempotencyKey: string) {
    return this.command(
      facilityId,
      userId,
      `reception.till.approve:${id}`,
      { idempotencyKey },
      async (tx) => {
        const current = await tx.financeTillClose.findFirst({
          where: { id, facilityId, origin: 'reception' },
        });
        if (!current) throw new NotFoundException('Reception till close not found.');
        if (current.createdBy === userId)
          throw new ConflictException('A different supervisor must approve this till close.');
        if (current.approvedAt) throw new ConflictException('This till close is already approved.');
        await tx.financeTillClose.update({
          where: { id },
          data: { approvedBy: userId, approvedAt: new Date() },
        });
        return { approved: true };
      },
    );
  }

  async audit(facilityId: string, from?: string, to?: string, entity?: string) {
    const range = from ? facilityDayBoundsFor(from) : null;
    const endRange = to ? facilityDayBoundsFor(to) : null;
    const entities = [
      'ReceptionCareRequest',
      'ReceptionBed',
      'AppointmentWaitlist',
      'PatientDocument',
      'PatientContact',
      'PatientCoverage',
      'ReceptionPatientDeposit',
      'ReceptionReminder',
      'ReceptionShiftHandover',
      'FinanceTillClose',
    ];
    if (entity && !entities.includes(entity)) throw new BadRequestException('Unknown reception entity.');
    const rows = await this.prisma.db.auditLog.findMany({
      where: {
        facilityId,
        entity: entity ?? { in: entities },
        ...(range || endRange
          ? {
              createdAt: {
                ...(range ? { gte: range.start } : {}),
                ...(endRange ? { lt: endRange.end } : {}),
              },
            }
          : {}),
      },
      select: { id: true, userId: true, action: true, entity: true, entityId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 250,
    });
    return {
      logs: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    };
  }

  private bedView(entry: {
    id: string;
    code: string;
    label: string;
    departmentId: string;
    department: { name: string };
    roomId: string | null;
    room: { name: string } | null;
    status: string;
    notes: string;
    isActive: boolean;
  }) {
    return {
      id: entry.id,
      code: entry.code,
      label: entry.label,
      departmentId: entry.departmentId,
      departmentName: entry.department.name,
      roomId: entry.roomId,
      roomName: entry.room?.name ?? null,
      status: entry.status,
      notes: entry.notes,
      isActive: entry.isActive,
    };
  }

  private async careRequestView(
    tx: AuditedTx,
    entry: Awaited<ReturnType<AuditedTx['receptionCareRequest']['findFirstOrThrow']>> & {
      patient: { mrn: string; prefix: string | null; firstName: string; lastName: string | null };
      targetPatient: { prefix: string | null; firstName: string; lastName: string | null } | null;
      department: { name: string } | null;
    },
  ) {
    const actorIds = [entry.requestedBy, entry.reviewedBy].filter(Boolean) as string[];
    const actors = await tx.appUser.findMany({
      where: { id: { in: actorIds }, facilityId: entry.facilityId },
      select: { id: true, fullName: true },
    });
    const names = new Map(actors.map((actor) => [actor.id, actor.fullName]));
    return {
      id: entry.id,
      reference: entry.reference,
      kind: entry.kind,
      status: entry.status,
      priority: entry.priority,
      patientId: entry.patientId,
      patientName: fullName(entry.patient),
      patientMrn: entry.patient.mrn,
      targetPatientId: entry.targetPatientId,
      targetPatientName: entry.targetPatient ? fullName(entry.targetPatient) : null,
      visitId: entry.visitId,
      appointmentId: entry.appointmentId,
      departmentId: entry.departmentId,
      departmentName: entry.department?.name ?? null,
      sourceBedId: entry.sourceBedId,
      targetBedId: entry.targetBedId,
      reason: entry.reason,
      notes: entry.notes,
      requestedBy: entry.requestedBy,
      requestedByName: names.get(entry.requestedBy) ?? '',
      requestedAt: entry.requestedAt.toISOString(),
      reviewedBy: entry.reviewedBy,
      reviewedByName: entry.reviewedBy ? (names.get(entry.reviewedBy) ?? '') : null,
      reviewedAt: iso(entry.reviewedAt),
      reviewNote: entry.reviewNote,
      completedAt: iso(entry.completedAt),
    };
  }

  private depositView(entry: {
    id: string;
    patientId: string;
    amount: Prisma.Decimal;
    currency: string;
    method: string;
    reference: string | null;
    status: string;
    receivedAt: Date;
    appliedInvoiceId: string | null;
    closedAt: Date | null;
  }) {
    return {
      id: entry.id,
      patientId: entry.patientId,
      amount: money(entry.amount),
      currency: entry.currency,
      method: entry.method,
      reference: entry.reference,
      status: entry.status,
      receivedAt: entry.receivedAt.toISOString(),
      appliedInvoiceId: entry.appliedInvoiceId,
      closedAt: iso(entry.closedAt),
    };
  }

  private async requirePatient(tx: AuditedTx, facilityId: string, patientId: string) {
    const patient = await tx.patient.findFirst({
      where: { id: patientId, facilityId, deletedAt: null },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not found.');
    return patient;
  }

  private async requireDepartment(
    tx: AuditedTx,
    facilityId: string,
    departmentId: string,
    type?: 'ipd',
  ) {
    const department = await tx.department.findFirst({
      where: { id: departmentId, facilityId, isActive: true, ...(type ? { type } : {}) },
      select: { id: true },
    });
    if (!department)
      throw new BadRequestException(type === 'ipd' ? 'Choose an active IPD department.' : 'Choose an active department.');
    return department;
  }

  private async requireBeds(
    tx: AuditedTx,
    facilityId: string,
    sourceBedId: string | null,
    targetBedId: string | null,
    departmentId: string | null,
  ) {
    if (sourceBedId) {
      const source = await tx.receptionBed.findFirst({
        where: { id: sourceBedId, facilityId, isActive: true },
      });
      if (!source) throw new BadRequestException('Source bed not found.');
    }
    if (targetBedId) {
      const target = await tx.receptionBed.findFirst({
        where: {
          id: targetBedId,
          facilityId,
          isActive: true,
          status: 'available',
          ...(departmentId ? { departmentId } : {}),
        },
      });
      if (!target) throw new BadRequestException('Choose an available destination bed.');
    }
    if (sourceBedId && targetBedId && sourceBedId === targetBedId)
      throw new BadRequestException('Source and destination beds must be different.');
  }

  private maskDestination(value: string) {
    const compact = value.replace(/\s+/g, '');
    return compact.length <= 4 ? '••••' : `${compact.slice(0, 2)}••••${compact.slice(-2)}`;
  }
}
