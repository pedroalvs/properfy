import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { api } from '@/services/api';
import { toApiError, type ApiError } from '@/lib/api-error';

export interface SuccessResponse<T> {
  data: T;
}

/** Fill `retryAfter` from the Retry-After header when a 429 body lacks it. */
function withRetryAfter(apiError: ApiError, response: Response | undefined): ApiError {
  if (apiError.status === 429 && apiError.retryAfter === undefined) {
    const header = response?.headers?.get('Retry-After');
    const seconds = header === null || header === undefined ? NaN : Number(header);
    if (Number.isFinite(seconds)) apiError.retryAfter = seconds;
  }
  return apiError;
}

async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  let result: { data?: unknown; error?: unknown; response?: Response };
  try {
    result = await api.GET(path as any, {
      params: { query: params as any },
    });
  } catch (err) {
    // fetch itself threw (offline, DNS, CORS) — normalize as a network error.
    throw toApiError(err);
  }
  const { data, error, response } = result;
  if (error) throw withRetryAfter(toApiError(error, response?.status), response);
  return data as T;
}

async function apiPost<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  let result: { data?: unknown; error?: unknown; response?: Response };
  try {
    result = await api.POST(path as any, {
      body: body as any,
      headers,
    });
  } catch (err) {
    throw toApiError(err);
  }
  const { data, error, response } = result;
  if (error) throw withRetryAfter(toApiError(error, response?.status), response);
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
