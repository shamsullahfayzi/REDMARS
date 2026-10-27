import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createCrmLeadSchema, updateCrmLeadSchema, crmLeadQuerySchema, CRM_LEAD_TRANSITIONS } from '../dist/esm/index.js'

const fields = { title:'Service inquiry', contactId:null, ownerId:null, serviceInterest:'', needsConfirmed:false, serviceMatched:false, qualificationNotes:'' }
test('An inquiry can exist without a patient or contact but requires a retry key', () => {
  const input = {...fields, source:'phone',sourceDetail:'',idempotencyKey:randomUUID()}
  assert.equal(createCrmLeadSchema.safeParse(input).success,true)
  assert.equal(createCrmLeadSchema.safeParse({...input,idempotencyKey:undefined}).success,false)
  assert.equal(createCrmLeadSchema.safeParse({...input,patientId:randomUUID()}).success,false)
})
test('Qualified and closed leads require their respective evidence', () => {
  const input = {...fields,status:'qualified',closedReason:null,expectedVersion:0,changeReason:''}
  assert.equal(updateCrmLeadSchema.safeParse(input).success,false)
  assert.equal(updateCrmLeadSchema.safeParse({...input,contactId:randomUUID(),ownerId:randomUUID(),serviceInterest:'Rehabilitation',needsConfirmed:true,serviceMatched:true}).success,true)
  assert.equal(updateCrmLeadSchema.safeParse({...input,status:'closed',closedReason:'resolved'}).success,true)
  assert.equal(updateCrmLeadSchema.safeParse({...input,status:'new',closedReason:'resolved'}).success,false)
  assert.equal(CRM_LEAD_TRANSITIONS.new.includes('qualified'),false)
  assert.deepEqual(CRM_LEAD_TRANSITIONS.closed,['new'])
})
test('Lead searches are bounded and cannot carry a forged facility', () => {
  assert.equal(crmLeadQuerySchema.parse({}).page,1)
  for(const input of [{page:0},{page:10001},{q:'x'.repeat(161)},{facilityId:randomUUID()},{owner:'invalid'}]) assert.equal(crmLeadQuerySchema.safeParse(input).success,false)
})
