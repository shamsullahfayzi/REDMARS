import test from 'node:test'
import assert from 'node:assert/strict'
import { clinicalNoteSchema, saveClinicalNoteRequestSchema } from '../dist/esm/index.js'

const noteType = 'psych_assessment'

test('an untouched OPD screen records no ideation finding', () => {
  assert.equal(saveClinicalNoteRequestSchema.safeParse({ noteType, content: {} }).success, false)
  const oldNote = clinicalNoteSchema.parse({
    id: '11111111-1111-4111-8111-111111111111',
    visitId: '22222222-2222-4222-8222-222222222222',
    noteType, content: { familyHistory: 'Previously documented' },
    practitionerId: null, practitionerName: null, createdAt: '', updatedAt: '',
  })
  assert.equal(oldNote.content.ideation, undefined)
  assert.equal(oldNote.content.familyHistory, 'Previously documented')
})

test('OPD screen accepts only explicit findings and retains extended history on edit', () => {
  for (const ideation of ['denied', 'passive', 'active']) {
    const content = { ideation, pastMedicalHistory: 'Existing history', plan: 'Review at next visit' }
    const result = saveClinicalNoteRequestSchema.parse({ noteType, content })
    assert.equal(result.content.ideation, ideation)
    assert.equal(result.content.pastMedicalHistory, content.pastMedicalHistory)
  }
  assert.equal(saveClinicalNoteRequestSchema.safeParse({ noteType, content: { ideation: 'normal' } }).success, false)
})
