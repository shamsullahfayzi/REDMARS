import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateTemplateRequest,
  Template,
  TemplateListQuery,
  TemplateListResponse,
  TemplateType,
} from '@redmars/shared';
import { complaintTemplateContentSchema, prescriptionTemplateContentSchema } from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';

type TemplateRow = {
  id: string;
  type: string;
  name: string;
  content: unknown;
  practitionerId: string | null;
  createdAt: Date;
};

/**
 * One shape per type, for a Json column the database cannot make promises about.
 *
 * Used on the way IN and on the way OUT. Parsing the stored value again on read is not
 * belt-and-braces: `content` is Json, so a row written by an older build — or by a type
 * whose shape changed — must fail loudly here rather than reach a screen as undefined and
 * be rendered as a blank drug line.
 */
const CONTENT_SCHEMAS = {
  complaint: complaintTemplateContentSchema,
  prescription: prescriptionTemplateContentSchema,
} as const;

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
   * Save a phrase or a regimen. Two permissions, not one: `template.manage.own` gets you
   * here, and a SHARED template additionally needs `template.manage.shared`, which is admin
   * only. The guard holds one permission per route by design, so the conditional second one
   * is checked here — the same split `payment.refund` uses when there is money to give back.
   */
  async create(
    facilityId: string,
    userId: string,
    permissions: ReadonlyMap<string, string | null>,
    input: CreateTemplateRequest,
  ): Promise<Template> {
    const content = CONTENT_SCHEMAS[input.type].parse(input.content);

    // Task 4.12 — a template naming a drug that is not in this facility's formulary, or is
    // no longer dispensed, is a one-click way to produce a prescription that cannot be
    // saved. Refused at the point it is written rather than every time it is applied.
    if (input.type === 'prescription') {
      await this.requireDispensableDrugs(
        facilityId,
        input.content.items.map((item) => item.drugId),
      );
    }

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

  /**
   * Remove a template. Not in task 4.12's done-when, and here anyway.
   *
   * A phrase saved by mistake is an irritation. A five-drug regimen saved by mistake, in a
   * list a colleague reads as the hospital's agreed starting point, is something else — and
   * a doctor who cannot undo their first attempt learns not to make a second. Every
   * template list in every system fills with "test" and "asdf" for exactly this reason.
   *
   * OWNERSHIP DECIDES, not the permission alone. `template.manage.own` gets you here and
   * lets you delete YOUR OWN; removing a shared one is the hospital's list changing and
   * needs `template.manage.shared`, the same split `create` uses. A colleague's private
   * template is not deletable by anyone — and answers 404 rather than 403, because whether
   * another doctor has a template called "my depression starter" is not this caller's to
   * learn.
   */
  async remove(
    facilityId: string,
    userId: string,
    permissions: ReadonlyMap<string, string | null>,
    id: string,
  ): Promise<TemplateListResponse> {
    const row = await this.prisma.db.template.findFirst({
      where: { id, facilityId },
      select: { id: true, type: true, practitionerId: true },
    });
    if (!row) throw new NotFoundException('Template not found');

    if (row.practitionerId === null) {
      if (!permissions.has('template.manage.shared')) {
        throw new ForbiddenException({
          message: 'Only an administrator can remove a shared template.',
          code: 'shared_template_denied',
        });
      }
    } else {
      const mine = await this.practitionerIdOf(facilityId, userId);
      if (row.practitionerId !== mine) throw new NotFoundException('Template not found');
    }

    // A single delete, never deleteMany: the audit extension does not cover batch calls,
    // and a shared template vanishing from the hospital's list is a change someone will
    // want to be able to trace.
    await this.prisma.db.template.delete({ where: { id: row.id } });

    return this.list(facilityId, userId, { type: row.type as TemplateType });
  }

  /**
   * Every drug named by a prescription template must exist here and still be dispensed.
   *
   * Both failures name the drug rather than the id. "Unknown drug" with a uuid in it is a
   * message for whoever wrote the client, not for the doctor holding the screen.
   */
  private async requireDispensableDrugs(facilityId: string, drugIds: string[]): Promise<void> {
    const unique = [...new Set(drugIds)];
    const drugs = await this.prisma.db.drug.findMany({
      where: { id: { in: unique }, facilityId },
      select: { id: true, genericName: true, isActive: true },
    });
    const byId = new Map(drugs.map((drug) => [drug.id, drug]));

    for (const drugId of unique) {
      const drug = byId.get(drugId);
      if (!drug) {
        throw new BadRequestException({ message: 'Unknown drug', code: 'unknown_drug' });
      }
      if (!drug.isActive) {
        throw new BadRequestException({
          message: `${drug.genericName} is no longer in the formulary.`,
          code: 'inactive_drug',
        });
      }
    }
  }

  private async practitionerIdOf(facilityId: string, userId: string): Promise<string | null> {
    const practitioner = await this.prisma.db.practitioner.findFirst({
      where: { facilityId, userId },
      select: { id: true },
    });
    return practitioner?.id ?? null;
  }

  private toTemplate(row: TemplateRow, mine: string | null): Template {
    const type = row.type as TemplateType;
    const base = {
      id: row.id,
      name: row.name,
      isShared: row.practitionerId === null,
      isMine: mine !== null && row.practitionerId === mine,
      createdAt: row.createdAt.toISOString(),
    };

    // Branched rather than cast, so the compiler proves each type is paired with its own
    // content shape. A discriminated union is only worth having if the one place that
    // constructs it is made to honour it.
    if (type === 'complaint') {
      return { ...base, type, content: complaintTemplateContentSchema.parse(row.content) };
    }
    if (type === 'prescription') {
      return { ...base, type, content: prescriptionTemplateContentSchema.parse(row.content) };
    }

    // The column allows four types and two are built. A row of an unbuilt type reaching
    // here means something wrote a shape this code cannot render, and rendering it as an
    // empty template would be worse than saying so.
    throw new BadRequestException(`Templates of type '${row.type}' are not supported yet.`);
  }
}
