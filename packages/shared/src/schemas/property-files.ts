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

// ── Portal (F10-4) — rental tenant issue reporting ──────────────────────────
//
// The rental tenant acts only through a magic-link token that pins exactly one
// appointment (and through it one property and one agency). Scope
// (propertyId/appointmentId/tenantId) and the issue `source` are therefore
// derived from the token on the server — never sent by the client — so these
// request schemas carry no propertyId/appointmentId/type/source/cantDoEventId;
// Zod strips any such field a client includes.

export const portalPresignIssuePhotoSchema = z.object({
  fileName: z.string().min(1).max(255),
  mime: z.string().min(1),
  sizeBytes: z.number().int().positive().optional(),
});
export type PortalPresignIssuePhotoInput = z.infer<typeof portalPresignIssuePhotoSchema>;

/**
 * Portal presign response. Deliberately omits `storageKey` (unlike the
 * authenticated presign response) — the key embeds the agency's `tenantId`,
 * which the anonymous tenant must not see and does not need (it uploads to
 * `uploadUrl` and later references the photo by `fileId`).
 */
export const portalPresignIssuePhotoResponseSchema = z.object({
  fileId: z.string().uuid(),
  uploadUrl: z.string().url(),
  expiresAt: instantStr(),
});
export type PortalPresignIssuePhotoResponse = z.infer<
  typeof portalPresignIssuePhotoResponseSchema
>;

export const portalConfirmIssuePhotoSchema = z.object({
  fileId: z.string().uuid(),
});
export type PortalConfirmIssuePhotoInput = z.infer<typeof portalConfirmIssuePhotoSchema>;

/**
 * Privacy-reduced photo DTO (metadata + status only — no uploader identity,
 * storage key, issue id, or version). Shared by the confirm response (status
 * `PENDING`) and the issue `photos[]` (status `READY`).
 */
export const portalIssuePhotoResponseSchema = z.object({
  id: z.string().uuid(),
  fileName: z.string(),
  mime: z.string(),
  status: z.nativeEnum(PropertyFileStatus),
  createdAt: instantStr(),
});
export type PortalIssuePhotoResponse = z.infer<typeof portalIssuePhotoResponseSchema>;

export const portalCreatePropertyIssueSchema = z.object({
  reason: z.string().trim().min(1).max(PROPERTY_ISSUE_REASON_MAX),
  photoFileIds: z.array(z.string().uuid()).optional(),
});
export type PortalCreatePropertyIssueInput = z.infer<typeof portalCreatePropertyIssueSchema>;

/**
 * Privacy-reduced issue DTO. Never exposes the reviewer identity, seen status,
 * `source`, `createdByUserId`, `cantDoEventId`, or the appointment/property ids
 * — a tenant sees only what they submitted.
 */
export const portalPropertyIssueResponseSchema = z.object({
  id: z.string().uuid(),
  reason: z.string(),
  createdAt: instantStr(),
  photos: z.array(portalIssuePhotoResponseSchema),
});
export type PortalPropertyIssueResponse = z.infer<typeof portalPropertyIssueResponseSchema>;

export const portalPropertyIssuesResponseSchema = z.object({
  issues: z.array(portalPropertyIssueResponseSchema),
});
export type PortalPropertyIssuesResponse = z.infer<typeof portalPropertyIssuesResponseSchema>;
