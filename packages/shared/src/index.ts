// @redmars/shared — the wire contract between apps/api and apps/web.
//
// Everything here is a zod schema plus its inferred type. The schema is the
// single source: the API types its responses against it at compile time, the
// web client parses against it at runtime. Change a field here and both halves
// fail to build — which is the entire point of this package existing.
//
// The .js extensions are deliberate and are not a mistake: ESM requires a real
// file extension, and TypeScript maps './auth.js' back to './auth.ts' when
// compiling. Without them the ESM build emits specifiers Node refuses to
// resolve. Both build halves need this spelling.

export * from './auth.js'
export * from './global.js'
export * from './health.js'
export * from './user.js'
export * from './department.js'
export * from './room.js'
export * from './speciality.js'
export * from './practitioner.js'
export * from './service.js'
export * from './drug.js'
export * from './labTest.js'
export * from './labPanel.js'
export * from './referenceRange.js'
export * from './icd.js'
export * from './drugInteraction.js'
export * from './facilityModule.js'
export * from './patient.js'
export * from './visit.js'
export * from './reception.js'
export * from './appointment.js'
export * from './allergy.js'
export * from './consult.js'
export * from './vitals.js'
export * from './template.js'
export * from './diagnosis.js'
export * from './prescription.js'