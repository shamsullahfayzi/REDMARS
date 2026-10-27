import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CRM_DEFAULT_SETTINGS,
  crmSettingsResponseSchema,
  type CreateCrmInteraction,
  type CorrectCrmInteraction,
  type CrmTimelineQuery,
} from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { idempotentCommand } from '../../common/idempotent-command';
import type { AuthContext } from '../../auth/auth-context';

export const interactionInclude = {
  author: { select: { fullName: true } },
  call: { select: { id: true } },
  link: { select: { patient: { select: { firstName: true, lastName: true, mrn: true } } } },
} satisfies Prisma.CrmInteractionInclude;
type Row = Prisma.CrmInteractionGetPayload<{ include: typeof interactionInclude }>;
const correctable = (r: Row, a: AuthContext) =>
  !r.voided &&
  a.permissions.has('crm.interactions.write') &&
  (r.recordedBy === a.userId || a.permissions.has('crm.interactions.correct'));
type Access = Map<string, { authority: string; until: number }>;
export function projectInteraction(r: Row, a: AuthContext, access: Access) {
  return {
    id: r.id,
    callId: r.call?.id ?? null,
    leadId: r.leadId,
    contactId: r.contactId,
    linkId: r.linkId,
    purpose: r.purpose,
    channel: r.channel,
    direction: r.direction,
    occurredAt: r.occurredAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    visibleUntil: new Date(
      Math.min(r.expiresAt.getTime(), r.linkId ? access.get(r.linkId)!.until : Infinity),
    ).toISOString(),
    recordedBy: r.recordedBy,
    actorName: r.author.fullName,
    summary: r.voided ? '' : r.summary,
    outcome: r.outcome,
    version: r.version,
    voided: r.voided,
    canCorrect: correctable(r, a),
    patient: r.link
      ? {
          name: [r.link.patient.firstName, r.link.patient.lastName].filter(Boolean).join(' '),
          mrn: r.link.patient.mrn,
        }
      : null,
  };
}

