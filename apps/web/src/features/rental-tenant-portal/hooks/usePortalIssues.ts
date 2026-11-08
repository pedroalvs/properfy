import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { FetchOptions } from 'openapi-fetch';
import type { paths } from '@properfy/shared';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';

type PostPath = { [P in keyof paths]: paths[P] extends { post: unknown } ? P : never }[keyof paths];

type IssuesResponse =
  paths['/v1/rental-tenant-portal/{token}/property-issues']['get']['responses']['200']['content']['application/json'];
export type PortalIssue = IssuesResponse['issues'][number];

type PresignResponse =
  paths['/v1/rental-tenant-portal/{token}/property-issues/presign']['post']['responses']['201']['content']['application/json'];

export interface CreatePortalReportInput {
  reason: string;
  photoFileIds: string[];
  idempotencyKey: string;
}

function portalIssuesKey(token: string) {
  return ['portal', token, 'property-issues'];
}

function toApiError(error: unknown, response?: Response): ApiError {
  if (error instanceof ApiError) return error;
  const err = error as { error?: { message?: string; code?: string } };
  return new ApiError(response?.status ?? 400, err?.error?.message ?? 'Request failed', err?.error?.code);
}

async function portalPost<P extends PostPath>(path: P, init: FetchOptions<paths[P]['post']>) {
  const { data, error, response } = await api.POST(path, init);
  if (error) throw toApiError(error, response);
  return data;
}

/** List the tenant's own submitted reports for this appointment. */
export function usePortalIssues(token: string, enabled: boolean) {
  return useQuery<IssuesResponse, ApiError>({
    queryKey: portalIssuesKey(token),
    queryFn: async () => {
      const { data, error, response } = await api.GET(
        '/v1/rental-tenant-portal/{token}/property-issues',
        { params: { path: { token } } },
      );
      if (error) throw toApiError(error, response);
      return data as IssuesResponse;
    },
    enabled: !!token && enabled,
    retry: false,
  });
}

/**
 * Upload one issue photo: presign → PUT the bytes to the signed URL → confirm.
 * Returns the confirmed `fileId`. Throws an {@link ApiError} on any step; a 503
 * carries the `FILE_STORAGE_UNAVAILABLE` code so the UI can show the shared
 * storage-unavailable message. One photo at a time (D12) is the caller's job.
 */
export async function uploadPortalIssuePhoto(
  token: string,
  file: File,
  confirmIdempotencyKey: string,
): Promise<string> {
  const presign = (await portalPost('/v1/rental-tenant-portal/{token}/property-issues/presign', {
    params: { path: { token } },
    body: { fileName: file.name, mime: file.type, sizeBytes: file.size },
  })) as PresignResponse;

  const putRes = await fetch(presign.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
  if (!putRes.ok) {
    throw new ApiError(putRes.status, 'The photo could not be uploaded. Please try again.');
  }

  await portalPost('/v1/rental-tenant-portal/{token}/property-issues/confirm-upload', {
    params: { path: { token } },
    body: { fileId: presign.fileId },
    headers: { 'Idempotency-Key': confirmIdempotencyKey },
  });

  return presign.fileId;
}

/** Create the issue from a reason + the already-confirmed photo file ids. */
export function useCreatePortalReport(token: string) {
  const queryClient = useQueryClient();
  return useMutation<unknown, ApiError, CreatePortalReportInput>({
    mutationFn: ({ reason, photoFileIds, idempotencyKey }) =>
      portalPost('/v1/rental-tenant-portal/{token}/property-issues', {
        params: { path: { token } },
        body: { reason, ...(photoFileIds.length > 0 ? { photoFileIds } : {}) },
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalIssuesKey(token) });
    },
  });
}
