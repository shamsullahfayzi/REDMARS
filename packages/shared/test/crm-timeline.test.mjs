import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createCrmInteractionSchema, correctCrmInteractionSchema, crmTimelineQuerySchema, crmSettingsSchema, CRM_DEFAULT_SETTINGS } from '../dist/esm/index.js'
const base={leadId:null,contactId:randomUUID(),linkId:null,purpose:'enquiry',channel:'call',direction:'inbound',occurredAt:new Date().toISOString(),summary:'Service coordination',outcome:'information_given',idempotencyKey:randomUUID()}
test('Timeline subjects are explicit and patient references require the contact relationship',()=>{
 assert.equal(createCrmInteractionSchema.safeParse(base).success,true)
 for(const extra of [{contactId:null},{patientId:randomUUID()},{diagnosis:'private'},{purpose:'scheduling'},{linkId:randomUUID()}]) assert.equal(createCrmInteractionSchema.safeParse({...base,...extra}).success,false)
 assert.equal(createCrmInteractionSchema.safeParse({...base,linkId:randomUUID(),purpose:'scheduling'}).success,true)
 assert.equal(crmTimelineQuerySchema.safeParse({}).success,false)
 assert.equal(crmTimelineQuerySchema.safeParse({contactId:base.contactId,leadId:randomUUID()}).success,false)
})
test('Corrections require provenance and cannot replace the subject or channel',()=>{
 const correction={summary:'Corrected request',outcome:'other',expectedVersion:0,voided:false,reason:'Corrected detail'}
 assert.equal(correctCrmInteractionSchema.safeParse(correction).success,true)
 for(const extra of [{reason:''},{expectedVersion:-1},{contactId:randomUUID()},{channel:'email'}]) assert.equal(correctCrmInteractionSchema.safeParse({...correction,...extra}).success,false)
})
test('Timeline visibility retention has bounded configurable defaults',()=>{
 const {interactionRetentionDays,...legacy}=CRM_DEFAULT_SETTINGS
 assert.equal(interactionRetentionDays,365)
 assert.equal(crmSettingsSchema.parse(legacy).interactionRetentionDays,365)
 for(const days of [0,29,3651,30.5])assert.equal(crmSettingsSchema.safeParse({...legacy,interactionRetentionDays:days}).success,false)
})
