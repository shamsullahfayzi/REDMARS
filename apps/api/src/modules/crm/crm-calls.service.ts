import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  normalizeCrmPhone,
  type CreateCrmCall,
  type CrmCallQuery,
  type CompleteCrmCall,
} from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../auth/auth-context';
import { idempotentCommand } from '../../common/idempotent-command';
import { CrmTimelineService, interactionInclude, projectInteraction } from './crm-timeline.service';
const include = {
  interaction: { include: interactionInclude },
  completer: { select: { fullName: true } },
} satisfies Prisma.CrmCallInclude;
type CallRow = Prisma.CrmCallGetPayload<{ include: typeof include }>;
@Injectable()
export class CrmCallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: CrmTimelineService,
  ) {}
  private project(
    row: CallRow,
    auth: AuthContext,
    access: Parameters<typeof projectInteraction>[2],
  ) {
    return {
      id: row.id,
      interaction: projectInteraction(row.interaction, auth, access),
      state: row.state,
      callerPhone: row.callerPhone,
      endedAt: row.endedAt?.toISOString() ?? null,
      nextAction: row.nextAction,
      actionNote: row.actionNote,
      relatedCallId: row.relatedCallId,
      version: row.version,
      completedAt: row.completedAt?.toISOString() ?? null,
      completedByName: row.completer?.fullName ?? null,
      completionNote: row.completionNote,
      canComplete:
        auth.permissions.has('crm.calls.write') && !row.completedAt && !row.interaction.voided,
    };
  }
  private async row(tx: Prisma.TransactionClient, auth: AuthContext, id: string) {
    const visibility = await this.timeline.visibility(tx, auth);
    const row = await tx.crmCall.findFirst({
      where: { id, facilityId: auth.facilityId, interaction: visibility.where },
      include,
    });
    if (!row) throw new NotFoundException();
    return { row, access: visibility.access };
  }
  async list(auth: AuthContext, q: CrmCallQuery) {
    return this.prisma.db.$transaction(async (tx) => {
      const visibility = await this.timeline.visibility(tx, auth),
        phone = normalizeCrmPhone(q.q);
      const where: Prisma.CrmCallWhereInput = {
        facilityId: auth.facilityId,
        ...(q.state === 'all' ? {} : { state: q.state }),
        ...(q.pending === 'all'
          ? {}
          : { completedAt: q.pending === 'pending' ? null : { not: null } }),
        interaction: {
          ...visibility.where,
          voided: false,
          ...(q.direction === 'all' ? {} : { direction: q.direction }),
        },
        ...(q.q
          ? {
              OR: [
                ...(phone.length >= 3 ? [{ callerPhone: { contains: phone } }] : []),
                { interaction: { contact: { name: { contains: q.q, mode: 'insensitive' } } } },
                { interaction: { lead: { title: { contains: q.q, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      };
      const rows = await tx.crmCall.findMany({
        where,
        include,
        orderBy: [{ interaction: { occurredAt: 'desc' } }, { id: 'desc' }],
        take: 25,
        skip: (q.page - 1) * 25,
      });
      const total = await tx.crmCall.count({ where });
      return {
        items: rows.map((r) => this.project(r, auth, visibility.access)),
        total,
        page: q.page,
        canWrite: auth.permissions.has('crm.calls.write'),
        canViewFollowUps: auth.permissions.has('follow_up.read'),
      };
    });
  }
  async detail(auth: AuthContext, id: string) {
    return this.prisma.db.$transaction(async (tx) => {
      const { row, access } = await this.row(tx, auth, id);
      const revisions = await tx.crmInteractionRevision.findMany({
        where: { facilityId: auth.facilityId, interactionId: row.interactionId },
        include: { actor: { select: { fullName: true } } },
        orderBy: { version: 'desc' },
      });
      return {
        call: this.project(row, auth, access),
        history: revisions.map((r) => ({
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
  async create(auth: AuthContext, input: CreateCrmCall) {
    if (input.endedAt && Date.parse(input.endedAt) > Date.now() + 300000)
      throw new BadRequestException({
        code: 'crm_call_time',
        message: 'The call end time cannot be in the future.',
      });
    const result = await this.prisma.db.$transaction((tx) =>
      idempotentCommand(
        tx,
        {
          facilityId: auth.facilityId,
          userId: auth.userId,
          operation: 'crm.call.create',
          key: input.idempotencyKey,
          input,
        },
        async () => {
          if (input.relatedCallId) {
            const { row: prior } = await this.row(tx, auth, input.relatedCallId);
            if (
              prior.interaction.voided ||
              prior.interaction.contactId !== input.contactId ||
              prior.interaction.leadId !== input.leadId ||
              prior.interaction.linkId !== input.linkId ||
              prior.interaction.purpose !== input.purpose ||
              prior.callerPhone !== input.callerPhone
            )
              throw new BadRequestException({
                code: 'crm_call_callback',
                message:
                  'A callback must retain the original caller and subject. Record a separate call if they differ.',
              });
          }
          const { state, callerPhone, endedAt, nextAction, actionNote, relatedCallId, ...entry } =
            input;
          const interaction = await this.timeline.recordInTransaction(
            tx,
            auth,
            { ...entry, channel: 'call' },
            true,
          );
          const row = await tx.crmCall.create({
            data: {
              facilityId: auth.facilityId,
              interactionId: interaction.id,
              state,
              callerPhone,
              endedAt: endedAt ? new Date(endedAt) : null,
              nextAction,
              actionNote,
              relatedCallId,
              completedAt: nextAction === 'none' ? new Date() : null,
              completedBy: nextAction === 'none' ? auth.userId : null,
            },
          });
          return { id: row.id };
        },
      ),
    );
    return this.detail(auth, result.id);
  }
  async complete(auth: AuthContext, id: string, input: CompleteCrmCall) {
    await this.prisma.db.$transaction(async (tx) => {
      const { row } = await this.row(tx, auth, id);
      if (row.version !== input.expectedVersion || row.completedAt || row.interaction.voided)
        throw new ConflictException({
          code: 'crm_call_conflict',
          message: 'This action changed or is no longer pending. Reload the call.',
        });
      await tx.crmCall.update({
        where: { id },
        data: {
          version: { increment: 1 },
          completedAt: new Date(),
          completedBy: auth.userId,
          completionNote: input.completionNote,
        },
      });
    });
    return this.detail(auth, id);
  }
}
