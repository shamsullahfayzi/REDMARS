import { createHash, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  CRM_DEFAULT_SETTINGS,
  crmTimelineSchema,
  crmInteractionDetailSchema,
  type LoginResponse,
} from '@redmars/shared';
import { AppModule } from '../src/app.module';
describe('CRM unified interaction timeline', () => {
  jest.setTimeout(60000);
  const db = new PrismaClient(),
    prefix = 'crm4_' + randomUUID();
  let app: INestApplication<App>, server: App, facilityId: string, otherFacilityId: string;
  const users: Record<string, string> = {},
    tokens: Record<string, string> = {};
  const req = (method: 'get' | 'post' | 'put', path: string, body?: unknown, actor = 'agent') => {
    const r = request(server)
      [method]('/crm/timeline' + path)
      .set('Authorization', 'Bearer ' + tokens[actor]);
    return body === undefined ? r : r.send(body);
  };
  const contact = (fid = facilityId) =>
    db.crmContact.create({
      data: {
        facilityId: fid,
        name: 'Synthetic timeline contact',
        nameKey: 'synthetic timeline contact',
        phone: '+93700123456',
        altPhone: '',
        email: '',
        language: 'en',
        preferredChannel: 'call',
        safeInstructions: '',
      },
    });
  const input = (contactId: string | null, extra: object = {}) => ({
    contactId,
    leadId: null,
    linkId: null,
    purpose: 'enquiry',
    channel: 'call',
    direction: 'inbound',
    occurredAt: new Date().toISOString(),
    summary: 'Synthetic coordination summary',
    outcome: 'information_given',
    idempotencyKey: randomUUID(),
    ...extra,
  });
  const parse = (res: { body: unknown }) => crmInteractionDetailSchema.parse(res.body);
  const create = async (contactId: string, extra: object = {}, actor = 'agent') =>
    parse(await req('post', '', input(contactId, extra), actor).expect(201));
  const list = async (contactId: string, extra = '', actor = 'agent') =>
    crmTimelineSchema.parse(
      (await req('get', '?contactId=' + contactId + extra, undefined, actor).expect(200)).body,
    );
  const correction = (version = 0, extra: object = {}) => ({
    expectedVersion: version,
    summary: 'Corrected service coordination',
    outcome: 'follow_up_needed',
    voided: false,
    reason: 'Clarified the request',
    ...extra,
  });
  async function relationship(contactId: string, authority = 'scheduling') {
    const patient = await db.patient.create({
      data: {
        facilityId,
        mrn: 'CRM4-' + randomUUID(),
        firstName: 'Synthetic',
        lastName: 'Timeline Patient',
        gender: 'male',
      },
    });
    const link = await db.crmRelationship.create({
      data: {
        facilityId,
        contactId,
        patientId: patient.id,
        relationship: 'parent',
        authority,
        source: 'written',
        authorizedBy: users.admin,
        authorizedAt: new Date(),
      },
    });
    return { patient, link };
  }
  async function verify(contactId: string, linkId: string, actor = 'agent') {
    const c = await db.crmContact.findUniqueOrThrow({ where: { id: contactId } });
    await request(server)
      .post('/crm/contacts/' + contactId + '/relationships/' + linkId + '/verify')
      .set('Authorization', 'Bearer ' + tokens[actor])
      .send({
        expectedVersion: c.version,
        method: 'identity_document',
        identityMatched: true,
        authorityMatched: true,
      })
      .expect(201);
  }
  async function clearLimits() {
    await db.rateLimitBucket.deleteMany({
      where: {
        key: {
          in: Object.entries(users).flatMap(([actor, id]) =>
            ['crm.read', 'crm.write'].map((scope) =>
              createHash('sha256')
                .update(
                  JSON.stringify([actor === 'other' ? otherFacilityId : facilityId, id, scope]),
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
      await db.facility.create({ data: { code: prefix, name: 'CRM timeline fixture' } })
    ).id;
    otherFacilityId = (
      await db.facility.create({ data: { code: `${prefix}_other`, name: 'CRM foreign fixture' } })
    ).id;
    for (const fid of [facilityId, otherFacilityId])
      await db.facilityModule.create({ data: { facilityId: fid, module: 'crm', enabled: true } });
    const password = 'Synthetic-CRM4-password',
      passwordHash = await hash(password);
    for (const [actor, role] of [
      ['admin', 'admin'],
      ['agent', 'call_center'],
      ['agent2', 'call_center'],
      ['doctor', 'doctor'],
      ['other', 'admin'],
    ]) {
      const u = await db.appUser.create({
        data: {
          facilityId: actor === 'other' ? otherFacilityId : facilityId,
          username: `${prefix}_${actor}`,
          fullName: actor,
          passwordHash,
        },
      });
      users[actor] = u.id;
      await db.userRole.create({
        data: {
          userId: u.id,
          roleId: (await db.role.findUniqueOrThrow({ where: { code: role } })).id,
        },
      });
      const login = await request(server)
        .post('/auth/login')
        .send({ username: u.username, password })
        .expect(200);
      tokens[actor] = (login.body as LoginResponse).accessToken;
    }
  });
  beforeEach(async () => {
    await clearLimits();
    const where = { facilityId: { in: [facilityId, otherFacilityId] } };
    await db.crmInteractionRevision.deleteMany({ where });
    await db.crmInteraction.deleteMany({ where });
    await db.crmVerification.deleteMany({ where });
    await db.crmRelationship.deleteMany({ where });
    await db.patient.deleteMany({ where });
    await db.setting.deleteMany({ where });
    await db.crmLeadStatusChange.deleteMany({ where });
    await db.crmLead.deleteMany({ where });
    await db.commandReceipt.deleteMany({ where });
    await db.crmContact.deleteMany({ where });
  });
  afterAll(async () => {
    const where = { facilityId: { in: [facilityId, otherFacilityId].filter(Boolean) } };
    await clearLimits();
    await db.crmInteractionRevision.deleteMany({ where });
    await db.crmInteraction.deleteMany({ where });
    await db.crmVerification.deleteMany({ where });
    await db.crmRelationship.deleteMany({ where });
    await db.patient.deleteMany({ where });
    await db.setting.deleteMany({ where });
    await db.crmLeadStatusChange.deleteMany({ where });
    await db.crmLead.deleteMany({ where });
    await db.commandReceipt.deleteMany({ where });
    await db.crmContact.deleteMany({ where });
    await db.auditLog.deleteMany({ where });
    await db.integrationEvent.deleteMany({ where });
    await db.errorLog.deleteMany({ where });
    await db.appUser.deleteMany({ where });
    await db.facilityModule.deleteMany({ where });
    await db.facility.deleteMany({ where: { id: where.facilityId } });
    await app?.close();
    await db.$disconnect();
  });
  it('enforces authentication, CRM roles, enabled module and strict subject input', async () => {
    const c = await contact();
    await request(server)
      .get('/crm/timeline?contactId=' + c.id)
      .expect(401);
    await req('get', '?contactId=' + c.id, undefined, 'doctor').expect(403);
    for (const extra of [
      { patientId: randomUUID() },
      { diagnosis: 'forbidden' },
      { facilityId: otherFacilityId },
      { recordedBy: users.admin },
    ])
      await req('post', '', input(c.id, extra)).expect(400);
    await req('post', '', input(null)).expect(400);
    await req('get', '').expect(400);
    await req('get', '?contactId=' + c.id + '&leadId=' + randomUUID()).expect(400);
    await db.facilityModule.update({
      where: { facilityId_module: { facilityId, module: 'crm' } },
      data: { enabled: false },
    });
    try {
      await req('get', '?contactId=' + c.id).expect(403);
      await req('post', '', input(c.id)).expect(403);
    } finally {
      await db.facilityModule.update({
        where: { facilityId_module: { facilityId, module: 'crm' } },
        data: { enabled: true },
      });
    }
  });
  it('keeps subject references within the facility and consistent with the lead', async () => {
    const c = await contact(),
      foreign = await contact(otherFacilityId),
      other = await contact();
    await req('post', '', input(foreign.id)).expect(404);
    await req('get', '?contactId=' + foreign.id).expect(404);
    const lead = await db.crmLead.create({
      data: {
        facilityId,
        contactId: c.id,
        title: 'Synthetic lead',
        source: 'phone',
        sourceDetail: '',
        serviceInterest: '',
        qualificationNotes: '',
      },
    });
    await req('post', '', input(other.id, { leadId: lead.id })).expect(400);
    const d = await create(c.id, { leadId: lead.id });
    expect((await list(c.id)).total).toBe(1);
    const leadTimeline = crmTimelineSchema.parse(
      (await req('get', '?leadId=' + lead.id).expect(200)).body,
    );
    expect(leadTimeline.items[0].id).toBe(d.interaction.id);
    await req('get', '/' + d.interaction.id, undefined, 'other').expect(404);
    await req('put', '/' + d.interaction.id, correction(), 'other').expect(404);
    await expect(
      db.crmInteraction.create({
        data: {
          facilityId,
          contactId: foreign.id,
          channel: 'call',
          direction: 'inbound',
          purpose: 'enquiry',
          summary: 'Invalid scope',
          outcome: 'other',
          occurredAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          recordedBy: users.agent,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
  it('records once on retry and preserves the source actor without creating clinical records', async () => {
    const c = await contact(),
      body = input(c.id),
      before = await db.patient.count({ where: { facilityId } });
    const responses = await Promise.all([req('post', '', body), req('post', '', body)]);
    expect(responses.some((r) => r.status === 201)).toBe(true);
    expect(responses.every((r) => [201, 409].includes(r.status))).toBe(true);
    const d = parse(await req('post', '', body).expect(201));
    expect(d.revisions).toHaveLength(1);
    expect(d.interaction.recordedBy).toBe(users.agent);
    expect(await db.crmInteraction.count({ where: { facilityId } })).toBe(1);
    expect(await db.patient.count({ where: { facilityId } })).toBe(before);
    await req('post', '', { ...body, summary: 'Different input' }).expect(409);
  });
  it('hides patient-linked entries and counts until that agent completes the current caller check', async () => {
    const c = await contact(),
      { patient, link } = await relationship(c.id);
    const d = await create(
      c.id,
      { linkId: link.id, purpose: 'scheduling', summary: 'PRIVATE-PATIENT-ENTRY' },
      'admin',
    );
    await create(c.id);
    expect((await list(c.id)).total).toBe(1);
    await req('get', '/' + d.interaction.id).expect(404);
    await req('post', '', input(c.id, { linkId: link.id, purpose: 'scheduling' })).expect(403);
    await verify(c.id, link.id);
    const visible = await list(c.id);
    expect(visible.total).toBe(2);
    expect(visible.items.find((i) => i.id === d.interaction.id)?.patient?.mrn).toBe(patient.mrn);
    expect(
      new Date(visible.items.find((i) => i.id === d.interaction.id)!.visibleUntil).getTime(),
    ).toBeLessThan(Date.now() + 16 * 60000);
    const detail = parse(await req('get', '/' + d.interaction.id).expect(200));
    expect(detail.revisions[0].summary).toBe('PRIVATE-PATIENT-ENTRY');
    await req('get', '/' + d.interaction.id, undefined, 'agent2').expect(404);
    expect((await list(c.id, '', 'agent2')).total).toBe(1);
    await db.crmContact.update({ where: { id: c.id }, data: { version: { increment: 1 } } });
    expect((await list(c.id)).total).toBe(1);
    await req('get', '/' + d.interaction.id).expect(404);
  });
  it('enforces purpose scope, revocation, expired checks and archived/deceased subjects', async () => {
    const c = await contact(),
      { patient, link } = await relationship(c.id);
    await verify(c.id, link.id);
    await req('post', '', input(c.id, { linkId: link.id, purpose: 'follow_up' })).expect(403);
    const d = await create(c.id, { linkId: link.id, purpose: 'scheduling' });
    await db.crmVerification.updateMany({
      where: { facilityId, linkId: link.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await req('get', '/' + d.interaction.id).expect(404);
    await verify(c.id, link.id);
    await req('get', '/' + d.interaction.id).expect(200);
    await db.crmRelationship.update({ where: { id: link.id }, data: { authority: 'revoked' } });
    expect((await list(c.id)).total).toBe(0);
    await req('get', '/' + d.interaction.id, undefined, 'admin').expect(404);
    await db.crmRelationship.update({ where: { id: link.id }, data: { authority: 'both' } });
    await db.patient.update({ where: { id: patient.id }, data: { isDeceased: true } });
    await req('get', '/' + d.interaction.id, undefined, 'admin').expect(404);
    await db.patient.update({ where: { id: patient.id }, data: { isDeceased: false } });
    await db.crmContact.update({ where: { id: c.id }, data: { archived: true } });
    await req('get', '/' + d.interaction.id, undefined, 'admin').expect(404);
    await req('post', '', input(c.id)).expect(400);
  });
  it('requires an authorized relationship belonging to the selected contact', async () => {
    const c = await contact(),
      other = await contact(),
      { link } = await relationship(other.id);
    await req('post', '', input(c.id, { linkId: link.id, purpose: 'scheduling' }), 'admin').expect(
      403,
    );
    await req('post', '', input(c.id, { linkId: link.id, purpose: 'enquiry' }), 'admin').expect(
      400,
    );
    await req('post', '', input(c.id, { linkId: null, purpose: 'scheduling' }), 'admin').expect(
      400,
    );
  });
  it('appends corrections, rejects stale edits and restricts correction rights', async () => {
    const c = await contact(),
      d = await create(c.id);
    await req('put', '/' + d.interaction.id, correction(), 'agent2').expect(403);
    await req('put', '/' + d.interaction.id, correction(0, { reason: '' })).expect(400);
    await req('put', '/' + d.interaction.id, correction(0, { contactId: c.id })).expect(400);
    const results = await Promise.all([
      req('put', '/' + d.interaction.id, correction()),
      req('put', '/' + d.interaction.id, correction(0, { summary: 'Concurrent correction' })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    await req('put', '/' + d.interaction.id, correction()).expect(409);
    let current = parse(await req('get', '/' + d.interaction.id).expect(200));
    expect(current.revisions).toHaveLength(2);
    expect(current.revisions[1].summary).toBe('Synthetic coordination summary');
    current = parse(
      await req('put', '/' + d.interaction.id, correction(1, { voided: true }), 'admin').expect(
        200,
      ),
    );
    expect(current.interaction.summary).toBe('');
    expect(current.interaction.voided).toBe(true);
    expect(current.revisions).toHaveLength(3);
    await req('put', '/' + d.interaction.id, correction(2), 'admin').expect(403);
  });
  it('enforces configured retention, rejects future events and preserves policy for legacy settings updates', async () => {
    const c = await contact();
    await request(server)
      .put('/crm/settings')
      .set('Authorization', 'Bearer ' + tokens.admin)
      .send({ ...CRM_DEFAULT_SETTINGS, interactionRetentionDays: 30, expectedVersion: 0 })
      .expect(200);
    const legacy = {
      ...CRM_DEFAULT_SETTINGS,
      expectedVersion: 1,
      interactionRetentionDays: undefined,
    };
    await request(server)
      .put('/crm/settings')
      .set('Authorization', 'Bearer ' + tokens.admin)
      .send(legacy)
      .expect(200);
    const d = await create(c.id);
    expect(
      new Date(d.interaction.expiresAt).getTime() - new Date(d.interaction.occurredAt).getTime(),
    ).toBe(30 * 86400000);
    await req(
      'post',
      '',
      input(c.id, { occurredAt: new Date(Date.now() - 31 * 86400000).toISOString() }),
    ).expect(400);
    await req(
      'post',
      '',
      input(c.id, { occurredAt: new Date(Date.now() + 86400000).toISOString() }),
    ).expect(400);
    await db.crmInteraction.update({
      where: { id: d.interaction.id },
      data: {
        occurredAt: new Date(Date.now() - 31 * 86400000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    expect((await list(c.id)).total).toBe(0);
    await req('get', '/' + d.interaction.id).expect(404);
    await req('put', '/' + d.interaction.id, correction()).expect(404);
  });
  it('paginates and filters before returning the timeline', async () => {
    const c = await contact();
    await db.crmInteraction.createMany({
      data: Array.from({ length: 28 }, (_, i) => ({
        facilityId,
        contactId: c.id,
        channel: i < 26 ? 'call' : 'email',
        direction: i < 26 ? 'inbound' : 'outbound',
        purpose: 'enquiry',
        summary: 'Synthetic entry ' + i,
        outcome: 'other',
        occurredAt: new Date(Date.now() - i * 1000),
        expiresAt: new Date(Date.now() + 86400000),
        recordedBy: users.agent,
      })),
    });
    expect((await list(c.id)).total).toBe(28);
    expect((await list(c.id)).items).toHaveLength(25);
    expect((await list(c.id, '&page=2')).items).toHaveLength(3);
    expect((await list(c.id, '&channel=email&direction=outbound')).total).toBe(2);
    await req('get', '?contactId=' + c.id + '&page=0').expect(400);
  });
  it('redacts interaction text and reasons from mutation and read audits', async () => {
    const c = await contact(),
      d = await create(c.id, { summary: 'PRIVATE-SUMMARY-SENTINEL' });
    await req(
      'put',
      '/' + d.interaction.id,
      correction(0, { summary: 'PRIVATE-EDIT-SENTINEL', reason: 'PRIVATE-REASON-SENTINEL' }),
    ).expect(200);
    await req('get', '/' + d.interaction.id).expect(200);
    const logs = await db.auditLog.findMany({
      where: { facilityId, entity: { in: ['CrmInteraction', 'CrmInteractionRevision'] } },
    });
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain('PRIVATE-');
    expect(JSON.stringify(logs)).toContain('[redacted]');
    expect(logs.some((l) => l.action === 'read' && l.before === null && l.after === null)).toBe(
      true,
    );
  });
});
