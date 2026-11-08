import type { PropertyFileResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';

/** No upload-timeout convention in the codebase — 60s, matching useInspectorDocumentUpload. */
export const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * PUT the raw bytes to a presigned URL with `Content-Type` = the declared mime
 * and a 60s abort. Throws a plain Error ("Upload timed out"/"Upload failed") —
 * the signed URL is storage-direct, so there is no API error envelope here.
 */
export async function putToSignedUrl(
  uploadUrl: string,
  file: File,
  timeoutMs = UPLOAD_TIMEOUT_MS,
): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw new Error('Upload timed out');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) throw new Error('Upload failed');
}

/**
 * Confirm a presigned upload (`POST /v1/property-files/confirm`). Requires an
 * `Idempotency-Key` (D24). Validates magic bytes + size server-side (C.A5); a
 * bad file throws the API error (surfaced by `resolveFileErrorMessage`). Returns
 * the file row — READY for non-issue types, still PENDING for an issue photo
 * (D20, linked READY when its issue is created).
 */
export async function confirmPropertyFileUpload(
  fileId: string,
  idempotencyKey: string,
): Promise<PropertyFileResponse> {
  const { data, error, response } = await api.POST('/v1/property-files/confirm', {
    body: { fileId },
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  if (error) throw toApiError(error, (response as Response | undefined)?.status);
  return (data as { data: PropertyFileResponse }).data;
}
