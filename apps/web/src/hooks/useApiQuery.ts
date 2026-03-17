import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface SuccessResponse<T> {
  data: T;
}

export interface ListParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  [key: string]: string | number | boolean | undefined;
}

// ─── Paginated List Query ──────────────────────────────────────────────────

export function usePaginatedQuery<T>(
  queryKey: unknown[],
  path: string,
  params?: ListParams,
  options?: Omit<UseQueryOptions<PaginatedResponse<T>, ApiError>, 'queryKey' | 'queryFn'>,
) {
  const stringParams = toStringParams(params);

  return useQuery<PaginatedResponse<T>, ApiError>({
    queryKey: [...queryKey, params],
    queryFn: () => apiClient.get<PaginatedResponse<T>>(path, stringParams),
    ...options,
  });
}

// ─── Detail Query ──────────────────────────────────────────────────────────

export function useDetailQuery<T>(
  queryKey: unknown[],
  path: string,
  options?: Omit<UseQueryOptions<SuccessResponse<T>, ApiError>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<SuccessResponse<T>, ApiError>({
    queryKey,
    queryFn: () => apiClient.get<SuccessResponse<T>>(path),
    ...options,
  });
}

// ─── Create Mutation ───────────────────────────────────────────────────────

export function useCreateMutation<TInput, TResponse = unknown>(
  path: string,
  invalidateKeys?: unknown[][],
  options?: Omit<UseMutationOptions<SuccessResponse<TResponse>, ApiError, TInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();

  return useMutation<SuccessResponse<TResponse>, ApiError, TInput>({
    mutationFn: (data) => apiClient.post<SuccessResponse<TResponse>>(path, data),
    onSuccess: (...args) => {
      invalidateKeys?.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}

// ─── Update Mutation ───────────────────────────────────────────────────────

export function useUpdateMutation<TInput, TResponse = unknown>(
  path: string,
  invalidateKeys?: unknown[][],
  options?: Omit<UseMutationOptions<SuccessResponse<TResponse>, ApiError, TInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();

  return useMutation<SuccessResponse<TResponse>, ApiError, TInput>({
    mutationFn: (data) => apiClient.patch<SuccessResponse<TResponse>>(path, data),
    onSuccess: (...args) => {
      invalidateKeys?.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}

// ─── Action Mutation (POST without body emphasis) ──────────────────────────

export function useActionMutation<TResponse = unknown>(
  path: string,
  invalidateKeys?: unknown[][],
  options?: Omit<UseMutationOptions<SuccessResponse<TResponse>, ApiError, unknown>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();

  return useMutation<SuccessResponse<TResponse>, ApiError, unknown>({
    mutationFn: (data) => apiClient.post<SuccessResponse<TResponse>>(path, data),
    onSuccess: (...args) => {
      invalidateKeys?.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function toStringParams(params?: ListParams): Record<string, string> | undefined {
  if (!params) return undefined;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      result[key] = String(value);
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
