import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  createCrmTaskSchema,
  updateCrmTaskSchema,
  crmTaskQuerySchema,
} from '../dist/esm/index.js'
const fields = {
  title: 'Return service enquiry',
  notes: 'Administrative only',
  ownerId: randomUUID(),
  dueAt: '2026-10-16T14:30:00+04:30',
  reminderAt: '2026-10-16T09:30:00Z',
  priority: 'normal',
}
test('task scheduling compares absolute instants across timezone offsets', () => {
  const base = {
    ...fields,
    interactionId: randomUUID(),
    prescriptionId: null,
    idempotencyKey: randomUUID(),
  }
  assert.equal(createCrmTaskSchema.safeParse(base).success, true)
  assert.equal(
    createCrmTaskSchema.safeParse({
      ...base,
      reminderAt: '2026-10-16T10:01:00Z',
    }).success,
    false,
  )
  assert.equal(
    createCrmTaskSchema.safeParse({ ...base, reminderAt: null }).success,
    true,
  )
})
test('task closure requires outcomes and open tasks cannot retain stale closure outcomes', () => {
  const base = {
    ...fields,
    expectedVersion: 0,
    status: 'open',
    outcome: '',
    reason: 'Operational update',
  }
  assert.equal(updateCrmTaskSchema.safeParse(base).success, true)
  for (const extra of [
    { status: 'completed' },
    { status: 'cancelled' },
    { outcome: 'Old resolution' },
    { reason: '' },
    { expectedVersion: -1 },
  ])
    assert.equal(
      updateCrmTaskSchema.safeParse({ ...base, ...extra }).success,
      false,
    )
  assert.equal(
    updateCrmTaskSchema.safeParse({
      ...base,
      status: 'completed',
      outcome: 'Enquiry resolved',
    }).success,
    true,
  )
})
test('task filters reject unrestricted injected fields and invalid pagination', () => {
  assert.deepEqual(crmTaskQuerySchema.parse({}), {
    page: 1,
    q: '',
    owner: 'mine',
    status: 'active',
    queue: 'all',
    priority: 'all',
  })
  for (const x of [
    { page: 0 },
    { patientId: randomUUID() },
    { owner: randomUUID() },
    { queue: 'unknown' },
  ])
    assert.equal(crmTaskQuerySchema.safeParse(x).success, false)
})
