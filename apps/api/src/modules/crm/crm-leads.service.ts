import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CRM_LEAD_TRANSITIONS,
  normalizeCrmPhone,
  type CreateCrmLead,
  type UpdateCrmLead,
  type CrmLeadQuery,
  type CrmLeadStatus,
} from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { idempotentCommand } from '../../common/idempotent-command';
import type { AuthContext } from '../../auth/auth-context';
import { CrmService } from './crm.service';

const include = {
  owner: { select: { id: true, fullName: true, isActive: true, deletedAt: true } },
  contact: { select: { id: true, name: true, archived: true, doNotContact: true } },
} satisfies Prisma.CrmLeadInclude;
type LeadRow = Prisma.CrmLeadGetPayload<{ include: typeof include }>;
const assigning = (auth: AuthContext) => auth.permissions.has('crm.leads.assign');
const ownerWhere = (facilityId: string): Prisma.AppUserWhereInput => ({
  facilityId,
  isActive: true,
  deletedAt: null,
  AND: ['crm.read', 'crm.leads.write'].map((code) => ({
    userRoles: {
      some: { role: { rolePermissions: { some: { permission: { code }, condition: null } } } },
    },
  })),
});
function project(row: LeadRow, auth: AuthContext) {
  return {
    id: row.id,
    title: row.title,
    contactId: row.contactId,
    ownerId: row.ownerId,
    source: row.source,
    sourceDetail: row.sourceDetail,
    serviceInterest: row.serviceInterest,
    status: row.status,
    needsConfirmed: row.needsConfirmed,
    serviceMatched: row.serviceMatched,
    qualificationNotes: row.qualificationNotes,
    closedReason: row.closedReason,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    contact: row.contact,
    owner: row.owner
      ? {
          id: row.owner.id,
          name: row.owner.fullName,
          active: row.owner.isActive && !row.owner.deletedAt,
        }
      : null,
    canEdit:
      auth.permissions.has('crm.leads.write') &&
      (assigning(auth) || (row.ownerId === auth.userId && row.status !== 'closed')),
    canClaim:
      auth.permissions.has('crm.leads.write') && row.ownerId === null && row.status !== 'closed',
    canAssign: assigning(auth),
  };
}
@Injectable()
export class CrmLeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmService,
  ) {}

  async options(auth: AuthContext) {
    const [users, workspace] = await Promise.all([
      this.prisma.db.appUser.findMany({
        where: { ...ownerWhere(auth.facilityId), ...(assigning(auth) ? {} : { id: auth.userId }) },
        select: { id: true, fullName: true },
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        take: 200,
      }),
      this.crm.workspace(auth),
    ]);
    return {
      owners: users.map((u) => ({ id: u.id, name: u.fullName, active: true })),
      canAssign: assigning(auth),
      currentUserId: auth.userId,
      serviceAreas: workspace.settings.serviceAreas,
    };
  }

  async list(auth: AuthContext, query: CrmLeadQuery) {
    const phone = normalizeCrmPhone(query.q);
    const where: Prisma.CrmLeadWhereInput = {
      facilityId: auth.facilityId,
      ...(query.status === 'all' ? {} : { status: query.status }),
      ...(query.source === 'all' ? {} : { source: query.source }),
      ...(query.owner === 'all'
        ? {}
        : {
            ownerId:
              query.owner === 'mine'
                ? auth.userId
                : query.owner === 'unassigned'
                  ? null
                  : query.owner,
          }),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { serviceInterest: { contains: query.q, mode: 'insensitive' } },
              { contact: { name: { contains: query.q, mode: 'insensitive' } } },
              ...(phone.length >= 3
                ? [
                    {
                      contact: {
                        OR: [{ phone: { contains: phone } }, { altPhone: { contains: phone } }],
                      },
                    },
                  ]
                : []),
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.db.crmLead.findMany({
        where,
        include,
        take: 25,
        skip: (query.page - 1) * 25,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.db.crmLead.count({ where }),
    ]);
    return { items: items.map((row) => project(row, auth)), total, page: query.page };
  }

  private async row(tx: Prisma.TransactionClient, auth: AuthContext, id: string, version?: number) {
    const row = await tx.crmLead.findFirst({ where: { id, facilityId: auth.facilityId }, include });
    if (!row) throw new NotFoundException();
    if (version !== undefined && version !== row.version)
      throw new ConflictException({
        code: 'crm_lead_conflict',
        message: 'This lead changed. Reload before saving.',
      });
    return row;
  }

  async detail(auth: AuthContext, id: string) {
    return this.prisma.db.$transaction(async (tx) => {
      const row = await this.row(tx, auth, id);
      const history = await tx.crmLeadStatusChange.findMany({
        where: { facilityId: auth.facilityId, leadId: id },
        orderBy: { sequence: 'desc' },
        include: { actor: { select: { fullName: true } } },
      });
      return {
        lead: project(row, auth),
        history: history.map((h) => ({
          id: h.id,
          fromStatus: h.fromStatus,
          toStatus: h.toStatus,
          reason: h.reason,
          changedBy: h.changedBy,
          actorName: h.actor.fullName,
          createdAt: h.createdAt.toISOString(),
        })),
      };
    });
  }

  private async references(
    tx: Prisma.TransactionClient,
    auth: AuthContext,
    input: { contactId: string | null; ownerId: string | null },
    current?: LeadRow,
    qualifying = false,
  ) {
    if (input.contactId) {
      const c = await tx.crmContact.findFirst({
        where: { id: input.contactId, facilityId: auth.facilityId },
      });
      if (!c || (c.archived && (qualifying || current?.contactId !== input.contactId)))
        throw new BadRequestException({
          code: 'crm_lead_contact',
          message: 'Choose an active contact from this facility.',
        });
    }
    if (input.ownerId && (!current || input.ownerId !== current.ownerId || qualifying)) {
      if (
        !(await tx.appUser.findFirst({
          where: { ...ownerWhere(auth.facilityId), id: input.ownerId },
          select: { id: true },
        }))
      )
        throw new BadRequestException({
          code: 'crm_lead_owner',
          message: 'Choose an active CRM owner from this facility.',
        });
    }
  }

  private async duplicates(
    tx: Prisma.TransactionClient,
    facilityId: string,
    input: {
      title: string;
      contactId: string | null;
      serviceInterest: string;
      duplicateReviewed: boolean;
    },
    id?: string,
  ) {
    const candidates = await tx.crmLead.findMany({
      where: {
        facilityId,
        status: { not: 'closed' },
        ...(id ? { id: { not: id } } : {}),
        ...(input.contactId
          ? {
              contactId: input.contactId,
              serviceInterest: { equals: input.serviceInterest, mode: 'insensitive' },
            }
          : { contactId: null, title: { equals: input.title, mode: 'insensitive' } }),
      },
      take: 5,
      select: { id: true, title: true, status: true },
    });
    if (candidates.length && !input.duplicateReviewed)
      throw new ConflictException({
        code: 'crm_lead_duplicates',
        message: 'Similar open inquiries exist. Review them before creating a separate lead.',
        candidates,
      });
  }

  async create(auth: AuthContext, input: CreateCrmLead) {
    if (!assigning(auth) && input.ownerId !== auth.userId)
      throw new ForbiddenException({
        code: 'crm_lead_assignment',
        message: 'New leads must be assigned to you. Ask an administrator to reassign them.',
      });
    const result = await this.prisma.db.$transaction((tx) =>
      idempotentCommand(
        tx,
        {
          facilityId: auth.facilityId,
          userId: auth.userId,
          operation: 'crm.lead.create',
          key: input.idempotencyKey,
          input,
        },
        async () => {
          await this.references(tx, auth, input);
          await this.duplicates(tx, auth.facilityId, input);
          const { idempotencyKey: _key, duplicateReviewed: _reviewed, ...data } = input;
          void _key;
          void _reviewed;
          const row = await tx.crmLead.create({ data: { ...data, facilityId: auth.facilityId } });
          await tx.crmLeadStatusChange.create({
            data: {
              facilityId: auth.facilityId,
              leadId: row.id,
              toStatus: 'new',
              reason: '',
              changedBy: auth.userId,
              sequence: 0,
            },
          });
          return { id: row.id };
        },
      ),
    );
    return this.detail(auth, result.id);
  }

  async update(auth: AuthContext, id: string, input: UpdateCrmLead) {
    await this.prisma.db.$transaction(async (tx) => {
      const row = await this.row(tx, auth, id, input.expectedVersion);
      if (
        input.contactId !== row.contactId &&
        (await tx.crmLeadPatient.findFirst({
          where: { leadId: id, facilityId: auth.facilityId, revokedAt: null },
        }))
      )
        throw new ConflictException(
          'Correct the patient mapping before changing the lead contact.',
        );
      if (!assigning(auth) && (row.ownerId !== auth.userId || input.ownerId !== row.ownerId))
        throw new ForbiddenException({
          code: 'crm_lead_assignment',
          message: 'Only the assigned agent or an administrator may edit this lead.',
        });
      if (
        row.status === 'closed' &&
        (!assigning(auth) || input.status !== 'new' || !input.changeReason)
      )
        throw new BadRequestException({
          code: 'crm_lead_closed',
          message: 'An administrator must reopen this lead to New with a reason before editing.',
        });
      if (
        input.status !== row.status &&
        !CRM_LEAD_TRANSITIONS[row.status as CrmLeadStatus]?.includes(input.status)
      )
        throw new BadRequestException({
          code: 'crm_lead_transition',
          message:
            'This stage change is not allowed. Record contact before qualifying a new inquiry.',
        });
      if (
        input.status === 'qualified' &&
        row.status === 'qualified' &&
        input.contactId !== row.contactId
      )
        throw new BadRequestException({
          code: 'crm_lead_requalify',
          message: 'Return to Contacted before changing the contact on a qualified lead.',
        });
      await this.references(tx, auth, input, row, input.status === 'qualified');
      if (
        input.status !== 'closed' &&
        (row.status === 'closed' ||
          input.contactId !== row.contactId ||
          input.serviceInterest !== row.serviceInterest ||
          input.title !== row.title)
      )
        await this.duplicates(tx, auth.facilityId, input, id);
      const {
        expectedVersion: _version,
        changeReason,
        duplicateReviewed: _reviewed,
        ...data
      } = input;
      void _version;
      void _reviewed;
      await tx.crmLead.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
      if (input.status !== row.status)
        await tx.crmLeadStatusChange.create({
          data: {
            facilityId: auth.facilityId,
            leadId: id,
            fromStatus: row.status,
            toStatus: input.status,
            reason: changeReason || input.closedReason || '',
            changedBy: auth.userId,
            sequence: row.version + 1,
          },
        });
    });
    return this.detail(auth, id);
  }

  async claim(auth: AuthContext, id: string, expectedVersion: number) {
    await this.prisma.db.$transaction(async (tx) => {
      const row = await this.row(tx, auth, id, expectedVersion);
      if (row.ownerId || row.status === 'closed')
        throw new ConflictException({
          code: 'crm_lead_claim',
          message: 'Only an open unassigned lead can be claimed. Reload the lead.',
        });
      await this.references(tx, auth, { contactId: row.contactId, ownerId: auth.userId }, row);
      await tx.crmLead.update({
        where: { id },
        data: { ownerId: auth.userId, version: { increment: 1 } },
      });
    });
    return this.detail(auth, id);
  }
}
