import { createHash, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  crmCallListSchema,
  crmCallDetailSchema,
  crmTimelineSchema,
  type LoginResponse,
} from '@redmars/shared';
import { AppModule } from '../src/app.module';
describe('CRM call center workspace', () => {
  jest.setTimeout(60000);
  const db = new PrismaClient(),
    prefix = 'crm5_' + randomUUID();
  let app: INestApplication<App>, server: App, facilityId: string, otherFacilityId: string;
  const users: Record<string, string> = {},
    tokens: Record<string, string> = {};
  const req = (method: 'get' | 'post' | 'put', path: string, body?: unknown, actor = 'agent') => {
    const r = request(server)
      [method]('/crm/calls' + path)
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
    state: 'answered',
    callerPhone: '+93700987654',
    endedAt: new Date().toISOString(),
    nextAction: 'none',
    actionNote: '',
    relatedCallId: null,
    direction: 'inbound',
    occurredAt: new Date(Date.now() - 60000).toISOString(),
    summary: 'Synthetic coordination summary',
    outcome: 'information_given',
    idempotencyKey: randomUUID(),
    ...extra,
  });
  const parse = (res: { body: unknown }) => crmCallDetailSchema.parse(res.body);
  const create = async (contactId: string | null, extra: object = {}, actor = 'agent') =>
    parse(await req('post', '', input(contactId, extra), actor).expect(201));
  const list = async (query = '', actor = 'agent') =>
    crmCallListSchema.parse((await req('get', query, undefined, actor).expect(200)).body);
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
        mrn: 'CRM5-' + randomUUID(),
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
    const password = 'Synthetic-CRM5-password',
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
    await db.crmCall.updateMany({ where, data: { relatedCallId: null } });
    await db.crmCall.deleteMany({ where });
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
    await db.crmCall.updateMany({ where, data: { relatedCallId: null } });
    await db.crmCall.deleteMany({ where });
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

  it('requires authentication, role, enabled module and strict input', async () => {
    await request(server).get('/crm/calls').expect(401);
    await req('get', '', undefined, 'doctor').expect(403);
    await req('post', '', input(null), 'doctor').expect(403);
    for (const extra of [
      { patientId: randomUUID() },
      { kind: 'call' },
      { facilityId: otherFacilityId },
      { state: 'missed' },
      { direction: 'internal' },
      { endedAt: new Date(Date.now() + 86400000).toISOString() },
    ])
      await req('post', '', input(null, extra)).expect(400);
    await db.facilityModule.update({
      where: { facilityId_module: { facilityId, module: 'crm' } },
      data: { enabled: false },
    });
    try {
      await req('get', '').expect(403);
      await req('post', '', input(null)).expect(403);
    } finally {
      await db.facilityModule.update({
        where: { facilityId_module: { facilityId, module: 'crm' } },
        data: { enabled: true },
      });
    }
  });
  it('logs unknown callers without registering contacts or patients and keeps one timeline record', async () => {
    const d = await create(null);
    expect(d.call.interaction.contactId).toBeNull();
    expect(d.call.interaction.callId).toBe(d.call.id);
    expect(d.call.completedAt).not.toBeNull();
    expect(d.history).toHaveLength(1);
    expect(await db.patient.count({ where: { facilityId } })).toBe(0);
    expect(await db.crmContact.count({ where: { facilityId } })).toBe(0);
    expect((await list()).total).toBe(1);
    await request(server)
      .post('/crm/timeline')
      .set('Authorization', 'Bearer ' + tokens.agent)
      .send({
        ...input(null),
        state: undefined,
        callerPhone: undefined,
        endedAt: undefined,
        nextAction: undefined,
        actionNote: undefined,
        relatedCallId: undefined,
        channel: 'call',
      })
      .expect(400);
  });
  it('records inbound missed and outbound unanswered calls in a filterable pending queue', async () => {
    await create(null, {
      state: 'missed',
      endedAt: null,
      outcome: 'no_response',
      nextAction: 'callback',
      actionNote: 'Return this call',
    });
    await create(null, {
      state: 'no_answer',
      direction: 'outbound',
      endedAt: null,
      outcome: 'no_response',
      nextAction: 'provide_information',
      actionNote: 'Arrange a safe contact time',
    });
    await create(null);
    expect((await list('?pending=pending')).total).toBe(2);
    expect((await list('?state=missed&direction=inbound')).total).toBe(1);
    expect((await list('?pending=completed')).total).toBe(1);
    expect((await list('?q=700987')).total).toBe(3);
    expect((await list('?q=absent')).total).toBe(0);
  });
  it('reuses contact and lead timelines and blocks cross-facility or mismatched subjects', async () => {
    const c = await contact(),
      foreign = await contact(otherFacilityId);
    const lead = await db.crmLead.create({
      data: {
        facilityId,
        title: 'Synthetic call lead',
        source: 'phone',
        sourceDetail: '',
        contactId: c.id,
        serviceInterest: '',
        qualificationNotes: '',
        needsConfirmed: false,
        serviceMatched: false,
      },
    });
    const d = await create(c.id, { leadId: lead.id });
    for (const subject of ['contactId=' + c.id, 'leadId=' + lead.id]) {
      const r = await request(server)
        .get('/crm/timeline?' + subject)
        .set('Authorization', 'Bearer ' + tokens.agent)
        .expect(200);
      expect(crmTimelineSchema.parse(r.body).items[0].callId).toBe(d.call.id);
    }
    await req('post', '', input(foreign.id)).expect(404);
    await req('post', '', input(null, { leadId: lead.id })).expect(400);
    await req('get', '/' + d.call.id, undefined, 'other').expect(404);
    expect((await list('', 'other')).total).toBe(0);
  });
  it('is idempotent and rejects changing a replayed request', async () => {
    const body = input(null),
      first = parse(await req('post', '', body).expect(201)),
      second = parse(await req('post', '', body).expect(201));
    expect(second.call.id).toBe(first.call.id);
    await req('post', '', { ...body, summary: 'Changed content' }).expect(409);
    const concurrent = input(null);
    const rs = await Promise.all([req('post', '', concurrent), req('post', '', concurrent)]);
    expect(rs.some((r) => r.status === 201)).toBe(true);
    expect(rs.every((r) => [201, 409].includes(r.status))).toBe(true);
    await req('post', '', concurrent).expect(201);
    expect(await db.crmCall.count({ where: { facilityId } })).toBe(2);
  });
  it('links callbacks to the same subject and leaves the original action pending', async () => {
    const prior = await create(null, {
      state: 'missed',
      endedAt: null,
      outcome: 'no_response',
      nextAction: 'callback',
      actionNote: 'Return the call',
    });
    const attempt = await create(null, { direction: 'outbound', relatedCallId: prior.call.id });
    expect(attempt.call.relatedCallId).toBe(prior.call.id);
    expect((await list('?pending=pending')).total).toBe(1);
    await req('post', '', input(null, { relatedCallId: prior.call.id })).expect(400);
    await req(
      'post',
      '',
      input(null, {
        direction: 'outbound',
        relatedCallId: prior.call.id,
        callerPhone: '+93700987655',
      }),
    ).expect(400);
    await req(
      'post',
      '',
      input(null, { direction: 'outbound', relatedCallId: prior.call.id }),
      'other',
    ).expect(404);
    const c = await contact();
    await req(
      'post',
      '',
      input(c.id, { direction: 'outbound', relatedCallId: prior.call.id }),
    ).expect(400);
  });
  it('completes an action once under concurrency with actor and completion note', async () => {
    const d = await create(null, {
        nextAction: 'escalate',
        actionNote: 'Contact the staffed team',
      }),
      body = { expectedVersion: 0, completionNote: 'Staffed team accepted handover' };
    const rs = await Promise.all([
      req('post', '/' + d.call.id + '/complete', body),
      req('post', '/' + d.call.id + '/complete', body, 'agent2'),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    const final = parse(await req('get', '/' + d.call.id).expect(200));
    expect(final.call.version).toBe(1);
    expect(final.call.completionNote).toBe(body.completionNote);
    expect(final.call.canComplete).toBe(false);
    expect(final.call.completedByName).toMatch(/^agent/);
    await req('post', '/' + d.call.id + '/complete', body).expect(409);
    expect((await list('?pending=pending')).total).toBe(0);
  });
  it('keeps patient calls hidden until a current caller check and removes access after expiry', async () => {
    const c = await contact(),
      { link } = await relationship(c.id);
    const d = await create(
      c.id,
      {
        linkId: link.id,
        purpose: 'scheduling',
        nextAction: 'callback',
        actionNote: 'Coordinate a suitable time',
      },
      'admin',
    );
    expect((await list()).total).toBe(0);
    await req('get', '/' + d.call.id).expect(404);
    await req('post', '/' + d.call.id + '/complete', {
      expectedVersion: 0,
      completionNote: 'Done safely',
    }).expect(404);
    await req('post', '', input(c.id, { linkId: link.id, purpose: 'scheduling' })).expect(403);
    await verify(c.id, link.id);
    expect((await list()).total).toBe(1);
    await req('get', '/' + d.call.id).expect(200);
    expect((await list('', 'agent2')).total).toBe(0);
    await db.crmVerification.updateMany({
      where: { facilityId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await list()).total).toBe(0);
    await req('get', '/' + d.call.id).expect(404);
    await verify(c.id, link.id);
    await db.crmRelationship.update({ where: { id: link.id }, data: { authority: 'revoked' } });
    expect((await list('', 'admin')).total).toBe(0);
    await req('get', '/' + d.call.id, undefined, 'admin').expect(404);
  });
  it('supports revisions and withdrawal without allowing call-state outcome corruption', async () => {
    const d = await create(null, { nextAction: 'callback', actionNote: 'Return a call' }),
      url = '/crm/timeline/' + d.call.interaction.id;
    const put = (body: unknown) =>
      request(server)
        .put(url)
        .set('Authorization', 'Bearer ' + tokens.agent)
        .send(body);
    await put(correction()).expect(400);
    await put(correction(0, { outcome: 'information_given' })).expect(200);
    expect(parse(await req('get', '/' + d.call.id).expect(200)).history).toHaveLength(2);
    await put(correction(1, { outcome: 'information_given', voided: true })).expect(200);
    expect((await list('?pending=pending')).total).toBe(0);
    await req('post', '/' + d.call.id + '/complete', {
      expectedVersion: 0,
      completionNote: 'Complete',
    }).expect(409);
    await req('post', '', input(null, { direction: 'outbound', relatedCallId: d.call.id })).expect(
      400,
    );
  });
  it('enforces retention on calls, histories and callback references', async () => {
    const d = await create(null);
    await db.crmInteraction.update({
      where: { id: d.call.interaction.id },
      data: { occurredAt: new Date(Date.now() - 86400000), expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await list()).total).toBe(0);
    await req('get', '/' + d.call.id).expect(404);
    await req('post', '', input(null, { direction: 'outbound', relatedCallId: d.call.id })).expect(
      404,
    );
  });
  it('paginates calls after filters and redacts phone and notes from audits', async () => {
    for (let i = 0; i < 27; i++)
      await db.crmInteraction.create({
        data: {
          facilityId,
          kind: 'call',
          purpose: 'enquiry',
          channel: 'call',
          direction: 'inbound',
          occurredAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          recordedBy: users.agent,
          summary: 'Synthetic page',
          outcome: 'no_response',
          call: {
            create: {
              state: 'missed',
              callerPhone: '',
              nextAction: 'callback',
              actionNote: 'Return call',
            },
          },
        },
      });
    expect((await list()).total).toBe(27);
    expect((await list()).items).toHaveLength(25);
    expect((await list('?page=2')).items).toHaveLength(2);
    const d = await create(null, {
      summary: 'PRIVATE-CALL-SUMMARY',
      nextAction: 'callback',
      actionNote: 'PRIVATE-CALL-ACTION',
    });
    await req('post', '/' + d.call.id + '/complete', {
      expectedVersion: 0,
      completionNote: 'PRIVATE-CALL-COMPLETE',
    }).expect(201);
    await req('get', '/' + d.call.id).expect(200);
    const logs = await db.auditLog.findMany({
      where: {
        facilityId,
        entity: { in: ['CrmCall', 'CrmInteraction', 'CrmInteractionRevision'] },
      },
    });
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain('PRIVATE-');
    expect(JSON.stringify(logs)).not.toContain('+93700987654');
    expect(JSON.stringify(logs)).toContain('[redacted]');
  });
});
