import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type CrmContact } from '@prisma/client';
import {
  normalizeCrmPhone,
  type CreateCrmContact,
  type UpdateCrmContact,
  type CreateCrmRelationship,
  type UpdateCrmRelationship,
  type RecordCrmConsent,
  type VerifyCrmCaller,
  type CrmContactDetail,
} from '@redmars/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../auth/auth-context';

const nameKey = (v: string) =>
  v
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();
const publicContact = (c: CrmContact) => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
  altPhone: c.altPhone,
  email: c.email,
  language: c.language,
  preferredChannel: c.preferredChannel,
  safeInstructions: c.safeInstructions,
  doNotContact: c.doNotContact,
  archived: c.archived,
  version: c.version,
});
const activeAuthority = (value: string) => !['pending', 'revoked'].includes(value);
const destination = (c: CrmContact, channel: string) => (channel === 'email' ? c.email : c.phone);

@Injectable()
export class CrmContactsService {
  constructor(private readonly prisma: PrismaService) {}

  private async contact(
    tx: Prisma.TransactionClient,
    auth: AuthContext,
    id: string,
    version?: number,
  ) {
    const row = await tx.crmContact.findFirst({ where: { id, facilityId: auth.facilityId } });
    if (!row) throw new NotFoundException();
    if (version !== undefined && version !== row.version)
      throw new ConflictException({
        code: 'crm_contact_conflict',
        message: 'This contact changed. Reload before saving.',
      });
    return row;
  }

  private async bump(tx: Prisma.TransactionClient, row: CrmContact) {
    await tx.crmContact.update({ where: { id: row.id }, data: { version: { increment: 1 } } });
  }

