import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-error';

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

import { api } from '@/services/api';
import { useDetailQuery, useActionMutation } from '../useApiQuery';

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

    const { result } = renderHook(() => useActionMutation('/v1/things'), {
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

  it('reads an HTTP-date Retry-After header into retryAfter on 429 responses', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T10:00:00Z'));
    try {
      mockPost.mockResolvedValue({
        data: undefined,
        error: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
        response: {
          status: 429,
          headers: new Headers({ 'Retry-After': 'Sun, 20 Jul 2026 10:00:30 GMT' }),
        },
      });

      const { result } = renderHook(() => useActionMutation('/v1/things'), {
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
    } finally {
      vi.useRealTimers();
    }
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

    const { result } = renderHook(() => useActionMutation('/v1/things'), {
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
