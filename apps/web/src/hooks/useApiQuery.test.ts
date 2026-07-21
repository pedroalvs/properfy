import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-error';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

import { api } from '@/services/api';
import { useDetailQuery, useCreateMutation, useAllPagesQuery } from './useApiQuery';

const mockGet = api.GET as ReturnType<typeof vi.fn>;
const mockPost = api.POST as ReturnType<typeof vi.fn>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe('useApiQuery error normalization', () => {
  it('threads the HTTP status from the response into the ApiError', async () => {
    mockGet.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'FORBIDDEN', message: 'Not allowed for your role' } },
      response: { status: 403 },
    });

    const { result } = renderHook(() => useDetailQuery(['thing', '1'], '/v1/things/1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const error = result.current.error as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
    expect(error.message).toBe('Not allowed for your role');
  });

  it('wraps a thrown fetch failure as a network ApiError', async () => {
    mockGet.mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => useDetailQuery(['thing', '1'], '/v1/things/1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const error = result.current.error as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.code).toBe('NETWORK_ERROR');
  });

  it('reads the Retry-After header into retryAfter on 429 responses', async () => {
    mockPost.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      response: { status: 429, headers: new Headers({ 'Retry-After': '30' }) },
    });

    const { result } = renderHook(() => useCreateMutation('/v1/things'), {
      wrapper: createWrapper(),
    });

    let thrown: unknown;
    await result.current.mutateAsync({}).catch((err: unknown) => {
      thrown = err;
    });

    const error = thrown as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(429);
    expect(error.retryAfter).toBe(30);
  });

  it('parses an HTTP-date Retry-After header into remaining seconds', async () => {
    const fixedNow = Date.parse('2026-07-20T10:00:00.000Z');
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    try {
      mockPost.mockResolvedValue({
        data: undefined,
        error: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
        response: {
          status: 429,
          headers: new Headers({ 'Retry-After': new Date(fixedNow + 90_000).toUTCString() }),
        },
      });

      const { result } = renderHook(() => useCreateMutation('/v1/things'), {
        wrapper: createWrapper(),
      });

      let thrown: unknown;
      await result.current.mutateAsync({}).catch((err: unknown) => {
        thrown = err;
      });

      expect((thrown as ApiError).retryAfter).toBe(90);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('ignores negative and malformed Retry-After headers', async () => {
    for (const header of ['-5', 'not-a-date']) {
      mockPost.mockResolvedValue({
        data: undefined,
        error: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
        response: { status: 429, headers: new Headers({ 'Retry-After': header }) },
      });

      const { result } = renderHook(() => useCreateMutation('/v1/things'), {
        wrapper: createWrapper(),
      });

      let thrown: unknown;
      await result.current.mutateAsync({}).catch((err: unknown) => {
        thrown = err;
      });

      expect((thrown as ApiError).status).toBe(429);
      expect((thrown as ApiError).retryAfter).toBeUndefined();
    }
  });

  it('keeps a body-provided retryAfter over the header', async () => {
    mockPost.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'RATE_LIMITED', message: 'Too many requests', retryAfter: 12 } },
      response: { status: 429, headers: new Headers({ 'Retry-After': '99' }) },
    });

    const { result } = renderHook(() => useCreateMutation('/v1/things'), {
      wrapper: createWrapper(),
    });

    let thrown: unknown;
    await result.current.mutateAsync({}).catch((err: unknown) => {
      thrown = err;
    });

    expect((thrown as ApiError).retryAfter).toBe(12);
  });

  it('preserves validation details from the envelope', async () => {
    mockPost.mockResolvedValue({
      data: undefined,
      error: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [{ field: 'email', message: 'Invalid email' }],
        },
      },
      response: { status: 422 },
    });

    const { result } = renderHook(() => useCreateMutation('/v1/things'), {
      wrapper: createWrapper(),
    });

    let thrown: unknown;
    await result.current.mutateAsync({}).catch((err: unknown) => {
      thrown = err;
    });

    const error = thrown as ApiError;
    expect(error.status).toBe(422);
    expect(error.details).toEqual([{ field: 'email', message: 'Invalid email' }]);
  });
});

describe('useAllPagesQuery', () => {
  function pageResponse(items: unknown[], page: number, total: number, totalPages: number) {
    return {
      data: {
        data: items,
        pagination: { page, pageSize: 100, total, totalPages },
      },
      error: undefined,
      response: { status: 200 },
    };
  }

  it('aggregates every page sequentially with pageSize 100', async () => {
    mockGet.mockImplementation(async (_path: string, opts: { params: { query: Record<string, string> } }) => {
      const page = Number(opts.params.query.page);
      const items = page === 3 ? [{ id: 'i-201' }] : Array.from({ length: 100 }, (_, i) => ({ id: `i-${(page - 1) * 100 + i}` }));
      return pageResponse(items, page, 201, 3);
    });

    const { result } = renderHook(
      () => useAllPagesQuery(['all-things'], '/v1/things', { status: 'OPEN' }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(mockGet).toHaveBeenNthCalledWith(1, '/v1/things', {
      params: { query: { page: '1', pageSize: '100', status: 'OPEN' } },
    });
    expect(mockGet).toHaveBeenNthCalledWith(2, '/v1/things', {
      params: { query: { page: '2', pageSize: '100', status: 'OPEN' } },
    });
    expect(mockGet).toHaveBeenNthCalledWith(3, '/v1/things', {
      params: { query: { page: '3', pageSize: '100', status: 'OPEN' } },
    });
    expect(result.current.data?.data).toHaveLength(201);
    expect(result.current.data?.data[0]).toEqual({ id: 'i-0' });
    expect(result.current.data?.data[200]).toEqual({ id: 'i-201' });
    expect(result.current.data?.pagination.total).toBe(201);
    expect(result.current.data?.pagination.totalPages).toBe(1);
  });

  it('issues a single request when everything fits in one page', async () => {
    mockGet.mockResolvedValue(pageResponse([{ id: 'only' }], 1, 1, 1));

    const { result } = renderHook(() => useAllPagesQuery(['all-things'], '/v1/things'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(result.current.data?.data).toEqual([{ id: 'only' }]);
  });

  it('overrides any caller-provided page/pageSize with the loop values', async () => {
    mockGet.mockResolvedValue(pageResponse([], 1, 0, 0));

    const { result } = renderHook(
      () => useAllPagesQuery(['all-things'], '/v1/things', { page: 7, pageSize: 25 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith('/v1/things', {
      params: { query: { page: '1', pageSize: '100' } },
    });
  });

  it('fails the whole query when a later page errors (no partial data)', async () => {
    mockGet.mockImplementation(async (_path: string, opts: { params: { query: Record<string, string> } }) => {
      if (opts.params.query.page === '2') {
        return {
          data: undefined,
          error: { error: { code: 'INTERNAL_ERROR', message: 'boom' } },
          response: { status: 500 },
        };
      }
      return pageResponse(Array.from({ length: 100 }, (_, i) => ({ id: `i-${i}` })), 1, 150, 2);
    });

    const { result } = renderHook(() => useAllPagesQuery(['all-things'], '/v1/things'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect((result.current.error as ApiError).status).toBe(500);
  });

  it('stops at the safety cap and warns instead of looping forever', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockGet.mockImplementation(async (_path: string, opts: { params: { query: Record<string, string> } }) => {
      const page = Number(opts.params.query.page);
      return pageResponse([{ id: `p-${page}` }], page, 100_000, 1_000);
    });

    const { result } = renderHook(() => useAllPagesQuery(['all-things'], '/v1/things'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(50);
    expect(result.current.data?.data).toHaveLength(50);
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });
});