  async list(auth: AuthContext, input: { q: string; page: number; archived: string }) {
    const q = nameKey(input.q),
      phone = normalizeCrmPhone(input.q);
    const where: Prisma.CrmContactWhereInput = {
      facilityId: auth.facilityId,
      archived: input.archived === 'true',
      ...(q
        ? {
            OR: [
              { nameKey: { contains: q } },
              { email: { contains: q, mode: 'insensitive' } },
              ...(phone.length >= 3
                ? [{ phone: { contains: phone } }, { altPhone: { contains: phone } }]
                : []),
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.db.crmContact.findMany({
        where,
        take: 25,
        skip: (input.page - 1) * 25,
        orderBy: [{ nameKey: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.db.crmContact.count({ where }),
    ]);
    return { items: items.map(publicContact), total, page: input.page };
  }

  private async duplicates(
    tx: Prisma.TransactionClient,
    facilityId: string,
    data: CreateCrmContact,
    id?: string,
  ) {
    const phones = [data.phone, data.altPhone].filter(Boolean);
    const matches = await tx.crmContact.findMany({
      where: {
        facilityId,
        ...(id ? { id: { not: id } } : {}),
        OR: [
          { nameKey: nameKey(data.name) },
          ...(phones.length ? [{ phone: { in: phones } }, { altPhone: { in: phones } }] : []),
          ...(data.email ? [{ email: { equals: data.email, mode: 'insensitive' as const } }] : []),
        ],
      },
      take: 10,
      select: { id: true, name: true, archived: true },
    });
    if (matches.length && !data.duplicateReviewed)
      throw new ConflictException({
        code: 'crm_duplicates',
        message: 'Similar contacts exist. Review them before saving a separate person.',
        candidates: matches,
      });
  }

  async create(auth: AuthContext, input: CreateCrmContact) {
    const row = await this.prisma.db.$transaction(async (tx) => {
      await this.duplicates(tx, auth.facilityId, input);
      const { duplicateReviewed: _reviewed, ...data } = input;
      void _reviewed;
      return tx.crmContact.create({
        data: {
          ...data,
          email: data.email.toLowerCase(),
          nameKey: nameKey(data.name),
          facilityId: auth.facilityId,
        },
      });
    });
    return this.detail(auth, row.id);
  }

  async update(auth: AuthContext, id: string, input: UpdateCrmContact) {
    await this.prisma.db.$transaction(async (tx) => {
      const row = await this.contact(tx, auth, id, input.expectedVersion);
      await this.duplicates(tx, auth.facilityId, input, id);
      const { duplicateReviewed: _reviewed, expectedVersion: _version, ...data } = input;
      void _reviewed;
      void _version;
      await tx.crmContact.update({
        where: { id: row.id },
        data: {
          ...data,
          email: data.email.toLowerCase(),
          nameKey: nameKey(data.name),
          version: { increment: 1 },
        },
      });
    });
    return this.detail(auth, id);
  }

  async link(auth: AuthContext, id: string, input: CreateCrmRelationship) {
    await this.prisma.db.$transaction(async (tx) => {
      const c = await this.contact(tx, auth, id, input.expectedVersion);
      if (c.archived) throw new BadRequestException('Restore the contact first');
      const patient = await tx.patient.findFirst({
        where: { facilityId: auth.facilityId, mrn: input.mrn, deletedAt: null, isDeceased: false },
        select: { id: true, firstName: true, lastName: true },
      });
      if (
        !patient ||
        nameKey([patient.firstName, patient.lastName].filter(Boolean).join(' ')) !==
          nameKey(input.patientName)
      )
        throw new BadRequestException({
          code: 'crm_patient_not_matched',
          message: 'MRN and full name must match an active patient at this facility.',
        });
      if (
        await tx.crmRelationship.findUnique({
          where: { contactId_patientId: { contactId: id, patientId: patient.id } },
        })
      )
        throw new ConflictException({
          code: 'crm_link_exists',
          message: 'This patient is already linked. Update the existing relationship.',
        });
      await tx.crmRelationship.create({
        data: {
          contactId: id,
          facilityId: auth.facilityId,
          patientId: patient.id,
          relationship: input.relationship,
        },
      });
      await this.bump(tx, c);
    });
    return this.detail(auth, id);
  }

  async authority(auth: AuthContext, id: string, linkId: string, input: UpdateCrmRelationship) {
    await this.prisma.db.$transaction(async (tx) => {
      const c = await this.contact(tx, auth, id, input.expectedVersion);
      const link = await tx.crmRelationship.findFirst({
        where: { id: linkId, contactId: id, facilityId: auth.facilityId },
      });
      if (!link) throw new NotFoundException();
      await tx.crmRelationship.update({
        where: { id: link.id },
        data: {
          relationship: input.relationship,
          authority: input.authority,
          source: input.source,
          authorizedBy: auth.userId,
          authorizedAt: new Date(),
        },
      });
      await this.bump(tx, c);
    });
    return this.detail(auth, id);
  }

  async consent(auth: AuthContext, id: string, input: RecordCrmConsent) {
    await this.prisma.db.$transaction(async (tx) => {
      const c = await this.contact(tx, auth, id, input.expectedVersion);
      if (
        input.linkId &&
        !(await tx.crmRelationship.findFirst({
          where: { id: input.linkId, contactId: id, facilityId: auth.facilityId },
        }))
      )
        throw new NotFoundException();
      const target = destination(c, input.channel);
      if (input.status === 'granted' && (c.archived || c.doNotContact || !target))
        throw new BadRequestException({
          code: 'crm_consent_blocked',
          message:
            'Restore the contact, clear do-not-contact and provide a destination before recording a grant.',
        });
      const { expectedVersion: _version, ...data } = input;
      void _version;
      await tx.crmConsent.create({
        data: {
          ...data,
          facilityId: auth.facilityId,
          contactId: id,
          destination: target,
          recordedBy: auth.userId,
          sequence: c.version + 1,
        },
      });
      await this.bump(tx, c);
    });
    return this.detail(auth, id);
  }

  async verify(auth: AuthContext, id: string, linkId: string, input: VerifyCrmCaller) {
    await this.prisma.db.$transaction(async (tx) => {
      const c = await this.contact(tx, auth, id, input.expectedVersion);
      const link = await tx.crmRelationship.findFirst({
        where: { id: linkId, contactId: id, facilityId: auth.facilityId },
        include: { patient: { select: { deletedAt: true, isDeceased: true } } },
      });
      if (!link) throw new NotFoundException();
      if (
        c.archived ||
        !activeAuthority(link.authority) ||
        link.patient.deletedAt ||
        link.patient.isDeceased
      )
        throw new BadRequestException({
          code: 'crm_not_authorized',
          message: 'An active, authorized patient relationship is required.',
        });
      // Incrementing the contact serializes checks and invalidates all older
      // receipts, including a previously successful check followed by failure.
      await this.bump(tx, c);
      await tx.crmVerification.create({
        data: {
          facilityId: auth.facilityId,
          contactId: id,
          linkId,
          method: input.method,
          passed: input.identityMatched && input.authorityMatched,
          verifiedBy: auth.userId,
          contactVersion: c.version + 1,
          expiresAt: new Date(Date.now() + 15 * 60_000),
        },
      });
    });
    return this.detail(auth, id);
  }

  async detail(auth: AuthContext, id: string) {
    // A consistent snapshot prevents returning a stale grant with fresh consent.
    return this.prisma.db.$transaction(async (tx) => {
      const c = await this.contact(tx, auth, id);
      const links = await tx.crmRelationship.findMany({
        where: { contactId: id, facilityId: auth.facilityId },
        orderBy: { createdAt: 'asc' },
        include: {
          patient: {
            select: {
              firstName: true,
              lastName: true,
              mrn: true,
              deletedAt: true,
              isDeceased: true,
            },
          },
          verifications: {
            where: {
              verifiedBy: auth.userId,
              contactVersion: c.version,
              passed: true,
              expiresAt: { gt: new Date() },
            },
            take: 1,
          },
        },
      });
      const consents = await tx.crmConsent.findMany({
        where: { contactId: id, facilityId: auth.facilityId },
        orderBy: { sequence: 'desc' },
      });
      const canAuthorize = auth.permissions.has('crm.contacts.authorize');
      const eligibility: CrmContactDetail['eligibility'] = [];
      for (const link of [null, ...links]) {
        for (const purpose of link
          ? (['scheduling', 'follow_up'] as const)
          : (['enquiry'] as const)) {
          for (const channel of ['call', 'sms', 'whatsapp', 'email'] as const) {
            const consent = consents.find(
              (e) =>
                e.linkId === (link?.id ?? null) && e.channel === channel && e.purpose === purpose,
            );
            const reason = c.archived
              ? 'archived'
              : c.doNotContact
                ? 'do_not_contact'
                : !destination(c, channel)
                  ? 'no_destination'
                  : link && (link.patient.deletedAt || link.patient.isDeceased)
                    ? 'patient_unavailable'
                    : link && link.authority !== 'both' && link.authority !== purpose
                      ? 'no_authority'
                      : !consent ||
                          consent.status !== 'granted' ||
                          consent.destination !== destination(c, channel)
                        ? 'no_consent'
                        : link && !link.verifications.length
                          ? 'verify_caller'
                          : 'allowed';
            eligibility.push({
              linkId: link?.id ?? null,
              channel,
              purpose,
              allowed: reason === 'allowed',
              reason,
            });
          }
        }
      }
      return {
        contact: publicContact(c),
        canAuthorize,
        links: links.map((l) => {
          const available = !l.patient.deletedAt && !l.patient.isDeceased;
          return {
            id: l.id,
            relationship: l.relationship,
            authority: l.authority,
            source: l.source,
            patientAvailable: available,
            patient:
              !c.archived &&
              available &&
              (canAuthorize || (activeAuthority(l.authority) && l.verifications.length > 0))
                ? {
                    name: [l.patient.firstName, l.patient.lastName].filter(Boolean).join(' '),
                    mrn: l.patient.mrn,
                  }
                : null,
            verifiedUntil: l.verifications[0]?.expiresAt.toISOString() ?? null,
          };
        }),
        consents: consents.map(
          ({ id: consentId, linkId, channel, purpose, status, source, recordedBy, createdAt }) => ({
            id: consentId,
            linkId,
            channel,
            purpose,
            status,
            source,
            recordedBy,
            createdAt: createdAt.toISOString(),
          }),
        ),
        eligibility,
      };
    });
  }
}
