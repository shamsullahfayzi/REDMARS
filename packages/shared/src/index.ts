// @redmars/shared — the wire contract between apps/api and apps/web.
//
// Everything here is a zod schema plus its inferred type. The schema is the
// single source: the API types its responses against it at compile time, the
// web client parses against it at runtime. Change a field here and both halves
// fail to build — which is the entire point of this package existing.

export * from './health'
