import { z } from "zod";
import { createPatientRequestSchema } from "./patient.js";
const command = z.object({
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().uuid(),
  identityConfirmed: z.literal(true),
  duplicateReviewed: z.literal(true),
});
export const linkCrmPatientSchema = command
  .extend({ linkId: z.string().uuid() })
  .strict();
export const registerCrmPatientSchema = command
  .extend({
    patient: createPatientRequestSchema,
    relationship: z.enum([
      "self",
      "parent",
      "spouse",
      "sibling",
      "child",
      "guardian",
      "other",
    ]),
  })
  .strict();
export const unlinkCrmPatientSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    idempotencyKey: z.string().uuid(),
    reason: z.enum([
      "wrong_patient",
      "wrong_lead",
      "duplicate_inquiry",
      "authorization_withdrawn",
    ]),
  })
  .strict();
const patient = z.object({
  id: z.string().uuid(),
  name: z.string(),
  mrn: z.string(),
});
export const crmPatientMappingSchema = z.object({
  expectedVersion: z.number(),
  canLink: z.boolean(),
  canRegister: z.boolean(),
  canUnlink: z.boolean(),
  current: z
    .object({
      id: z.string(),
      patient: patient.nullable(),
      restricted: z.boolean(),
      visibleUntil: z.string().nullable(),
    })
    .nullable(),
  candidates: z.array(
    z.object({
      linkId: z.string(),
      patient,
      visibleUntil: z.string().nullable(),
    }),
  ),
  history: z.array(
    z.object({
      id: z.string(),
      action: z.enum(["linked", "registered"]),
      createdAt: z.string(),
      revokedAt: z.string().nullable(),
      reason: z.string().nullable(),
      patient: patient.nullable(),
      visibleUntil: z.string().nullable(),
    }),
  ),
});
export type CrmPatientMapping = z.infer<typeof crmPatientMappingSchema>;
