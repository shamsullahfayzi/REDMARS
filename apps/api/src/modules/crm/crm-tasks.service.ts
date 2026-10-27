import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateCrmTask, UpdateCrmTask, CrmTaskQuery } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../auth/auth-context';
import { idempotentCommand } from '../../common/idempotent-command';
import { CrmTimelineService, interactionInclude, projectInteraction } from './crm-timeline.service';
const include = {
  interaction: { include: interactionInclude },
  owner: { select: { fullName: true } },
  prescription: { select: { followUpDate: true } },
} satisfies Prisma.CrmTaskInclude;
type Row = Prisma.CrmTaskGetPayload<{ include: typeof include }>;
const active = (status: string) => ['open', 'in_progress'].includes(status);
const supervisor = (auth: AuthContext) => auth.permissions.has('crm.tasks.assign');
const ownerWhere = (facilityId: string): Prisma.AppUserWhereInput => ({
  facilityId,
  isActive: true,
  deletedAt: null,
  AND: ['crm.read', 'crm.tasks.write'].map((code) => ({
    userRoles: {
      some: { role: { rolePermissions: { some: { permission: { code }, condition: null } } } },
    },
  })),
});
@Injectable()
export class CrmTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: CrmTimelineService,
  ) {}
  private project(r: Row, auth: AuthContext, access: Parameters<typeof projectInteraction>[2]) {
    const editable =
      auth.permissions.has('crm.tasks.write') &&
      (supervisor(auth) || (r.ownerId === auth.userId && active(r.status)));
    return {
      id: r.id,
      title: r.title,
      notes: r.notes,
      ownerId: r.ownerId,
      ownerName: r.owner?.fullName ?? null,
      dueAt: r.dueAt.toISOString(),
      reminderAt: r.reminderAt?.toISOString() ?? null,
      priority: r.priority,
      status: r.status,
      outcome: r.outcome,
      version: r.version,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      closedAt: r.closedAt?.toISOString() ?? null,
      reminderAcknowledgedAt: r.reminderAcknowledgedAt?.toISOString() ?? null,
      escalations: r.escalations,
      interaction: projectInteraction(r.interaction, auth, access),
      overdue: active(r.status) && r.dueAt.getTime() < Date.now(),
      reminderDue:
        active(r.status) &&
        !!r.reminderAt &&
        r.reminderAt.getTime() <= Date.now() &&
        !r.reminderAcknowledgedAt,
      canEdit: editable,
      canClaim: auth.permissions.has('crm.tasks.write') && !r.ownerId && active(r.status),
      canAcknowledge: editable && active(r.status),
      prescriptionId: r.prescriptionId,
      followUpDate: r.prescription?.followUpDate?.toISOString().slice(0, 10) ?? null,
    };
  }
  private async visibility(tx: Prisma.TransactionClient, auth: AuthContext) {
    const visibility = await this.timeline.visibility(tx, auth);
    const where: Prisma.CrmTaskWhereInput = {
      facilityId: auth.facilityId,
      interaction: { ...visibility.where, voided: false },
      ...(auth.permissions.has('follow_up.read') ? {} : { prescriptionId: null }),
    };
    return { ...visibility, where };
  }
  private async row(tx: Prisma.TransactionClient, auth: AuthContext, id: string, version?: number) {
    const v = await this.visibility(tx, auth),
      row = await tx.crmTask.findFirst({ where: { ...v.where, id }, include });
    if (!row) throw new NotFoundException();
    if (version !== undefined && row.version !== version)
      throw new ConflictException('This task changed. Reload before saving.');
    return { row, access: v.access };
  }
  private async source(tx: Prisma.TransactionClient, auth: AuthContext, id: string) {
    const v = await this.timeline.visibility(tx, auth),
      r = await tx.crmInteraction.findFirst({
        where: { ...v.where, id, voided: false },
        include: interactionInclude,
      });
    if (!r) throw new NotFoundException();
    return r;
  }
  private async owner(tx: Prisma.TransactionClient, auth: AuthContext, id: string | null) {
    if (
      id &&
      !(await tx.appUser.findFirst({
        where: { ...ownerWhere(auth.facilityId), id },
        select: { id: true },
      }))
    )
      throw new BadRequestException('Choose active CRM staff in this facility.');
  }
  private editable(r: Row, auth: AuthContext) {
    if (!supervisor(auth) && (!active(r.status) || r.ownerId !== auth.userId))
      throw new ForbiddenException('Only the owner or a CRM administrator may change this task.');
  }
  private schedule(dueAt: string, reminderAt: string | null, expiry: Date) {
    if (
      Date.parse(dueAt) >= expiry.getTime() ||
      (reminderAt && Date.parse(reminderAt) > Date.parse(dueAt))
    )
      throw new BadRequestException(
        'Due time must be before source retention expiry; reminder must be at or before due time.',
      );
  }
  private async history(
    tx: Prisma.TransactionClient,
    r: Row,
    auth: AuthContext,
    event: string,
    reason: string,
  ) {
    await tx.crmTaskHistory.create({
      data: {
        facilityId: r.facilityId,
        taskId: r.id,
        version: r.version,
        event,
        title: r.title,
        notes: r.notes,
        ownerId: r.ownerId,
        dueAt: r.dueAt,
        reminderAt: r.reminderAt,
        priority: r.priority,
        status: r.status,
        outcome: r.outcome,
        reason,
        changedBy: auth.userId,
      },
    });
  }
  async options(auth: AuthContext) {
    const users = await this.prisma.db.appUser.findMany({
      where: { ...ownerWhere(auth.facilityId), ...(supervisor(auth) ? {} : { id: auth.userId }) },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
      take: 200,
    });
    return {
      owners: users.map((u) => ({ id: u.id, name: u.fullName })),
      currentUserId: auth.userId,
      canAssign: supervisor(auth),
    };
  }
  async followUps(auth: AuthContext, interactionId: string) {
    return this.prisma.db.$transaction(async (tx) => {
      const source = await this.source(tx, auth, interactionId);
      if (
        !auth.permissions.has('follow_up.read') ||
        !source.linkId ||
        source.purpose !== 'follow_up'
      )
        return { items: [] };
      const link = await tx.crmRelationship.findFirstOrThrow({
        where: { id: source.linkId, facilityId: auth.facilityId },
        select: { patientId: true },
      });
      const rows = await tx.prescription.findMany({
        where: {
          visit: { facilityId: auth.facilityId, patientId: link.patientId },
          followUpDate: { not: null },
        },
        select: { id: true, followUpDate: true },
        orderBy: { followUpDate: 'desc' },
        take: 50,
      });
      return {
        items: rows.map((r) => ({
          id: r.id,
          followUpDate: r.followUpDate!.toISOString().slice(0, 10),
        })),
      };
    });
  }
  async list(auth: AuthContext, q: CrmTaskQuery) {
    return this.prisma.db.$transaction(async (tx) => {
      const v = await this.visibility(tx, auth),
        now = new Date();
      const where: Prisma.CrmTaskWhereInput = {
        AND: [
          v.where,
          ...(q.owner === 'all' ? [] : [{ ownerId: q.owner === 'mine' ? auth.userId : null }]),
          ...(q.status === 'all'
            ? []
            : [{ status: q.status === 'active' ? { in: ['open', 'in_progress'] } : q.status }]),
          ...(q.priority === 'all' ? [] : [{ priority: q.priority }]),
          ...(q.q
            ? [
                {
                  OR: [
                    { title: { contains: q.q, mode: 'insensitive' as const } },
                    {
                      interaction: {
                        contact: { name: { contains: q.q, mode: 'insensitive' as const } },
                      },
                    },
                  ],
                },
              ]
            : []),
          ...(q.queue === 'overdue'
            ? [{ status: { in: ['open', 'in_progress'] }, dueAt: { lt: now } }]
            : q.queue === 'reminders'
              ? [
                  {
                    status: { in: ['open', 'in_progress'] },
                    reminderAt: { lte: now },
                    reminderAcknowledgedAt: null,
                  },
                ]
              : q.queue === 'escalated'
                ? [{ escalations: { gt: 0 }, status: { in: ['open', 'in_progress'] } }]
                : []),
        ],
      };
      const items = await tx.crmTask.findMany({
        where,
        include,
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        take: 25,
        skip: (q.page - 1) * 25,
      });
      return {
        items: items.map((r) => this.project(r, auth, v.access)),
        total: await tx.crmTask.count({ where }),
        page: q.page,
        canWrite: auth.permissions.has('crm.tasks.write'),
        canAssign: supervisor(auth),
      };
    });
  }
  async detail(auth: AuthContext, id: string) {
    return this.prisma.db.$transaction(async (tx) => {
      const { row, access } = await this.row(tx, auth, id);
      const history = await tx.crmTaskHistory.findMany({
        where: { taskId: id, facilityId: auth.facilityId },
        include: { actor: { select: { fullName: true } }, owner: { select: { fullName: true } } },
        orderBy: { version: 'desc' },
      });
      return {
        task: this.project(row, auth, access),
        history: history.map((h) => ({
          version: h.version,
          event: h.event,
          title: h.title,
          notes: h.notes,
          ownerName: h.owner?.fullName ?? null,
          dueAt: h.dueAt.toISOString(),
          reminderAt: h.reminderAt?.toISOString() ?? null,
          priority: h.priority,
          status: h.status,
          outcome: h.outcome,
          reason: h.reason,
          actorName: h.actor.fullName,
          createdAt: h.createdAt.toISOString(),
        })),
      };
    });
  }
  async create(auth: AuthContext, input: CreateCrmTask) {
    const result = await this.prisma.db.$transaction((tx) =>
      idempotentCommand(
        tx,
        {
          facilityId: auth.facilityId,
          userId: auth.userId,
          operation: 'crm.task.create',
          key: input.idempotencyKey,
          input,
        },
        async () => {
          const source = await this.source(tx, auth, input.interactionId);
          if (!supervisor(auth) && input.ownerId !== auth.userId)
            throw new ForbiddenException('Agents create tasks assigned to themselves.');
          await this.owner(tx, auth, input.ownerId);
          this.schedule(input.dueAt, input.reminderAt, source.expiresAt);
          if (input.prescriptionId) {
            if (
              !auth.permissions.has('follow_up.read') ||
              !source.linkId ||
              source.purpose !== 'follow_up'
            )
              throw new ForbiddenException();
            const link = await tx.crmRelationship.findFirstOrThrow({
              where: { id: source.linkId, facilityId: auth.facilityId },
              select: { patientId: true },
            });
            const p = await tx.prescription.findFirst({
              where: {
                id: input.prescriptionId,
                followUpDate: { not: null },
                visit: { facilityId: auth.facilityId, patientId: link.patientId },
              },
              select: { id: true },
            });
            if (!p) throw new NotFoundException();
          }
          const { idempotencyKey: _key, ...data } = input;
          void _key;
          const row = await tx.crmTask.create({
            data: {
              ...data,
              facilityId: auth.facilityId,
              dueAt: new Date(input.dueAt),
              reminderAt: input.reminderAt ? new Date(input.reminderAt) : null,
            },
            include,
          });
          await this.history(tx, row, auth, 'created', '');
          return { id: row.id };
        },
      ),
    );
    return this.detail(auth, result.id);
  }
  async update(auth: AuthContext, id: string, input: UpdateCrmTask) {
    await this.prisma.db.$transaction(async (tx) => {
      const { row } = await this.row(tx, auth, id, input.expectedVersion);
      this.editable(row, auth);
      if (!supervisor(auth) && input.ownerId !== row.ownerId)
        throw new ForbiddenException('Only a CRM administrator may reassign tasks.');
      if (!active(row.status) && (!supervisor(auth) || !active(input.status)))
        throw new BadRequestException('Reopen this task before editing it.');
      if (input.status === 'in_progress' && !input.ownerId)
        throw new BadRequestException('Assign an owner before starting work.');
      await this.owner(tx, auth, input.ownerId);
      this.schedule(input.dueAt, input.reminderAt, row.interaction.expiresAt);
      const reset =
        input.ownerId !== row.ownerId ||
        Date.parse(input.dueAt) !== row.dueAt.getTime() ||
        (input.reminderAt ? Date.parse(input.reminderAt) : null) !==
          (row.reminderAt?.getTime() ?? null) ||
        !active(row.status);
      const { expectedVersion: _version, reason, ...data } = input;
      void _version;
      const changed = await tx.crmTask.update({
        where: { id },
        data: {
          ...data,
          dueAt: new Date(input.dueAt),
          reminderAt: input.reminderAt ? new Date(input.reminderAt) : null,
          closedAt: active(input.status) ? null : new Date(),
          reminderAcknowledgedAt: reset ? null : row.reminderAcknowledgedAt,
          version: { increment: 1 },
        },
        include,
      });
      await this.history(
        tx,
        changed,
        auth,
        !active(row.status)
          ? 'reopened'
          : !active(input.status)
            ? 'closed'
            : row.ownerId !== input.ownerId
              ? 'assigned'
              : 'updated',
        reason,
      );
    });
    return this.detail(auth, id);
  }
  async action(
    auth: AuthContext,
    id: string,
    version: number,
    event: 'claimed' | 'acknowledged' | 'escalated',
    reason = '',
  ) {
    await this.prisma.db.$transaction(async (tx) => {
      const { row } = await this.row(tx, auth, id, version);
      if (!active(row.status)) throw new ConflictException('This task is closed.');
      let data: Prisma.CrmTaskUncheckedUpdateInput = { version: { increment: 1 } };
      if (event === 'claimed') {
        if (row.ownerId) throw new ConflictException('This task already has an owner.');
        await this.owner(tx, auth, auth.userId);
        data = { ...data, ownerId: auth.userId, reminderAcknowledgedAt: null };
      } else {
        this.editable(row, auth);
        if (event === 'acknowledged') {
          if (
            !row.reminderAt ||
            row.reminderAt.getTime() > Date.now() ||
            row.reminderAcknowledgedAt
          )
            throw new ConflictException('No pending reminder for this schedule.');
          data = { ...data, reminderAcknowledgedAt: new Date() };
        } else data = { ...data, priority: 'urgent', escalations: { increment: 1 } };
      }
      const changed = await tx.crmTask.update({ where: { id }, data, include });
      await this.history(tx, changed, auth, event, reason);
    });
    return this.detail(auth, id);
  }
}
