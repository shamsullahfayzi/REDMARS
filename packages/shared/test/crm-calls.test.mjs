import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  createCrmCallSchema,
  completeCrmCallSchema,
  crmCallQuerySchema,
} from '../dist/esm/index.js'
const call = () => ({
  leadId: null,
  contactId: null,
  linkId: null,
  purpose: 'enquiry',
  direction: 'inbound',
  state: 'answered',
  occurredAt: '2026-10-15T10:00:00Z',
  endedAt: '2026-10-15T10:01:00Z',
  callerPhone: '+93 700 123 456',
  summary: 'A service question',
  outcome: 'information_given',
  nextAction: 'none',
  actionNote: '',
  relatedCallId: null,
  idempotencyKey: randomUUID(),
})
test('calls accept unknown callers and normalize phones without creating an identity', () => {
  assert.equal(createCrmCallSchema.parse(call()).callerPhone, '+93700123456')
  assert.equal(
    createCrmCallSchema.safeParse({ ...call(), callerPhone: '' }).success,
    true,
  )
})
test('calls enforce direction, state, end time, outcome and follow-on actions together', () => {
  for (const extra of [
    { state: 'missed' },
    { state: 'no_answer' },
    { endedAt: null },
    { endedAt: '2026-10-15T09:00:00Z' },
    { outcome: 'no_response' },
    { nextAction: 'callback', actionNote: '' },
    { relatedCallId: randomUUID() },
    { callerPhone: 'abc' },
    { patientId: randomUUID() },
  ])
    assert.equal(
      createCrmCallSchema.safeParse({ ...call(), ...extra }).success,
      false,
      JSON.stringify(extra),
    )
  assert.equal(
    createCrmCallSchema.safeParse({
      ...call(),
      state: 'missed',
      endedAt: null,
      outcome: 'no_response',
      nextAction: 'callback',
      actionNote: 'Return call',
    }).success,
    true,
  )
})
test('patient call purposes require contact and relationship references', () => {
  assert.equal(
    createCrmCallSchema.safeParse({ ...call(), purpose: 'scheduling' }).success,
    false,
  )
  assert.equal(
    createCrmCallSchema.safeParse({ ...call(), linkId: randomUUID() }).success,
    false,
  )
  assert.equal(
    createCrmCallSchema.safeParse({
      ...call(),
      purpose: 'follow_up',
      contactId: randomUUID(),
      linkId: randomUUID(),
    }).success,
    true,
  )
})
test('action completion and queue filters reject incomplete or unexpected data', () => {
  assert.equal(
    completeCrmCallSchema.safeParse({
      expectedVersion: 0,
      completionNote: 'Done',
    }).success,
    true,
  )
  assert.equal(
    completeCrmCallSchema.safeParse({
      expectedVersion: -1,
      completionNote: 'Done',
    }).success,
    false,
  )
  assert.equal(
    completeCrmCallSchema.safeParse({ expectedVersion: 0, completionNote: ' ' })
      .success,
    false,
  )
  assert.equal(crmCallQuerySchema.safeParse({ page: 0 }).success, false)
  assert.equal(
    crmCallQuerySchema.safeParse({ patientId: randomUUID() }).success,
    false,
  )
})
