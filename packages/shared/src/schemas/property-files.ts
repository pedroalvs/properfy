import { z } from 'zod';
import {
  PropertyFileType,
  PropertyFileStatus,
  PropertyIssueSource,
} from '../enums/property-file';

/**
 * Property files & issues API contracts (F10, TASK-F10-1). Consumed by the
 * backend routes and by TASK-F10-2 (web) / F10-3 (PWA) / F10-4 (portal).
 *
 * Wire helpers are defined locally (not imported from `responses.ts`) because
 * `responses.ts` imports `fileCountsSchema` from here — keeping the dependency
 * one-directional avoids an import cycle.
 */

// Local nullable-instant helper (mirrors platform-settings.ts / responses.ts).
const instantStr = () =>
  z.union([z.string(), z.date().transform((d) => d.toISOString())]);
const instantStrNullable = () =>
  z.union([z.string(), z.date().transform((d) => d.toISOString())]).nullable();

export const PROPERTY_ISSUE_REASON_MAX = 1000;

// ── File DTO ────────────────────────────────────────────────────────────────

export const propertyFileResponseSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  appointmentId: z.string().uuid().nullable(),
  issueId: z.string().uuid().nullable(),
  type: z.nativeEnum(PropertyFileType),
  versionGroupId: z.string().uuid(),
  version: z.number().int(),
  fileName: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int(),
  status: z.nativeEnum(PropertyFileStatus),
  uploadedByUserId: z.string().uuid().nullable(),
  createdAt: instantStr(),
});
export type PropertyFileResponse = z.infer<typeof propertyFileResponseSchema>;

/** Per-type file counts carried on appointment/property detail payloads (C.9). */
export const fileCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  issues: z.number().int().nonnegative(),
  documents: z.number().int().nonnegative(),
  reports: z.number().int().nonnegative(),
  other: z.number().int().nonnegative(),
});
export type FileCounts = z.infer<typeof fileCountsSchema>;

// ── Presign / confirm / version ───────────────────────────────────────────────

export const presignPropertyFileUploadSchema = z.object({
  propertyId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  type: z.nativeEnum(PropertyFileType),
  fileName: z.string().min(1).max(255),
  mime: z.string().min(1),
  sizeBytes: z.number().int().positive().optional(),
});
export type PresignPropertyFileUploadInput = z.infer<typeof presignPropertyFileUploadSchema>;

export const presignPropertyFileUploadResponseSchema = z.object({
  fileId: z.string().uuid(),
  uploadUrl: z.string().url(),
  storageKey: z.string(),
  expiresAt: instantStr(),
});
export type PresignPropertyFileUploadResponse = z.infer<
  typeof presignPropertyFileUploadResponseSchema
>;

export const confirmPropertyFileUploadSchema = z.object({
  fileId: z.string().uuid(),
});
export type ConfirmPropertyFileUploadInput = z.infer<typeof confirmPropertyFileUploadSchema>;

/** New version of an existing file — a presign into the file's version group. */
export const addPropertyFileVersionSchema = z.object({
  fileName: z.string().min(1).max(255),
  mime: z.string().min(1),
  sizeBytes: z.number().int().positive().optional(),
});
export type AddPropertyFileVersionInput = z.infer<typeof addPropertyFileVersionSchema>;

// ── List files / download ─────────────────────────────────────────────────────

export const listPropertyFilesQuerySchema = z
  .object({
    propertyId: z.string().uuid().optional(),
    appointmentId: z.string().uuid().optional(),
    type: z.nativeEnum(PropertyFileType).optional(),
  })
  .refine((q) => q.propertyId != null || q.appointmentId != null, {
    message: 'propertyId or appointmentId is required',
  });
export type ListPropertyFilesQuery = z.infer<typeof listPropertyFilesQuerySchema>;

export const listPropertyFilesResponseSchema = z.object({
  files: z.array(propertyFileResponseSchema),
  counts: fileCountsSchema,
});
export type ListPropertyFilesResponse = z.infer<typeof listPropertyFilesResponseSchema>;

export const propertyFileDownloadResponseSchema = z.object({
  url: z.string().url(),
  expiresAt: instantStr(),
});
export type PropertyFileDownloadResponse = z.infer<typeof propertyFileDownloadResponseSchema>;

// ── Issues ────────────────────────────────────────────────────────────────────

export const propertyIssueResponseSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  appointmentId: z.string().uuid().nullable(),
  reason: z.string(),
  source: z.nativeEnum(PropertyIssueSource),
  createdByUserId: z.string().uuid().nullable(),
  cantDoEventId: z.string().uuid().nullable(),
  seenAt: instantStrNullable(),
  seenByUserId: z.string().uuid().nullable(),
  createdAt: instantStr(),
  photos: z.array(propertyFileResponseSchema),
});
export type PropertyIssueResponse = z.infer<typeof propertyIssueResponseSchema>;

export const createPropertyIssueSchema = z.object({
  propertyId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  reason: z.string().trim().min(1).max(PROPERTY_ISSUE_REASON_MAX),
  photoFileIds: z.array(z.string().uuid()).optional(),
  cantDoEventId: z.string().uuid().optional(),
});
export type CreatePropertyIssueInput = z.infer<typeof createPropertyIssueSchema>;

export const markPropertyIssueSeenResponseSchema = z.object({
  seen: z.boolean(),
  alreadySeen: z.boolean(),
  seenAt: instantStrNullable(),
  seenByUserId: z.string().uuid().nullable(),
});
export type MarkPropertyIssueSeenResponse = z.infer<typeof markPropertyIssueSeenResponseSchema>;

export const listPropertyIssuesQuerySchema = z
  .object({
    propertyId: z.string().uuid().optional(),
    appointmentId: z.string().uuid().optional(),
  })
  .refine((q) => q.propertyId != null || q.appointmentId != null, {
    message: 'propertyId or appointmentId is required',
  });
export type ListPropertyIssuesQuery = z.infer<typeof listPropertyIssuesQuerySchema>;

export const listPropertyIssuesResponseSchema = z.object({
  issues: z.array(propertyIssueResponseSchema),
});
export type ListPropertyIssuesResponse = z.infer<typeof listPropertyIssuesResponseSchema>;

export const propertyIssueUnseenCountResponseSchema = z.object({
  appointmentsWithUnseenIssues: z.number().int().nonnegative(),
  propertiesWithUnseenIssues: z.number().int().nonnegative(),
});
export type PropertyIssueUnseenCountResponse = z.infer<
  typeof propertyIssueUnseenCountResponseSchema
>;
