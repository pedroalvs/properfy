import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';
import type { paths } from '@properfy/shared';

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

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return new ApiError(
      (error as { status?: number }).status ?? 500,
      (error as { message: string }).message,
    );
  }
  return new ApiError(500, 'Unknown error');
}

async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const { data, error } = await api.GET(path as any, {
    params: { query: params as any },
  });
  if (error) throw toApiError(error);
  return data as unknown as T;
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const { data, error } = await api.POST(path as any, {
    body: body as any,
  });
  if (error) throw toApiError(error);
  return data as unknown as T;
}

async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const { data, error } = await api.PATCH(path as any, {
    body: body as any,
  });
  if (error) throw toApiError(error);
  return data as unknown as T;
}

// ─── Paginated List Query ──────────────────────────────────────────────────

export function usePaginatedQuery<T, P extends keyof paths = any>(
  queryKey: unknown[],
  path: P | string,
  params?: ListParams,
  options?: Omit<UseQueryOptions<PaginatedResponse<T>, ApiError>, 'queryKey' | 'queryFn'>,
) {
  const stringParams = toStringParams(params);

  return useQuery<PaginatedResponse<T>, ApiError>({
    queryKey: [...queryKey, params],
    queryFn: () => apiGet<PaginatedResponse<T>>(path as string, stringParams),
    ...options,
  });
}

// ─── Detail Query ──────────────────────────────────────────────────────────

export function useDetailQuery<T, P extends keyof paths = any>(
  queryKey: unknown[],
  path: P | string,
  options?: Omit<UseQueryOptions<SuccessResponse<T>, ApiError>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<SuccessResponse<T>, ApiError>({
    queryKey,
    queryFn: () => apiGet<SuccessResponse<T>>(path as string),
    ...options,
  });
}

// ─── Create Mutation ───────────────────────────────────────────────────────

export function useCreateMutation<TInput, TResponse = unknown, P extends keyof paths = any>(
  path: P | string,
  invalidateKeys?: unknown[][],
  options?: Omit<UseMutationOptions<SuccessResponse<TResponse>, ApiError, TInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();

  return useMutation<SuccessResponse<TResponse>, ApiError, TInput>({
    mutationFn: (data) => apiPost<SuccessResponse<TResponse>>(path as string, data),
    onSuccess: (...args) => {
      invalidateKeys?.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}

// ─── Update Mutation ───────────────────────────────────────────────────────

export function useUpdateMutation<TInput, TResponse = unknown, P extends keyof paths = any>(
  path: P | string,
  invalidateKeys?: unknown[][],
  options?: Omit<UseMutationOptions<SuccessResponse<TResponse>, ApiError, TInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();

  return useMutation<SuccessResponse<TResponse>, ApiError, TInput>({
    mutationFn: (data) => apiPatch<SuccessResponse<TResponse>>(path as string, data),
    onSuccess: (...args) => {
      invalidateKeys?.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}

// ─── Action Mutation (POST without body emphasis) ──────────────────────────

export function useActionMutation<TResponse = unknown, P extends keyof paths = any>(
  path: P | string,
  invalidateKeys?: unknown[][],
  options?: Omit<UseMutationOptions<SuccessResponse<TResponse>, ApiError, unknown>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();

  return useMutation<SuccessResponse<TResponse>, ApiError, unknown>({
    mutationFn: (data) => apiPost<SuccessResponse<TResponse>>(path as string, data),
    onSuccess: (...args) => {
      invalidateKeys?.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}
