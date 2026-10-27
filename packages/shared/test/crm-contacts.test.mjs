import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCrmPhone, verifyCrmCallerSchema, recordCrmConsentSchema, crmRelationshipFieldsSchema } from '../dist/esm/index.js'

test('CRM normalizes formatting and local digits without guessing a country', () => {
  assert.equal(normalizeCrmPhone('۰۰۹۳ (۷۰۰) ۱۲۳۴۵۶'), '+93700123456')
  assert.equal(normalizeCrmPhone('٠٧٠٠ ١٢٣٤٥٦'), '0700123456')
})
test('Phone matching cannot be submitted as a caller identity check', () => {
  assert.equal(verifyCrmCallerSchema.safeParse({ method: 'phone_match', identityMatched: true, authorityMatched: true, expectedVersion: 0 }).success, false)
})
test('Patient consent requires a relationship and grants require an explicit authority confirmation', () => {
  assert.equal(recordCrmConsentSchema.safeParse({ linkId: null, purpose: 'scheduling', channel: 'call', status: 'granted', source: 'verbal', expectedVersion: 0 }).success, false)
  assert.equal(crmRelationshipFieldsSchema.safeParse({ relationship: 'parent', authority: 'both', source: 'written', authorityConfirmed: false, expectedVersion: 0 }).success, false)
})
