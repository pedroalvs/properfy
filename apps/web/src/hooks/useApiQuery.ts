import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { api } from '@/services/api';
import { toApiError, type ApiError } from '@/lib/api-error';
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

/**
 * Query-param value supported by the list endpoints. Arrays are forwarded to
 * openapi-fetch as-is so it emits repeated keys (`?key=A&key=B`) per the
 * OpenAPI `style: 'form', explode: true` default — the Fastify routes that
 * declare `z.array(...)` querystring fields parse those into arrays.
 */
export type ListParamValue = string | number | boolean | string[] | undefined;

export interface ListParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  [key: string]: ListParamValue;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function toStringParams(params?: ListParams): Record<string, string | string[]> | undefined {
  if (!params) return undefined;
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) result[key] = value;
    } else {
      result[key] = String(value);
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Parse a Retry-After header value (delta-seconds or HTTP-date) into seconds. */
function parseRetryAfter(header: string | null | undefined): number | undefined {
  if (header === null || header === undefined || header === '') return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds : undefined;
  const dateMs = Date.parse(header);
  if (Number.isNaN(dateMs)) return undefined;
  return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));
}

/** Fill `retryAfter` from the Retry-After header when a 429 body lacks it. */
function withRetryAfter(apiError: ApiError, response: Response | undefined): ApiError {
  if (apiError.status === 429 && apiError.retryAfter === undefined) {
    const parsed = parseRetryAfter(response?.headers?.get('Retry-After'));
    if (parsed !== undefined) apiError.retryAfter = parsed;
  }
  return apiError;
}

async function unwrapApiResult<T>(
  call: () => Promise<{ data?: unknown; error?: unknown; response?: Response }>,
): Promise<T> {
  let result: { data?: unknown; error?: unknown; response?: Response };
  try {
    result = await call();
  } catch (err) {
    // fetch itself threw (offline, DNS, CORS) — normalize as a network error.
    throw toApiError(err);
  }
  const { data, error, response } = result;
  if (error) throw withRetryAfter(toApiError(error, response?.status), response);
  return data as unknown as T;
}

async function apiGet<T>(path: string, params?: Record<string, string | string[]>): Promise<T> {
  return unwrapApiResult<T>(() => api.GET(path as any, { params: { query: params as any } }));
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return unwrapApiResult<T>(() => api.POST(path as any, { body: body as any }));
}

async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return unwrapApiResult<T>(() => api.PATCH(path as any, { body: body as any }));
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

// ─── All-Pages Query ───────────────────────────────────────────────────────

/**
 * Hard stop so a pathological `totalPages` can never loop forever
 * (50 pages × 100 rows = 5,000 rows).
 */
const MAX_FETCH_ALL_PAGES = 50;

/**
 * Sequentially fetches every page of a list endpoint (the backend caps
 * pageSize at 100 — larger values are a 400) and returns the aggregated
 * result with synthetic single-page pagination meta. Any page failing
 * rejects the whole call — partial data would render a misleading map.
 */
async function fetchAllPages<T>(path: string, params?: ListParams): Promise<PaginatedResponse<T>> {
  const pageSize = 100;
  const all: T[] = [];
  let page = 1;
  let meta: PaginationMeta = { page: 1, pageSize, total: 0, totalPages: 0 };
  do {
    const res = await apiGet<PaginatedResponse<T>>(
      path,
      toStringParams({ ...params, page, pageSize }),
    );
    all.push(...res.data);
    meta = res.pagination;
    page += 1;
  } while (page <= meta.totalPages && page <= MAX_FETCH_ALL_PAGES);
  if (meta.totalPages > MAX_FETCH_ALL_PAGES) {
    console.warn(
      `[fetchAllPages] ${path}: stopped at ${MAX_FETCH_ALL_PAGES} of ${meta.totalPages} pages`,
    );
  }
  return { data: all, pagination: { page: 1, pageSize: all.length, total: meta.total, totalPages: 1 } };
}

/**
 * Like usePaginatedQuery, but aggregates ALL pages of the endpoint. Any
 * `page`/`pageSize` in `params` is ignored — the loop drives both.
 */
export function useAllPagesQuery<T, P extends keyof paths = any>(
  queryKey: unknown[],
  path: P | string,
  params?: ListParams,
  options?: Omit<UseQueryOptions<PaginatedResponse<T>, ApiError>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<PaginatedResponse<T>, ApiError>({
    queryKey: [...queryKey, params],
    queryFn: () => fetchAllPages<T>(path as string, params),
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
