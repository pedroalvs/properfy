import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PlatformSettingKey, PlatformSettingResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError, type ApiError } from '@/lib/api-error';

export interface UsePlatformSettingReturn {
  setting: PlatformSettingResponse | null;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
  /** Persist the full key value. Resolves on success; rejects with an ApiError. */
  save: (value: Record<string, unknown>) => Promise<PlatformSettingResponse>;
  isSaving: boolean;
}

/**
 * Generic read/write for one platform-settings key (`GET`/`PUT
 * /v1/platform-settings/:key`, AM/OP only). Every settings section on the
 * Platform settings page uses this hook with its own key — a feature adds
 * configuration by appending a key to the shared registry and rendering one
 * more section, never by touching this hook.
 *
 * `PUT` replaces the whole key value (last-write-wins; no optimistic
 * concurrency — D18). On success it invalidates this key and the list query.
 */
export function usePlatformSetting(key: PlatformSettingKey): UsePlatformSettingReturn {
  const queryClient = useQueryClient();

  const query = useQuery<PlatformSettingResponse, ApiError>({
    queryKey: ['platform-settings', key],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/v1/platform-settings/{key}', {
        params: { path: { key } },
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return (data as { data: PlatformSettingResponse }).data;
    },
  });

  const mutation = useMutation<PlatformSettingResponse, ApiError, Record<string, unknown>>({
    mutationFn: async (value) => {
      const { data, error, response } = await api.PUT('/v1/platform-settings/{key}', {
        params: { path: { key } },
        body: { value },
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return (data as { data: PlatformSettingResponse }).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
      queryClient.invalidateQueries({ queryKey: ['platform-settings', key] });
    },
  });

  return {
    setting: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
    save: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
