import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { createElement, type ReactNode } from 'react';

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

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

import { api } from '@/services/api';
import { usePropertyImport } from './usePropertyImport';

const mockPost = api.POST as ReturnType<typeof vi.fn>;
const mockGet = api.GET as ReturnType<typeof vi.fn>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        AuthProvider,
        null,
        createElement(SnackbarProvider, null, children),
      ),
    );
  };
}

beforeEach(() => {
  mockPost.mockReset();
  mockGet.mockReset();
});

describe('usePropertyImport', () => {
  it('upload calls POST with FormData', async () => {
    mockPost.mockResolvedValue({
      data: { data: { id: 'import-123' } },
    });

    const { result } = renderHook(() => usePropertyImport(), {
      wrapper: createWrapper(),
    });

    const file = new File(['a,b\n1,2'], 'test.csv', { type: 'text/csv' });

    await act(async () => {
      result.current.upload(file);
    });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    const callArgs = mockPost.mock.calls[0]!;
    expect(callArgs[0]).toBe('/v1/properties/import');
    expect(callArgs[1].body).toBeInstanceOf(FormData);
  });

  it('sets Idempotency-Key header', async () => {
    mockPost.mockResolvedValue({
      data: { data: { id: 'import-456' } },
    });

    const { result } = renderHook(() => usePropertyImport(), {
      wrapper: createWrapper(),
    });

    const file = new File(['data'], 'test.csv', { type: 'text/csv' });

    await act(async () => {
      result.current.upload(file);
    });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    const callArgs = mockPost.mock.calls[0]!;
    expect(callArgs[1].headers['Idempotency-Key']).toBeDefined();
    expect(typeof callArgs[1].headers['Idempotency-Key']).toBe('string');
  });

  it('sets import status to PROCESSING after upload', async () => {
    mockPost.mockResolvedValue({
      data: { data: { id: 'import-789' } },
    });

    const { result } = renderHook(() => usePropertyImport(), {
      wrapper: createWrapper(),
    });

    const file = new File(['data'], 'test.csv', { type: 'text/csv' });

    await act(async () => {
      result.current.upload(file);
    });

    await waitFor(() => {
      expect(result.current.importStatus).not.toBeNull();
      expect(result.current.importStatus?.status).toBe('PROCESSING');
      expect(result.current.importStatus?.id).toBe('import-789');
    });
  });

  it('polls status endpoint after upload', async () => {
    mockPost.mockResolvedValue({
      data: { data: { id: 'import-poll' } },
    });

    mockGet.mockResolvedValue({
      data: {
        data: {
          id: 'import-poll',
          status: 'COMPLETED',
          progress: 100,
          successCount: 10,
          errorCount: 0,
          errors: [],
        },
      },
    });

    const { result } = renderHook(() => usePropertyImport(), {
      wrapper: createWrapper(),
    });

    const file = new File(['data'], 'test.csv', { type: 'text/csv' });

    await act(async () => {
      result.current.upload(file);
    });

    await waitFor(() => {
      expect(result.current.importStatus).not.toBeNull();
    });

    await waitFor(
      () => {
        expect(mockGet).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
  });
});
