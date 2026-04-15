import { z } from 'zod';
import { paginationSchema } from './pagination';

// ─── Feature 020: enums ──────────────────────────────────────────────────────

export const auditRetentionCategorySchema = z.enum([
  'FINANCIAL',
  'OPERATIONAL_CRITICAL',
  'OPERATIONAL_GENERAL',
]);
export type AuditRetentionCategory = z.infer<typeof auditRetentionCategorySchema>;

export const auditRedactionStatusSchema = z.enum(['NONE', 'PARTIAL', 'FULL', 'IN_PROGRESS']);
export type AuditRedactionStatus = z.infer<typeof auditRedactionStatusSchema>;

// Feature 020 FR-009 `ACTIVE_DISPUTE` was removed in Sprint 1 W-5 (2026-04-13).
// The rule was a non-functional stub — advertising a control that did not
// exist is a worse compliance posture than not having the control. When a
// dispute entity is added in a future feature, this enum is the place to
// re-introduce `ACTIVE_DISPUTE` as a real preservation mechanism.
export const preservationRuleTypeSchema = z.enum([
  'CROSS_CHECK',
  'LEGAL_HOLD',
]);
export type PreservationRuleType = z.infer<typeof preservationRuleTypeSchema>;

export const erasureRequestStatusSchema = z.enum([
  'PENDING',
  'SCANNING',
  'PREVIEW',
  'CONFIRMED',
  'EXECUTING',
  'COMPLETED',
  'FAILED',
]);
export type ErasureRequestStatus = z.infer<typeof erasureRequestStatusSchema>;

export const piiClassificationSchema = z.enum([
  'direct',
  'sensitive_financial',
  'unstructured',
]);
export type PiiClassification = z.infer<typeof piiClassificationSchema>;

// ─── Existing: list-audit-logs query (extended for Feature 020) ──────────────

export const listAuditLogsQuerySchema = paginationSchema.extend({
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  action: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  q: z.string().min(1).max(200).optional(),
  // Feature 020: AM/OP opt-in for cold-storage entries (CL_ADMIN → 403)
  includeArchived: z.coerce.boolean().default(false),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;

// ─── Feature 020: retention category upsert ─────────────────────────────────

export const upsertRetentionCategorySchema = z.object({
  retentionYears: z.number().int().min(1).max(100),
  hardDeleteEnabled: z.boolean().default(false),
  description: z.string().max(1000).optional(),
  actionPatterns: z.array(z.string().min(1).max(200)).default([]),
});
export type UpsertRetentionCategoryInput = z.infer<typeof upsertRetentionCategorySchema>;

// ─── Feature 020: preservation rules ────────────────────────────────────────

export const preservationRuleInputSchema = z.object({
  name: z.string().min(1).max(200),
  ruleType: preservationRuleTypeSchema,
  entityType: z.string().max(100).optional(),
  entityId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
});
export type PreservationRuleInput = z.infer<typeof preservationRuleInputSchema>;

export const preservationRuleResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  ruleType: preservationRuleTypeSchema,
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  tenantId: z.string().nullable(),
  isActive: z.boolean(),
  createdByUserId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PreservationRuleResponse = z.infer<typeof preservationRuleResponseSchema>;

// ─── Feature 020: legal holds ───────────────────────────────────────────────

export const legalHoldInputSchema = z.object({
  entityType: z.string().min(1).max(100),
  entityId: z.string().uuid(),
  tenantId: z.string().uuid().optional(),
  reason: z.string().min(1).max(1000),
});
export type LegalHoldInput = z.infer<typeof legalHoldInputSchema>;

export const legalHoldResponseSchema = z.object({
  id: z.string().uuid(),
  entityType: z.string(),
  entityId: z.string().uuid(),
  tenantId: z.string().nullable(),
  reason: z.string(),
  placedByUserId: z.string().uuid(),
  placedAt: z.string().datetime(),
  releasedByUserId: z.string().uuid().nullable(),
  releasedAt: z.string().datetime().nullable(),
  isActive: z.boolean(),
});
export type LegalHoldResponse = z.infer<typeof legalHoldResponseSchema>;

// ─── Feature 020: PII field mappings ────────────────────────────────────────

export const piiFieldMappingInputSchema = z.object({
  actionPattern: z.string().min(1).max(200),
  jsonFieldPath: z.string().min(1).max(500),
  classification: piiClassificationSchema,
  requiresManualReview: z.boolean().default(false),
});
export type PiiFieldMappingInput = z.infer<typeof piiFieldMappingInputSchema>;

export const piiFieldMappingResponseSchema = z.object({
  id: z.string().uuid(),
  actionPattern: z.string(),
  jsonFieldPath: z.string(),
  classification: piiClassificationSchema,
  requiresManualReview: z.boolean(),
});
export type PiiFieldMappingResponse = z.infer<typeof piiFieldMappingResponseSchema>;

// ─── Feature 020: data subject erasure requests ─────────────────────────────

export const dataSubjectErasureRequestInputSchema = z.object({
  subjectIdentifierType: z.enum(['user_id', 'email', 'phone']),
  subjectIdentifierValue: z.string().min(1).max(500),
});
export type DataSubjectErasureRequestInput = z.infer<typeof dataSubjectErasureRequestInputSchema>;

export const dataSubjectErasureRequestResponseSchema = z.object({
  id: z.string().uuid(),
  subjectIdentifierType: z.string(),
  subjectIdentifierValue: z.string(),
  status: erasureRequestStatusSchema,
  entriesFoundCount: z.number().int().nullable(),
  entriesRedactedCount: z.number().int().nullable(),
  entriesFlaggedForReviewCount: z.number().int().nullable(),
  initiatedByUserId: z.string().uuid(),
  initiatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type DataSubjectErasureRequestResponse = z.infer<typeof dataSubjectErasureRequestResponseSchema>;

// ─── Feature 020: retention run history + manual trigger ─────────────────────

export const triggerRetentionRunQuerySchema = z.object({
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});
export type TriggerRetentionRunQuery = z.infer<typeof triggerRetentionRunQuerySchema>;

export const listRetentionRunsQuerySchema = paginationSchema.extend({
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});
export type ListRetentionRunsQuery = z.infer<typeof listRetentionRunsQuerySchema>;
