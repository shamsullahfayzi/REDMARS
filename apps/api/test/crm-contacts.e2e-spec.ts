import { createHash, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  crmContactDetailSchema,
  crmContactListSchema,
  type CrmContactDetail,
  type LoginResponse,
} from '@redmars/shared';
import { AppModule } from '../src/app.module';

describe('CRM contacts and family', () => {
  jest.setTimeout(60000);
  const db = new PrismaClient(),
    prefix = `crm2_${randomUUID()}`;
  let app: INestApplication<App>, server: App, facilityId: string, otherFacilityId: string;
  const tokens: Record<string, string> = {},
    users: Record<string, string> = {};
  const base = {
    name: 'Synthetic Family Contact',
    phone: '+93700123456',
    altPhone: '',
    email: '',
    language: 'prs',
    preferredChannel: 'call',
    safeInstructions: 'Call after 10; no voicemail.',
    doNotContact: false,
    archived: false,
  };
  const req = (method: 'get' | 'post' | 'put', path: string, body?: unknown, actor = 'agent') => {
    const call = request(server)
      [method](`/crm/contacts${path}`)
      .set('Authorization', `Bearer ${tokens[actor]}`);
    return body === undefined ? call : call.send(body);
  };
  const parse = (res: { body: unknown }) => crmContactDetailSchema.parse(res.body);
  const create = async (body: object = {}) =>
    parse(await req('post', '', { ...base, ...body }).expect(201));
  const link = async (
    c: CrmContactDetail,
    mrn = 'CRM2-P1',
    patientName = 'Synthetic Patient One',
  ) =>
    parse(
      await req(
        'post',
        `/${c.contact.id}/relationships`,
        { mrn, patientName, relationship: 'parent', expectedVersion: c.contact.version },
        'admin',
      ).expect(201),
    );
  const authorize = async (c: CrmContactDetail, authority = 'both') =>
    parse(
      await req(
        'put',
        `/${c.contact.id}/relationships/${c.links[0].id}`,
        {
          relationship: 'parent',
          authority,
          source: 'written',
          authorityConfirmed: true,
          expectedVersion: c.contact.version,
        },
        'admin',
      ).expect(200),
    );
  const consent = async (c: CrmContactDetail, status = 'granted', purpose = 'scheduling') =>
    parse(
      await req('post', `/${c.contact.id}/consents`, {
        linkId: purpose === 'enquiry' ? null : c.links[0].id,
        channel: 'call',
        purpose,
        status,
        source: 'verbal',
        expectedVersion: c.contact.version,
      }).expect(201),
    );
  const verify = async (c: CrmContactDetail, passed = true, actor = 'agent') =>
    parse(
      await req(
        'post',
        `/${c.contact.id}/relationships/${c.links[0].id}/verify`,
        {
          method: 'identity_document',
          identityMatched: passed,
          authorityMatched: passed,
          expectedVersion: c.contact.version,
        },
        actor,
      ).expect(201),
    );
  const edit = async (c: CrmContactDetail, data: object) =>
    parse(
      await req('put', `/${c.contact.id}`, {
        ...base,
        ...c.contact,
        id: undefined,
        version: undefined,
        ...data,
        expectedVersion: c.contact.version,
      }).expect(200),
    );
  const allowed = (c: CrmContactDetail, purpose = 'scheduling') =>
    c.eligibility.find((e) => e.channel === 'call' && e.purpose === purpose)!;
  async function clearLimits() {
    await db.rateLimitBucket.deleteMany({
      where: {
        key: {
          in: Object.entries(users).flatMap(([actor, user]) =>
            ['crm.read', 'crm.write'].map((scope) =>
              createHash('sha256')
                .update(
                  JSON.stringify([actor === 'other' ? otherFacilityId : facilityId, user, scope]),
                )
                .digest('hex'),
            ),
          ),
        },
      },
    });
  }
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    await app.init();
    server = app.getHttpServer();
    facilityId = (
      await db.facility.create({ data: { code: prefix, name: 'CRM Module 2 fixture' } })
    ).id;
    otherFacilityId = (
      await db.facility.create({ data: { code: `${prefix}_other`, name: 'CRM second facility' } })
    ).id;
    for (const fid of [facilityId, otherFacilityId])
      await db.facilityModule.create({ data: { facilityId: fid, module: 'crm', enabled: true } });
    const password = 'Synthetic-CRM2-password',
      passwordHash = await hash(password);
    for (const [actor, role] of [
      ['admin', 'admin'],
      ['agent', 'call_center'],
      ['agent2', 'call_center'],
      ['doctor', 'doctor'],
      ['other', 'admin'],
    ]) {
      const user = await db.appUser.create({
        data: {
          facilityId: actor === 'other' ? otherFacilityId : facilityId,
          username: `${prefix}_${actor}`,
          fullName: actor,
          passwordHash,
        },
      });
      users[actor] = user.id;
      const r = await db.role.findUniqueOrThrow({ where: { code: role } });
      await db.userRole.create({ data: { userId: user.id, roleId: r.id } });
      const login = await request(server)
        .post('/auth/login')
        .send({ username: user.username, password })
        .expect(200);
      tokens[actor] = (login.body as LoginResponse).accessToken;
    }
    for (const [mrn, lastName] of [
      ['CRM2-P1', 'Patient One'],
      ['CRM2-P2', 'Patient Two'],
    ])
      await db.patient.create({
        data: {
          facilityId,
          mrn,
          firstName: 'Synthetic',
          lastName,
          gender: 'male',
          phone: base.phone,
        },
      });
    await db.patient.create({
      data: { facilityId: otherFacilityId, mrn: 'OTHER', firstName: 'Foreign', gender: 'male' },
    });
  });
  beforeEach(async () => {
    await clearLimits();
    await db.crmVerification.deleteMany({ where: { facilityId } });
    await db.crmConsent.deleteMany({ where: { facilityId } });
    await db.crmRelationship.deleteMany({ where: { facilityId } });
    await db.crmContact.deleteMany({ where: { facilityId } });
  });
  afterAll(async () => {
    const scope = { facilityId: { in: [facilityId, otherFacilityId].filter(Boolean) } };
    await clearLimits();
    await db.crmVerification.deleteMany({ where: scope });
    await db.crmConsent.deleteMany({ where: scope });
    await db.crmRelationship.deleteMany({ where: scope });
    await db.crmContact.deleteMany({ where: scope });
    await db.patient.deleteMany({ where: scope });
    await db.auditLog.deleteMany({ where: scope });
    await db.integrationEvent.deleteMany({ where: scope });
    await db.errorLog.deleteMany({ where: scope });
    await db.appUser.deleteMany({ where: scope });
    await db.facilityModule.deleteMany({ where: scope });
    await db.facility.deleteMany({ where: { id: scope.facilityId } });
    await app?.close();
    await db.$disconnect();
  });

  it('denies unauthenticated, unauthorized, disabled and cross-facility access', async () => {
    await request(server).get('/crm/contacts').expect(401);
    await req('post', '', base, 'doctor').expect(403);
    const c = await create();
    await req('get', `/${c.contact.id}`, undefined, 'other').expect(404);
    await req('put', `/${c.contact.id}`, { ...base, expectedVersion: 0 }, 'other').expect(404);
    await req('post', '', { ...base, facilityId }).expect(400);
    await req('post', `/${c.contact.id}/relationships`, {
      mrn: 'CRM2-P1',
      patientName: 'Synthetic Patient One',
      relationship: 'parent',
      expectedVersion: 0,
    }).expect(403);
    await db.facilityModule.update({
      where: { facilityId_module: { facilityId, module: 'crm' } },
      data: { enabled: false },
    });
    await req('get', '').expect(403);
    await req('post', '', base).expect(403);
    await db.facilityModule.update({
      where: { facilityId_module: { facilityId, module: 'crm' } },
      data: { enabled: true },
    });
  });

  it('normalizes local digits, warns on duplicates and allows distinct people sharing a phone', async () => {
    const c = await create({ phone: '+۹۳ ۷۰۰ ۱۲۳۴۵۶' });
    expect(c.contact.phone).toBe(base.phone);
    const warning = await req('post', '', { ...base, name: 'Another Family Member' }).expect(409);
    expect((warning.body as { code: string }).code).toBe('crm_duplicates');
    await create({ name: 'Another Family Member', duplicateReviewed: true });
    const list = crmContactListSchema.parse((await req('get', '?q=۷۰۰۱۲۳۴۵۶').expect(200)).body);
    expect(list.total).toBe(2);
    expect(await db.patient.count({ where: { facilityId } })).toBe(2);
    await req('post', '', { ...base, phone: '123' }).expect(400);
  });

  it('links multiple existing patients by exact MRN and name without granting authority', async () => {
    let c = await create();
    await req(
      'post',
      `/${c.contact.id}/relationships`,
      { mrn: 'OTHER', patientName: 'Foreign', relationship: 'parent', expectedVersion: 0 },
      'admin',
    ).expect(400);
    await req(
      'post',
      `/${c.contact.id}/relationships`,
      { mrn: 'CRM2-P1', patientName: 'Wrong Name', relationship: 'parent', expectedVersion: 0 },
      'admin',
    ).expect(400);
    c = await link(c);
    c = await link(c, 'CRM2-P2', 'Synthetic Patient Two');
    expect(c.links).toHaveLength(2);
    expect(c.links.every((l) => l.authority === 'pending')).toBe(true);
    const agent = parse(await req('get', `/${c.contact.id}`).expect(200));
    expect(agent.links.every((l) => l.patient === null)).toBe(true);
    await req('post', `/${c.contact.id}/relationships/${c.links[0].id}/verify`, {
      method: 'phone_match',
      identityMatched: true,
      authorityMatched: true,
      expectedVersion: c.contact.version,
    }).expect(400);
    const foreignPatient = await db.patient.findFirstOrThrow({
      where: { facilityId: otherFacilityId },
    });
    await expect(
      db.crmRelationship.create({
        data: {
          facilityId,
          contactId: c.contact.id,
          patientId: foreignPatient.id,
          relationship: 'parent',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('requires separate authority, scoped consent and a current caller check', async () => {
    let c = await link(await create());
    c = await consent(c);
    expect(allowed(c).reason).toBe('no_authority');
    await req(
      'put',
      `/${c.contact.id}/relationships/${c.links[0].id}`,
      {
        relationship: 'parent',
        authority: 'both',
        source: 'written',
        authorityConfirmed: false,
        expectedVersion: c.contact.version,
      },
      'admin',
    ).expect(400);
    c = await authorize(c, 'scheduling');
    expect(allowed(c).reason).toBe('verify_caller');
    c = await verify(c);
    expect(allowed(c).allowed).toBe(true);
    expect(c.links[0].patient).toEqual({ name: 'Synthetic Patient One', mrn: 'CRM2-P1' });
    expect(allowed(c, 'follow_up').reason).toBe('no_authority');
    expect(JSON.stringify(c)).not.toMatch(
      /diagnosis|prescription|clinicalNote|nationalId|dateOfBirth/,
    );
    const other = parse(await req('get', `/${c.contact.id}`, undefined, 'agent2').expect(200));
    expect(other.links[0].patient).toBeNull();
    expect(allowed(other).reason).toBe('verify_caller');
    await request(server)
      .get('/patients')
      .set('Authorization', `Bearer ${tokens.agent}`)
      .expect(403);
  });

  it('expires checks and invalidates a previous success after a failed check', async () => {
    let c = await authorize(await link(await create()));
    c = await consent(c);
    c = await verify(c);
    await db.crmVerification.updateMany({
      where: { contactId: c.contact.id },
      data: { expiresAt: new Date(0) },
    });
    c = parse(await req('get', `/${c.contact.id}`).expect(200));
    expect(c.links[0].patient).toBeNull();
    c = await verify(c);
    c = await verify(c, false);
    expect(c.links[0].patient).toBeNull();
    expect(allowed(c).allowed).toBe(false);
  });

  it('retains consent history on withdrawal and blocks changed destinations and opt-out', async () => {
    let c = await create();
    c = await consent(c, 'granted', 'enquiry');
    expect(allowed(c, 'enquiry').allowed).toBe(true);
    c = await consent(c, 'withdrawn', 'enquiry');
    expect(allowed(c, 'enquiry').reason).toBe('no_consent');
    expect(c.consents).toHaveLength(2);
    c = await consent(c, 'granted', 'enquiry');
    c = await edit(c, { phone: '+93700987654' });
    expect(allowed(c, 'enquiry').reason).toBe('no_consent');
    c = await consent(c, 'granted', 'enquiry');
    c = await edit(c, { doNotContact: true });
    expect(allowed(c, 'enquiry').reason).toBe('do_not_contact');
    await req('post', `/${c.contact.id}/consents`, {
      linkId: null,
      purpose: 'enquiry',
      channel: 'call',
      status: 'granted',
      source: 'verbal',
      expectedVersion: c.contact.version,
    }).expect(400);
    c = await consent(c, 'withdrawn', 'enquiry');
    expect(c.consents).toHaveLength(5);
  });

  it('rejects mismatched consent scope and foreign relationship IDs', async () => {
    const a = await link(await create());
    const b = await create({ name: 'Different Name', phone: '+93700765432' });
    await req('post', `/${b.contact.id}/consents`, {
      linkId: a.links[0].id,
      purpose: 'scheduling',
      channel: 'call',
      status: 'granted',
      source: 'verbal',
      expectedVersion: 0,
    }).expect(404);
    await req('post', `/${b.contact.id}/consents`, {
      linkId: null,
      purpose: 'scheduling',
      channel: 'call',
      status: 'granted',
      source: 'verbal',
      expectedVersion: 0,
    }).expect(400);
    await req('post', `/${b.contact.id}/relationships/${a.links[0].id}/verify`, {
      method: 'approved_questions',
      identityMatched: true,
      authorityMatched: true,
      expectedVersion: 0,
    }).expect(404);
    expect(await db.crmConsent.count({ where: { contactId: b.contact.id } })).toBe(0);
  });

  it('protects stale and concurrent edits and archives without deleting history', async () => {
    let c = await create();
    const results = await Promise.all(
      ['First', 'Second'].map((suffix) =>
        req('put', `/${c.contact.id}`, {
          ...base,
          name: `${base.name} ${suffix}`,
          expectedVersion: 0,
        }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    c = parse(await req('get', `/${c.contact.id}`).expect(200));
    c = await consent(c, 'granted', 'enquiry');
    c = await edit(c, { archived: true });
    expect(allowed(c, 'enquiry').reason).toBe('archived');
    expect(c.consents).toHaveLength(1);
    expect(crmContactListSchema.parse((await req('get', '').expect(200)).body).total).toBe(0);
    expect(
      crmContactListSchema.parse((await req('get', '?archived=true').expect(200)).body).total,
    ).toBe(1);
    c = await edit(c, { archived: false });
    expect(c.contact.archived).toBe(false);
  });

  it('redacts contact values from audits while retaining consent provenance and read metadata', async () => {
    let c = await create();
    c = await consent(c, 'granted', 'enquiry');
    await req('get', `/${c.contact.id}`).expect(200);
    const audits = await db.auditLog.findMany({
      where: { facilityId, OR: [{ entityId: c.contact.id }, { entityId: c.consents[0].id }] },
    });
    expect(audits.some((a) => a.action === 'read' && a.before === null && a.after === null)).toBe(
      true,
    );
    const text = JSON.stringify(audits);
    expect(text).not.toContain(base.name);
    expect(text).not.toContain(base.phone);
    expect(text).not.toContain(base.safeInstructions);
    expect(text).toContain('[redacted]');
    expect(text).toContain('granted');
    expect(c.consents[0].recordedBy).toBe(users.agent);
  });
});
