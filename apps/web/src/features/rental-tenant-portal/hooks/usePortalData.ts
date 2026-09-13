import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { FetchOptions } from 'openapi-fetch';
import type { paths } from '@properfy/shared';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';
import type {
  PortalData,
  ConfirmInput,
  UpdateContactInput,
  ReportUnavailabilityInput,
  AvailableGroupsData,
  JoinGroupInput,
  SubmitSurveyInput,
} from '../types';

// Path unions per method: a mistyped path (or a path that doesn't support the
// method) now fails typecheck instead of being silenced by `as any`.
type GetPath = { [P in keyof paths]: paths[P] extends { get: unknown } ? P : never }[keyof paths];
type PostPath = { [P in keyof paths]: paths[P] extends { post: unknown } ? P : never }[keyof paths];
type PatchPath = { [P in keyof paths]: paths[P] extends { patch: unknown } ? P : never }[keyof paths];

function portalQueryKey(token: string) {
  return ['portal', token];
}

function toApiError(error: unknown, response?: Response): ApiError {
  if (error instanceof ApiError) return error;
  const err = error as { error?: { message?: string; code?: string } };
  return new ApiError(
    response?.status ?? 400,
    err?.error?.message ?? 'Request failed',
    err?.error?.code,
  );
}

// openapi-fetch checks the path template, `params.path` and the request `body`
// against the generated contract. The response is returned as the feature's
// curated view-model type (`T`) — the local `../types` shapes remain the app's
// source of truth for what the UI consumes.
async function portalGet<T, P extends GetPath = GetPath>(path: P, init: FetchOptions<paths[P]['get']>): Promise<T> {
  const { data, error, response } = await api.GET(path, init);
  if (error) throw toApiError(error, response);
  return data as T;
}

async function portalPost<T, P extends PostPath = PostPath>(path: P, init: FetchOptions<paths[P]['post']>): Promise<T> {
  const { data, error, response } = await api.POST(path, init);
  if (error) throw toApiError(error, response);
  return data as T;
}

async function portalPatch<T, P extends PatchPath = PatchPath>(path: P, init: FetchOptions<paths[P]['patch']>): Promise<T> {
  const { data, error, response } = await api.PATCH(path, init);
  if (error) throw toApiError(error, response);
  return data as T;
}

export function usePortalData(token: string) {
  return useQuery<PortalData, ApiError>({
    queryKey: portalQueryKey(token),
    queryFn: () => portalGet<PortalData>('/v1/rental-tenant-portal/{token}', { params: { path: { token } } }),
    enabled: !!token,
    retry: false,
  });
}

export function useConfirmAppointment(token: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, ApiError, ConfirmInput>({
    mutationFn: (data) => portalPost('/v1/rental-tenant-portal/{token}/confirm', { params: { path: { token } }, body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalQueryKey(token) });
    },
  });
}

export function useUpdateContact(token: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, ApiError, UpdateContactInput>({
    mutationFn: (data) => portalPatch('/v1/rental-tenant-portal/{token}/contact', { params: { path: { token } }, body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalQueryKey(token) });
    },
  });
}

export function useReportUnavailability(token: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, ApiError, ReportUnavailabilityInput>({
    mutationFn: (data) => portalPost('/v1/rental-tenant-portal/{token}/unavailable', { params: { path: { token } }, body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalQueryKey(token) });
    },
  });
}

export function useAvailableGroups(token: string, enabled: boolean) {
  return useQuery<AvailableGroupsData, ApiError>({
    queryKey: [...portalQueryKey(token), 'available-groups'],
    queryFn: () => portalGet<AvailableGroupsData>('/v1/rental-tenant-portal/{token}/available-groups', { params: { path: { token } } }),
    enabled: !!token && enabled,
    retry: false,
  });
}

/**
 * Submits the satisfaction rating.
 *
 * The POST response is deliberately discarded: invalidating the portal query is
 * what promotes the UI to the thank-you card. That makes the idempotent
 * "already submitted" case converge on the same render for free — the server
 * payload decides what the tenant sees, not local state.
 */
export function useSubmitSurvey(token: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, ApiError, SubmitSurveyInput>({
    mutationFn: (data) => portalPost('/v1/rental-tenant-portal/{token}/survey', { params: { path: { token } }, body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalQueryKey(token) });
    },
  });
}

export function useJoinGroup(token: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, ApiError, JoinGroupInput>({
    mutationFn: (data) => portalPost('/v1/rental-tenant-portal/{token}/join-group', { params: { path: { token } }, body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalQueryKey(token) });
    },
  });
}
