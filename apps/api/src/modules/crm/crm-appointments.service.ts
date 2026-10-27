import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  createCrmAppointmentSchema,
  cancelCrmAppointmentSchema,
  crmAppointmentQuerySchema,
  crmAvailabilityQuerySchema,
} from '@redmars/shared';
import { PrismaService, AuditedTx } from '../../prisma/prisma.service';
import { AuthContext } from '../../auth/auth-context';
import { idempotentCommand } from '../../common/idempotent-command';
import {
  facilityDayBoundsFor,
  facilityDateString,
  FACILITY_TIME_ZONE,
} from '../../common/facility-time';
import { AppointmentService } from '../appointment/appointment.service';
import { CrmTimelineService } from './crm-timeline.service';
const select = {
  id: true,
  status: true,
  scheduledAt: true,
  endsAt: true,
  crmLinkId: true,
  department: { select: { name: true } },
  practitioner: { select: { firstName: true, lastName: true } },
} satisfies Prisma.AppointmentSelect;
type Row = Prisma.AppointmentGetPayload<{ select: typeof select }>;
const project = (r: Row) => ({
  id: r.id,
  status: r.status,
  scheduledAt: r.scheduledAt.toISOString(),
  endsAt: r.endsAt?.toISOString() ?? null,
  departmentName: r.department.name,
  practitionerName: r.practitioner
    ? [r.practitioner.firstName, r.practitioner.lastName].join(' ')
    : null,
  fromCrm: !!r.crmLinkId,
});
@Injectable()
export class CrmAppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: CrmTimelineService,
    private readonly appointments: AppointmentService,
  ) {}
  private async access(tx: AuditedTx, auth: AuthContext, linkId: string) {
    const v = await this.timeline.visibility(tx, auth),
      scope = v.access.get(linkId);
    if (!scope || !['scheduling', 'both'].includes(scope.authority))
      throw new ForbiddenException(
        'Verify the caller and scheduling authority before accessing appointments.',
      );
    const link = await tx.crmRelationship.findFirst({
      where: { id: linkId, facilityId: auth.facilityId },
    });
    if (!link) throw new NotFoundException();
    return {
      link,
      visibleUntil: Number.isFinite(scope.until) ? new Date(scope.until).toISOString() : null,
    };
  }
  async options(auth: AuthContext) {
    return this.prisma.db.$transaction(async (tx) => {
      const v = await this.timeline.visibility(tx, auth);
      const ids = [...v.access]
        .filter(([, s]) => ['scheduling', 'both'].includes(s.authority))
        .map(([id]) => id);
      const links = await tx.crmRelationship.findMany({
        where: { facilityId: auth.facilityId, id: { in: ids } },
        include: {
          contact: { select: { name: true } },
          patient: { select: { firstName: true, lastName: true, mrn: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      const departments = await tx.department.findMany({
        where: { facilityId: auth.facilityId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      const providers = await tx.practitioner.findMany({
        where: { facilityId: auth.facilityId, isActive: true, deletedAt: null },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          departments: { select: { departmentId: true } },
        },
        orderBy: { firstName: 'asc' },
      });
      return {
        timezone: FACILITY_TIME_ZONE,
        canWrite: auth.permissions.has('crm.appointments.write'),
        departments,
        practitioners: providers.map((p) => ({
          id: p.id,
          name: [p.firstName, p.lastName].join(' '),
          departmentIds: p.departments.map((d) => d.departmentId),
        })),
        links: links.map((l) => ({
          id: l.id,
          contactId: l.contactId,
          contactName: l.contact.name,
          patientName: [l.patient.firstName, l.patient.lastName].filter(Boolean).join(' '),
          mrn: l.patient.mrn,
          visibleUntil: Number.isFinite(v.access.get(l.id)!.until)
            ? new Date(v.access.get(l.id)!.until).toISOString()
            : null,
        })),
      };
    });
  }
  async list(auth: AuthContext, q: z.infer<typeof crmAppointmentQuerySchema>) {
    return this.prisma.db.$transaction(async (tx) => {
      const a = await this.access(tx, auth, q.linkId),
        bounds = facilityDayBoundsFor(q.date);
      const rows = await tx.appointment.findMany({
        where: {
          facilityId: auth.facilityId,
          patientId: a.link.patientId,
          scheduledAt: { gte: bounds.start, lt: bounds.end },
        },
        select,
        orderBy: { scheduledAt: 'asc' },
      });
      return { items: rows.map(project), visibleUntil: a.visibleUntil };
    });
  }
  async availability(auth: AuthContext, q: z.infer<typeof crmAvailabilityQuerySchema>) {
    const provider = await this.prisma.db.practitioner.findFirst({
      where: { id: q.practitionerId, facilityId: auth.facilityId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (!provider) throw new NotFoundException();
    const bounds = facilityDayBoundsFor(q.date);
    const rows = await this.prisma.db.appointment.findMany({
      where: {
        facilityId: auth.facilityId,
        practitionerId: q.practitionerId,
        status: { in: ['booked', 'arrived', 'fulfilled'] },
        scheduledAt: { gte: bounds.start, lt: bounds.end },
      },
      select: { scheduledAt: true, endsAt: true },
      orderBy: { scheduledAt: 'asc' },
    });
    return {
      timezone: FACILITY_TIME_ZONE,
      dateOnlyCount: rows.filter((r) => !r.endsAt).length,
      busy: rows.map((r) => ({
        scheduledAt: r.scheduledAt.toISOString(),
        endsAt: r.endsAt?.toISOString() ?? null,
      })),
    };
  }
  async create(auth: AuthContext, input: z.infer<typeof createCrmAppointmentSchema>) {
    const result = await this.prisma.db.$transaction(async (tx) => {
      const { link } = await this.access(tx, auth, input.linkId);
      if (input.leadId) {
        const mapping = await tx.crmLeadPatient.findFirst({
          where: { leadId: input.leadId, facilityId: auth.facilityId, revokedAt: null },
        });
        if (mapping && mapping.patientId !== link.patientId)
          throw new BadRequestException(
            'This lead is linked to a different patient. Review the patient mapping.',
          );
      }
      if (
        input.leadId &&
        !(await tx.crmLead.findFirst({
          where: { id: input.leadId, facilityId: auth.facilityId, contactId: link.contactId },
        }))
      )
        throw new BadRequestException('Choose a lead belonging to this contact.');
      return idempotentCommand(
        tx,
        {
          facilityId: auth.facilityId,
          userId: auth.userId,
          operation: 'crm.appointment.create',
          key: input.idempotencyKey,
          input,
        },
        async () => {
          const row = await this.appointments.createIn(
            tx,
            auth.facilityId,
            auth.userId,
            {
              patientId: link.patientId,
              departmentId: input.departmentId,
              practitionerId: input.practitionerId,
              scheduledOn: facilityDateString(new Date(input.scheduledAt)),
              scheduledAt: input.scheduledAt,
              durationMinutes: input.durationMinutes,
              reason: null,
            },
            { crmLinkId: link.id, crmLeadId: input.leadId },
          );
          await this.timeline.recordInTransaction(tx, auth, {
            contactId: link.contactId,
            linkId: link.id,
            leadId: input.leadId,
            purpose: 'scheduling',
            channel: 'other',
            direction: 'internal',
            occurredAt: new Date().toISOString(),
            summary: 'Appointment booked',
            outcome: 'information_given',
            idempotencyKey: input.idempotencyKey,
          });
          return { id: row.id };
        },
      );
    });
    return this.detail(auth, input.linkId, result.id);
  }
  private async detail(auth: AuthContext, linkId: string, id: string) {
    return this.prisma.db.$transaction(async (tx) => {
      const a = await this.access(tx, auth, linkId);
      const row = await tx.appointment.findFirst({
        where: { id, facilityId: auth.facilityId, patientId: a.link.patientId },
        select,
      });
      if (!row) throw new NotFoundException();
      return project(row);
    });
  }
  async cancel(auth: AuthContext, id: string, input: z.infer<typeof cancelCrmAppointmentSchema>) {
    await this.prisma.db.$transaction(async (tx) => {
      const { link } = await this.access(tx, auth, input.linkId);
      const row = await tx.appointment.findFirst({
        where: { id, facilityId: auth.facilityId, patientId: link.patientId },
      });
      if (!row) throw new NotFoundException();
      return idempotentCommand(
        tx,
        {
          facilityId: auth.facilityId,
          userId: auth.userId,
          operation: 'crm.appointment.cancel:' + id,
          key: input.idempotencyKey,
          input,
        },
        async () => {
          await this.appointments.closeIn(tx, auth.facilityId, id, {
            status: 'cancelled',
            reason: null,
          });
          await this.timeline.recordInTransaction(tx, auth, {
            contactId: link.contactId,
            linkId: link.id,
            leadId: null,
            purpose: 'scheduling',
            channel: 'other',
            direction: 'internal',
            occurredAt: new Date().toISOString(),
            summary: 'Appointment cancelled',
            outcome: 'information_given',
            idempotencyKey: input.idempotencyKey,
          });
          return { id };
        },
      );
    });
    return this.detail(auth, input.linkId, id);
  }
}