@Injectable()
export class CrmTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  // Filter before pagination/counting, including every detail/revision endpoint.
  // Caller checks are scoped to agent + relationship + current contact version.
  async visibility(
    tx: Prisma.TransactionClient,
    auth: AuthContext,
    contactId?: string | null,
  ): Promise<{ where: Prisma.CrmInteractionWhereInput; access: Access }> {
    const links = await tx.crmRelationship.findMany({
      where: {
        facilityId: auth.facilityId,
        ...(contactId ? { contactId } : {}),
        authority: { in: ['scheduling', 'follow_up', 'both'] },
        contact: { archived: false },
        patient: { deletedAt: null, isDeceased: false },
      },
      select: {
        id: true,
        authority: true,
        contact: { select: { version: true } },
        verifications: {
          where: { verifiedBy: auth.userId, passed: true, expiresAt: { gt: new Date() } },
          select: { contactVersion: true, expiresAt: true },
        },
      },
    });
    const allowed = links.filter(
      (l) =>
        auth.permissions.has('crm.contacts.authorize') ||
        l.verifications.some((v) => v.contactVersion === l.contact.version),
    );
    const access: Access = new Map(
      allowed.map((l) => [
        l.id,
        {
          authority: l.authority,
          until: auth.permissions.has('crm.contacts.authorize')
            ? Infinity
            : Math.max(
                ...l.verifications
                  .filter((v) => v.contactVersion === l.contact.version)
                  .map((v) => v.expiresAt.getTime()),
              ),
        },
      ]),
    );
    return {
      access,
      where: {
        facilityId: auth.facilityId,
        expiresAt: { gt: new Date() },
        OR: [
          { linkId: null },
          ...(['scheduling', 'follow_up'] as const).map((purpose) => ({
            purpose,
            linkId: {
              in: allowed
                .filter((l) => l.authority === 'both' || l.authority === purpose)
                .map((l) => l.id),
            },
          })),
        ],
      },
    };
  }
  private async subject(
    tx: Prisma.TransactionClient,
    auth: AuthContext,
    query: { leadId?: string | null; contactId?: string | null },
  ) {
    if (
      query.leadId &&
      !(await tx.crmLead.findFirst({
        where: { id: query.leadId, facilityId: auth.facilityId },
        select: { id: true },
      }))
    )
      throw new NotFoundException();
    if (
      query.contactId &&
      !(await tx.crmContact.findFirst({
        where: { id: query.contactId, facilityId: auth.facilityId },
        select: { id: true },
      }))
    )
      throw new NotFoundException();
  }
  async list(auth: AuthContext, query: CrmTimelineQuery) {
    return this.prisma.db.$transaction(async (tx) => {
      await this.subject(tx, auth, query);
      const visibility = await this.visibility(tx, auth, query.contactId);
      const where: Prisma.CrmInteractionWhereInput = {
        ...visibility.where,
        ...(query.leadId ? { leadId: query.leadId } : { contactId: query.contactId }),
        ...(query.channel === 'all' ? {} : { channel: query.channel }),
        ...(query.direction === 'all' ? {} : { direction: query.direction }),
      };
      const items = await tx.crmInteraction.findMany({
        where,
        include: interactionInclude,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 25,
        skip: (query.page - 1) * 25,
      });
      const total = await tx.crmInteraction.count({ where });
      return {
        items: items.map((r) => projectInteraction(r, auth, visibility.access)),
        total,
        page: query.page,
        canWrite: auth.permissions.has('crm.interactions.write'),
      };
    });
  }
  private async row(tx: Prisma.TransactionClient, auth: AuthContext, id: string) {
    const visibility = await this.visibility(tx, auth);
    const row = await tx.crmInteraction.findFirst({
      where: { ...visibility.where, id },
      include: interactionInclude,
    });
    if (!row) throw new NotFoundException();
    return { row, access: visibility.access };
  }
  async detail(auth: AuthContext, id: string) {
    return this.prisma.db.$transaction(async (tx) => {
      const { row, access } = await this.row(tx, auth, id);
      const revisions = await tx.crmInteractionRevision.findMany({
        where: { interactionId: id, facilityId: auth.facilityId },
        include: { actor: { select: { fullName: true } } },
        orderBy: { version: 'desc' },
      });
      return {
        interaction: projectInteraction(row, auth, access),
        revisions: revisions.map((r) => ({
          version: r.version,
          summary: r.summary,
          outcome: r.outcome,
          voided: r.voided,
          reason: r.reason,
          actorName: r.actor.fullName,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    });
  }
  async recordInTransaction(
    tx: Prisma.TransactionClient,
    auth: AuthContext,
    input: CreateCrmInteraction,
    call = false,
  ) {
    if (!call && !input.leadId && !input.contactId) throw new BadRequestException();
    await this.subject(tx, auth, input);
    if (input.contactId) {
      const c = await tx.crmContact.findUniqueOrThrow({ where: { id: input.contactId } });
      if (c.archived)
        throw new BadRequestException({
          code: 'crm_timeline_contact',
          message: 'Restore the contact before recording a new interaction.',
        });
    }
    if (input.leadId) {
      const lead = await tx.crmLead.findUniqueOrThrow({ where: { id: input.leadId } });
      if (lead.contactId !== input.contactId)
        throw new BadRequestException({
          code: 'crm_timeline_subject',
          message: 'The lead contact changed. Reload before recording the interaction.',
        });
    }
    if (input.linkId) {
      const link = await tx.crmRelationship.findFirst({
        where: { id: input.linkId, contactId: input.contactId!, facilityId: auth.facilityId },
        select: { id: true },
      });
      const visible = await this.visibility(tx, auth, input.contactId);
      const scope = visible.access.get(input.linkId);
      const allowed = scope && (scope.authority === 'both' || scope.authority === input.purpose);
      if (!link || !allowed)
        throw new ForbiddenException({
          code: 'crm_timeline_authority',
          message:
            'A current caller check and authorized patient relationship are required for this purpose.',
        });
    }
    const setting = await tx.setting.findUnique({
      where: { facilityId_key: { facilityId: auth.facilityId, key: 'crm.settings' } },
    });
    const policy = crmSettingsResponseSchema.parse(
      setting?.value ?? { ...CRM_DEFAULT_SETTINGS, version: 0 },
    );
    const occurredAt = new Date(input.occurredAt),
      expiresAt = new Date(occurredAt.getTime() + policy.interactionRetentionDays * 86400000);
    if (occurredAt.getTime() > Date.now() + 300000 || expiresAt.getTime() <= Date.now())
      throw new BadRequestException({
        code: 'crm_timeline_time',
        message: 'Choose an event time within the timeline retention period and not in the future.',
      });
    const { idempotencyKey: _key, ...data } = input;
    void _key;
    const row = await tx.crmInteraction.create({
      data: {
        ...data,
        kind: call ? 'call' : 'interaction',
        occurredAt,
        expiresAt,
        facilityId: auth.facilityId,
        recordedBy: auth.userId,
      },
    });
    await tx.crmInteractionRevision.create({
      data: {
        facilityId: auth.facilityId,
        interactionId: row.id,
        version: 0,
        summary: row.summary,
        outcome: row.outcome,
        voided: false,
        reason: '',
        changedBy: auth.userId,
      },
    });
    return { id: row.id };
  }
  async create(auth: AuthContext, input: CreateCrmInteraction) {
    const result = await this.prisma.db.$transaction((tx) =>
      idempotentCommand(
        tx,
        {
          facilityId: auth.facilityId,
          userId: auth.userId,
          operation: 'crm.interaction.create',
          key: input.idempotencyKey,
          input,
        },
        () => this.recordInTransaction(tx, auth, input),
      ),
    );
    return this.detail(auth, result.id);
  }
  async correct(auth: AuthContext, id: string, input: CorrectCrmInteraction) {
    await this.prisma.db.$transaction(async (tx) => {
      const { row } = await this.row(tx, auth, id);
      if (row.call && input.outcome !== row.outcome)
        throw new BadRequestException({
          code: 'crm_call_outcome',
          message:
            'Call outcomes are fixed. Withdraw an incorrect call and record its replacement.',
        });
      if (!correctable(row, auth))
        throw new ForbiddenException({
          code: 'crm_timeline_correction',
          message: 'Only the author or an administrator may correct an active entry.',
        });
      if (row.version !== input.expectedVersion)
        throw new ConflictException({
          code: 'crm_timeline_conflict',
          message: 'This interaction changed. Reload before correcting it.',
        });
      const version = row.version + 1;
      await tx.crmInteraction.update({
        where: { id },
        data: { summary: input.summary, outcome: input.outcome, voided: input.voided, version },
      });
      await tx.crmInteractionRevision.create({
        data: {
          facilityId: auth.facilityId,
          interactionId: id,
          version,
          summary: input.summary,
          outcome: input.outcome,
          voided: input.voided,
          reason: input.reason,
          changedBy: auth.userId,
        },
      });
    });
    return this.detail(auth, id);
  }
}
