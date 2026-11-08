import { DEFAULT_PROPERTY_FILES_SETTING } from '@properfy/shared';

/**
 * Client-side soft guards for issue photos. The **backend is authoritative**
 * (it validates MIME, magic bytes and size at presign/confirm and returns clear
 * rejections — C.A5); these guards only keep the picker honest and avoid obvious
 * wasted uploads on mobile data. They use the shared platform *defaults* (there
 * is no inspector settings-read endpoint).
 */

/** `accept` attribute for the file picker (images only — `issueImageMimes`). */
export const ISSUE_PHOTO_ACCEPT = DEFAULT_PROPERTY_FILES_SETTING.issueImageMimes.join(',');

/** Soft per-issue photo cap (backend enforces the real `maxPhotosPerIssue`). */
export const MAX_ISSUE_PHOTOS = DEFAULT_PROPERTY_FILES_SETTING.maxPhotosPerIssue;

const MAX_FILE_SIZE_MB = DEFAULT_PROPERTY_FILES_SETTING.maxFileSizeMb;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export type PhotoRejection = 'type' | 'size';

/**
 * Returns a soft-guard rejection reason, or null when the file looks acceptable.
 * An **empty** `file.type` is allowed through — some pickers (e.g. HEIC via the
 * iOS Files app, some Android file managers) report no MIME; the backend sniffs
 * magic bytes and is authoritative (C.A5), so a soft client hint must not hard-
 * block a file it can't classify.
 */
export function checkIssuePhoto(file: { type: string; size: number }): PhotoRejection | null {
  if (file.type && !DEFAULT_PROPERTY_FILES_SETTING.issueImageMimes.includes(file.type)) return 'type';
  if (file.size > MAX_FILE_SIZE_BYTES) return 'size';
  return null;
}

export function photoRejectionMessage(rejection: PhotoRejection): string {
  return rejection === 'type'
    ? 'Only image files (JPEG, PNG, HEIC or WebP) can be added.'
    : `Each photo must be under ${MAX_FILE_SIZE_MB} MB.`;
}

/** Whether another photo may be added given the current count (soft cap). */
export function canAddMorePhotos(currentCount: number): boolean {
  return currentCount < MAX_ISSUE_PHOTOS;
}
