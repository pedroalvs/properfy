/**
 * Property files & issues — shared constants and the single storage-key grammar
 * (F10 D25). Backend presign/confirm and the portal (TASK-F10-4) build and
 * validate storage keys only through these helpers, so the key ↔ row binding has
 * one source of truth (never a fixed `.jpg`).
 */

/** The private Supabase bucket reused for all property files (F10 D10 — not a new bucket). */
export const PROPERTY_FILE_STORAGE_BUCKET = 'inspection-assets';

/**
 * Hard cap on photos a rental tenant may attach to one portal issue (F10 D17).
 * The effective portal max is `min(PORTAL_MAX_PHOTOS_PER_ISSUE, maxPhotosPerIssue)`.
 */
export const PORTAL_MAX_PHOTOS_PER_ISSUE = 5;

/** Shown by web, PWA and portal when storage is unconfigured (503) — one string (F10 D16). */
export const FILE_STORAGE_UNAVAILABLE_MESSAGE =
  'File storage is temporarily unavailable. Please try again in a moment.';

/** File extension by allowed MIME type (used to build storage keys and name objects). */
export const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

/** Resolve the storage extension for a MIME type, falling back to `bin`. */
export function extensionForMime(mime: string): string {
  return EXTENSION_BY_MIME[mime] ?? 'bin';
}

const EXT = '[a-z0-9]+';
const UUID = '[0-9a-fA-F-]{36}';

/** Authenticated property file key: `files/{tenantId}/{propertyId}/{fileId}.{ext}`. */
export function buildPropertyFileStorageKey(params: {
  tenantId: string;
  propertyId: string;
  fileId: string;
  ext: string;
}): string {
  const { tenantId, propertyId, fileId, ext } = params;
  return `files/${tenantId}/${propertyId}/${fileId}.${ext}`;
}

const PROPERTY_FILE_KEY_REGEX = new RegExp(
  `^files/(${UUID})/(${UUID})/(${UUID})\\.(${EXT})$`,
);

/** Parse an authenticated property file key, or `null` if it is not well-formed. */
export function parsePropertyFileStorageKey(
  key: string,
): { tenantId: string; propertyId: string; fileId: string; ext: string } | null {
  const m = PROPERTY_FILE_KEY_REGEX.exec(key);
  if (!m) return null;
  const [, tenantId, propertyId, fileId, ext] = m;
  if (!tenantId || !propertyId || !fileId || !ext) return null;
  return { tenantId, propertyId, fileId, ext };
}

/** Portal issue photo key: `files/{tenantId}/tenant-issues/{appointmentId}/{fileId}.{ext}` (F10 D25). */
export function buildPortalIssueStorageKey(params: {
  tenantId: string;
  appointmentId: string;
  fileId: string;
  ext: string;
}): string {
  const { tenantId, appointmentId, fileId, ext } = params;
  return `files/${tenantId}/tenant-issues/${appointmentId}/${fileId}.${ext}`;
}

const PORTAL_ISSUE_KEY_REGEX = new RegExp(
  `^files/(${UUID})/tenant-issues/(${UUID})/(${UUID})\\.(${EXT})$`,
);

/** Parse a portal issue key, or `null` if it is not well-formed. */
export function parsePortalIssueStorageKey(
  key: string,
): { tenantId: string; appointmentId: string; fileId: string; ext: string } | null {
  const m = PORTAL_ISSUE_KEY_REGEX.exec(key);
  if (!m) return null;
  const [, tenantId, appointmentId, fileId, ext] = m;
  if (!tenantId || !appointmentId || !fileId || !ext) return null;
  return { tenantId, appointmentId, fileId, ext };
}
