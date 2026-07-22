import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type {
  CreateTemplateRequest,
  Template,
  TemplateListQuery,
  TemplateListResponse,
} from '@redmars/shared';
import { complaintTemplateContentSchema } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

type TemplateRow = {
  id: string;
  type: string;
  name: string;
  content: unknown;
  practitionerId: string | null;
  createdAt: Date;
};

@Injectable()
export class TemplateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The shared list plus the caller's own — never a colleague's private ones.
   *
   * That narrowing is the whole confidentiality story for templates and it lives in this
   * query rather than in the permission, because `template.read` is about being allowed
   * to see a list at all, not about whose list.
   */
  async list(
    facilityId: string,
    userId: string,
    query: TemplateListQuery,
  ): Promise<TemplateListResponse> {
    const mine = await this.practitionerIdOf(facilityId, userId);

    const rows = await this.prisma.db.template.findMany({
      where: {
        facilityId,
        type: query.type,
        OR: [{ practitionerId: null }, ...(mine ? [{ practitionerId: mine }] : [])],
      },
      select: {
        id: true,
        type: true,
        name: true,
        content: true,
        practitionerId: true,
        createdAt: true,
      },
      // Shared first, then alphabetical: the hospital's agreed phrasing is what a new
      // doctor should reach for before their own.
      orderBy: [{ practitionerId: 'asc' }, { name: 'asc' }],
    });

    return { templates: rows.map((row) => this.toTemplate(row, mine)) };
  }

  /**
   * Save a phrase. Two permissions, not one: `template.manage.own` gets you here, and a
   * SHARED template additionally needs `template.manage.shared`, which is admin only. The
   * guard holds one permission per route by design, so the conditional second one is
   * checked here — the same split `payment.refund` uses when there is money to give back.
   */
  async create(
    facilityId: string,
    userId: string,
    permissions: ReadonlyMap<string, string | null>,
    input: CreateTemplateRequest,
  ): Promise<Template> {
    // Validated per type rather than by the request schema alone, because `content` is a
    // Json column and task 4.12's prescription templates will put something else in it.
    const content = complaintTemplateContentSchema.parse(input.content);

    let practitionerId: string | null = null;
    if (input.shared) {
      if (!permissions.has('template.manage.shared')) {
        throw new ForbiddenException({
          message: 'Only an administrator can add to the hospital’s shared templates.',
          code: 'shared_template_denied',
        });
      }
    } else {
      practitionerId = await this.practitionerIdOf(facilityId, userId);
      // An admin has no practitioner record and no private list to save into. Saying so
      // beats writing a row with a null owner that silently became everyone's.
      if (!practitionerId) {
        throw new BadRequestException({
          message: 'Your account is not linked to a practitioner, so it has no own templates.',
          code: 'no_practitioner',
        });
      }
    }

    const created = await this.prisma.db.template.create({
      data: { facilityId, practitionerId, type: input.type, name: input.name, content },
      select: {
        id: true,
        type: true,
        name: true,
        content: true,
        practitionerId: true,
        createdAt: true,
      },
    });

    return this.toTemplate(created, practitionerId);
  }

  private async practitionerIdOf(facilityId: string, userId: string): Promise<string | null> {
    const practitioner = await this.prisma.db.practitioner.findFirst({
      where: { facilityId, userId },
      select: { id: true },
    });
    return practitioner?.id ?? null;
  }

  private toTemplate(row: TemplateRow, mine: string | null): Template {
    return {
      id: row.id,
      type: row.type as Template['type'],
      name: row.name,
      // Parsed on the way out too. `content` is Json, so the database cannot promise its
      // shape — a row written by an older build must fail loudly here rather than reach a
      // screen as undefined.
      content: complaintTemplateContentSchema.parse(row.content),
      isShared: row.practitionerId === null,
      isMine: mine !== null && row.practitionerId === mine,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
