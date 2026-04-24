import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';

export interface SuccessResponse<T> {
  data: T;
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    // Properfy error envelope: { error: { code, message } }
    if (e['error'] && typeof e['error'] === 'object') {
      const inner = e['error'] as Record<string, unknown>;
      return new ApiError(
        (e['status'] as number | undefined) ?? 500,
        (inner['message'] as string | undefined) ?? 'An error occurred',
        inner['code'] as string | undefined,
      );
    }
    if ('message' in e) {
      return new ApiError(
        (e['status'] as number | undefined) ?? 500,
        e['message'] as string,
      );
    }
  }
  return new ApiError(500, 'An unexpected error occurred');
}

async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const { data, error } = await api.GET(path as any, {
    params: { query: params as any },
  });
  if (error) throw toApiError(error);
  return data as T;
}

async function apiPost<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  const { data, error } = await api.POST(path as any, {
    body: body as any,
    headers,
  });
  if (error) throw toApiError(error);
  return data as T;
}

export function useDetailQuery<T>(
  queryKey: unknown[],
  path: string,
  options?: Omit<UseQueryOptions<SuccessResponse<T>, ApiError>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<SuccessResponse<T>, ApiError>({
    queryKey,
    queryFn: () => apiGet<SuccessResponse<T>>(path),
    ...options,
  });
}

export function useListQuery<T>(
  queryKey: unknown[],
  path: string,
  params?: Record<string, string>,
  options?: Omit<UseQueryOptions<T, ApiError>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<T, ApiError>({
    queryKey,
    queryFn: () => apiGet<T>(path, params),
    ...options,
  });
}

export function useActionMutation<TResponse = unknown, TInput = unknown>(
  path: string,
  invalidateKeys?: unknown[][],
  options?: Omit<UseMutationOptions<SuccessResponse<TResponse>, ApiError, TInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();

  return useMutation<SuccessResponse<TResponse>, ApiError, TInput>({
    mutationFn: (data) => apiPost<SuccessResponse<TResponse>>(path, data),
    onSuccess: (...args) => {
      invalidateKeys?.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}

export { apiGet, apiPost };
