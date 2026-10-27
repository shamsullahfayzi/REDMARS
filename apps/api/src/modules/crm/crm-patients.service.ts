import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  linkCrmPatientSchema,
  registerCrmPatientSchema,
  unlinkCrmPatientSchema,
} from '@redmars/shared';
import { PrismaService, AuditedTx } from '../../prisma/prisma.service';
import { AuthContext } from '../../auth/auth-context';
import { idempotentCommand } from '../../common/idempotent-command';
import { PatientService } from '../patient/patient.service';
import { CrmTimelineService } from './crm-timeline.service';

@Injectable()
export class CrmPatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientService,
    private readonly timeline: CrmTimelineService,
  ) {}
  private async lead(tx: AuditedTx, auth: AuthContext, id: string) {
    const lead = await tx.crmLead.findFirst({
      where: { id, facilityId: auth.facilityId },
      include: { contact: true },
    });
    if (!lead) throw new NotFoundException();
    return lead;
  }
  private canEdit(auth: AuthContext, lead: { ownerId: string | null; status: string }) {
    return (
      auth.permissions.has('crm.patients.link') &&
      (auth.permissions.has('crm.leads.assign') || lead.ownerId === auth.userId) &&
      lead.status === 'qualified'
    );
  }
  private canRegister(auth: AuthContext) {
    return (
      auth.permissions.has('patient.create') &&
      auth.permissions.has('crm.contacts.authorize') &&
      auth.permissions.has('patient.search')
    );
  }
  async detail(auth: AuthContext, id: string) {
    return this.prisma.db.$transaction(async (tx) => {
      const lead = await this.lead(tx, auth, id);
      const visibility = await this.timeline.visibility(tx, auth, lead.contactId);
      const mappings = await tx.crmLeadPatient.findMany({
        where: { leadId: id, facilityId: auth.facilityId },
        include: { link: { include: { patient: true } } },
        orderBy: { createdAt: 'desc' },
      });
      const patient = (p: {
        id: string;
        firstName: string;
        lastName: string | null;
        mrn: string;
      }) => ({ id: p.id, name: [p.firstName, p.lastName].filter(Boolean).join(' '), mrn: p.mrn });
      const visible = (m: (typeof mappings)[number]) =>
        visibility.access.has(m.linkId) ||
        (this.canRegister(auth) &&
          m.link.authority === 'pending' &&
          !lead.contact?.archived &&
          !m.link.patient.deletedAt &&
          !m.link.patient.isDeceased);
      const current = mappings.find((m) => !m.revokedAt);
      const until = (m: (typeof mappings)[number]) => {
        const end = visibility.access.get(m.linkId)?.until;
        return end !== undefined && Number.isFinite(end) ? new Date(end).toISOString() : null;
      };
      const links =
        lead.contactId && !lead.contact?.archived
          ? await tx.crmRelationship.findMany({
              where: {
                contactId: lead.contactId,
                facilityId: auth.facilityId,
                id: { in: [...visibility.access.keys()] },
              },
              include: { patient: true },
            })
          : [];
      return {
        expectedVersion: lead.version,
        canLink:
          this.canEdit(auth, lead) && !!lead.contactId && !lead.contact?.archived && !current,
        canRegister:
          this.canEdit(auth, lead) &&
          this.canRegister(auth) &&
          !!lead.contactId &&
          !lead.contact?.archived &&
          !current,
        canUnlink:
          !!current &&
          auth.permissions.has('crm.contacts.authorize') &&
          auth.permissions.has('crm.patients.link'),
        current: current
          ? {
              id: current.id,
              patient: visible(current) ? patient(current.link.patient) : null,
              restricted: !visible(current),
              visibleUntil: until(current),
            }
          : null,
        candidates: links.map((l) => ({
          linkId: l.id,
          patient: patient(l.patient),
          visibleUntil: Number.isFinite(visibility.access.get(l.id)!.until)
            ? new Date(visibility.access.get(l.id)!.until).toISOString()
            : null,
        })),
        history: mappings.map((m) => ({
          id: m.id,
          action: m.action,
          createdAt: m.createdAt.toISOString(),
          revokedAt: m.revokedAt?.toISOString() ?? null,
          reason: m.reason,
          patient: visible(m) ? patient(m.link.patient) : null,
          visibleUntil: until(m),
        })),
      };
    });
  }
  async change(
    auth: AuthContext,
    id: string,
    input:
      | z.infer<typeof linkCrmPatientSchema>
      | z.infer<typeof registerCrmPatientSchema>
      | z.infer<typeof unlinkCrmPatientSchema>,
    operation: 'link' | 'register' | 'unlink',
  ) {
    await this.prisma.db.$transaction(async (tx) => {
      const lead = await this.lead(tx, auth, id);
      if (operation === 'unlink') {
        if (!auth.permissions.has('crm.contacts.authorize')) throw new ForbiddenException();
      } else {
        if (!this.canEdit(auth, lead) || !lead.contactId || lead.contact?.archived)
          throw new ForbiddenException(
            'Qualify the lead and select an active contact before linking.',
          );
        if (operation === 'register' && !this.canRegister(auth))
          throw new ForbiddenException(
            'Registration requires existing patient registration and authorization permissions.',
          );
        if ('linkId' in input) {
          const v = await this.timeline.visibility(tx, auth, lead.contactId);
          if (!v.access.has(input.linkId))
            throw new ForbiddenException(
              'Verify the caller and patient relationship before linking.',
            );
          const rel = await tx.crmRelationship.findFirst({
            where: { id: input.linkId, facilityId: auth.facilityId, contactId: lead.contactId },
          });
          if (!rel) throw new ForbiddenException();
        }
      }
      await idempotentCommand(
        tx,
        {
          facilityId: auth.facilityId,
          userId: auth.userId,
          operation: 'crm.patient.' + operation,
          key: input.idempotencyKey,
          input: { id, ...input },
        },
        async () => {
          if (lead.version !== input.expectedVersion)
            throw new ConflictException('Lead changed. Reload before saving.');
          const active = await tx.crmLeadPatient.findFirst({
            where: { leadId: id, facilityId: auth.facilityId, revokedAt: null },
          });
          if (operation === 'unlink' && 'reason' in input) {
            if (!active) throw new ConflictException('No active mapping.');
            await tx.crmLeadPatient.update({
              where: { id: active.id },
              data: { revokedAt: new Date(), revokedBy: auth.userId, reason: input.reason },
            });
          } else {
            if (active)
              throw new ConflictException(
                'Correct the existing mapping before linking another patient.',
              );
            let linkId: string, patientId: string;
            if ('patient' in input) {
              // PatientService owns duplicate scoring, stable IDs and MRN issuance.
              const matches = await this.patients.findDuplicates(
                auth.facilityId,
                input.patient,
                tx,
              );
              if (matches.length && !input.patient.acknowledgeDuplicate)
                throw new ConflictException({
                  code: 'duplicate_patient',
                  message: 'Review possible duplicates before registering.',
                  matches,
                });
              const p = await this.patients.create(auth.facilityId, auth.userId, input.patient, tx);
              patientId = p.id;
              const rel = await tx.crmRelationship.create({
                data: {
                  facilityId: auth.facilityId,
                  contactId: lead.contactId!,
                  patientId,
                  relationship: input.relationship,
                  authority: 'pending',
                },
              });
              linkId = rel.id;
            } else if ('linkId' in input) {
              const rel = await tx.crmRelationship.findFirstOrThrow({
                where: {
                  id: input.linkId,
                  facilityId: auth.facilityId,
                  contactId: lead.contactId!,
                },
              });
              linkId = rel.id;
              patientId = rel.patientId;
            } else throw new BadRequestException();
            await tx.crmLeadPatient.create({
              data: {
                facilityId: auth.facilityId,
                leadId: id,
                linkId,
                patientId,
                action: operation === 'register' ? 'registered' : 'linked',
                createdBy: auth.userId,
              },
            });
          }
          const updated = await tx.crmLead.updateMany({
            where: { id, facilityId: auth.facilityId, version: input.expectedVersion },
            data: { version: { increment: 1 } },
          });
          if (updated.count !== 1)
            throw new ConflictException('Lead changed. Reload before saving.');
          return { id };
        },
      );
    });
    return this.detail(auth, id);
  }
}
