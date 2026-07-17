import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { createElement, type ReactNode } from 'react';

const { mockShowError } = vi.hoisted(() => ({
  mockShowError: vi.fn(),
}));

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

vi.mock('@/hooks/useSnackbar', async () => {
  const actual = await vi.importActual('@/hooks/useSnackbar');
  return {
    ...actual,
    useSnackbar: () => ({
      messages: [],
      showError: mockShowError,
      showInfo: vi.fn(),
      showSuccess: vi.fn(),
      dismiss: vi.fn(),
    }),
  };
});

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

const PREVIEW_RESPONSE = {
  importId: 'import-123',
  tenantId: 'tenant-1',
  summary: { totalRows: 1, importable: 1, withWarnings: 0, withErrors: 0 },
  rows: [{ rowNumber: 2, severity: 'ready', importable: true }],
};

beforeEach(() => {
  mockPost.mockReset();
  mockGet.mockReset();
  mockShowError.mockReset();
});

describe('usePropertyImport', () => {
  describe('preview', () => {
    it('POSTs multipart FormData with tenantId appended before the file', async () => {
      mockPost.mockResolvedValue({ data: { data: PREVIEW_RESPONSE } });
      const { result } = renderHook(() => usePropertyImport(), { wrapper: createWrapper() });
      const file = new File(['propertyCode\nP-1\n'], 'props.csv', { type: 'text/csv' });

      let response: unknown;
      await act(async () => {
        response = await result.current.preview(file, 'tenant-1');
      });

      expect(mockPost).toHaveBeenCalledTimes(1);
      const [path, options] = mockPost.mock.calls[0]!;
      expect(path).toBe('/v1/properties/import/preview');
      const formData = options.body as FormData;
      expect(formData).toBeInstanceOf(FormData);
      expect(formData.get('tenantId')).toBe('tenant-1');
      expect(formData.get('file')).toBe(file);
      expect(response).toEqual(PREVIEW_RESPONSE);
    });

    it('omits the tenantId part for tenant-scoped actors', async () => {
      mockPost.mockResolvedValue({ data: { data: PREVIEW_RESPONSE } });
      const { result } = renderHook(() => usePropertyImport(), { wrapper: createWrapper() });
      const file = new File(['propertyCode\nP-1\n'], 'props.csv', { type: 'text/csv' });

      await act(async () => {
        await result.current.preview(file);
      });

      const formData = mockPost.mock.calls[0]![1].body as FormData;
      expect(formData.get('tenantId')).toBeNull();
      expect(formData.get('file')).toBe(file);
    });

    it('returns null and shows an error when the preview fails', async () => {
      mockPost.mockResolvedValue({ error: { code: 'VALIDATION_ERROR', message: 'bad file' } });
      const { result } = renderHook(() => usePropertyImport(), { wrapper: createWrapper() });
      const file = new File(['x'], 'props.csv', { type: 'text/csv' });

      let response: unknown = 'sentinel';
      await act(async () => {
        response = await result.current.preview(file, 'tenant-1');
      });

      expect(response).toBeNull();
      expect(mockShowError).toHaveBeenCalledWith('Failed to preview the import file');
    });
  });

  describe('commit', () => {
    it('POSTs the commit with a deterministic Idempotency-Key derived from the importId', async () => {
      mockPost.mockResolvedValue({ data: { data: { importId: 'import-123', status: 'PROCESSING' } } });
      mockGet.mockResolvedValue({ data: { data: { id: 'import-123', status: 'PROCESSING', totalRows: 0, successCount: 0, errorCount: 0, resultsJson: null } } });
      const { result } = renderHook(() => usePropertyImport(), { wrapper: createWrapper() });

      let ok = false;
      await act(async () => {
        ok = await result.current.commit('import-123', { skipInvalidRows: true });
      });

      expect(ok).toBe(true);
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/properties/import/{importId}/commit',
        expect.objectContaining({
          params: { path: { importId: 'import-123' } },
          body: { skipInvalidRows: true },
          headers: { 'Idempotency-Key': 'property-import-commit:import-123' },
        }),
      );
    });

    it('starts polling the status endpoint after a successful commit', async () => {
      mockPost.mockResolvedValue({ data: { data: { importId: 'import-123', status: 'PROCESSING' } } });
      mockGet.mockResolvedValue({
        data: {
          data: {
            id: 'import-123', status: 'COMPLETED', totalRows: 2, successCount: 2, errorCount: 0,
            resultsJson: [
              { rowNumber: 2, status: 'created', propertyId: 'prop-1' },
              { rowNumber: 3, status: 'reused', propertyId: 'prop-0' },
            ],
          },
        },
      });
      const { result } = renderHook(() => usePropertyImport(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.commit('import-123', { skipInvalidRows: false });
      });

      await waitFor(() => expect(result.current.importStatus).not.toBeNull());
      expect(mockGet).toHaveBeenCalledWith(
        '/v1/properties/import/{importId}',
        expect.objectContaining({ params: { path: { importId: 'import-123' } } }),
      );
      expect(result.current.importStatus).toEqual({
        id: 'import-123',
        status: 'COMPLETED',
        totalRows: 2,
        successCount: 2,
        errorCount: 0,
        results: [
          { rowNumber: 2, status: 'created', propertyId: 'prop-1', message: undefined },
          { rowNumber: 3, status: 'reused', propertyId: 'prop-0', message: undefined },
        ],
      });
    });

    it('returns false and shows an error when the commit fails', async () => {
      mockPost.mockResolvedValue({ error: { code: 'IMPORT_HAS_ERRORS', message: 'nope' } });
      const { result } = renderHook(() => usePropertyImport(), { wrapper: createWrapper() });

      let ok = true;
      await act(async () => {
        ok = await result.current.commit('import-123', { skipInvalidRows: false });
      });

      expect(ok).toBe(false);
      expect(mockShowError).toHaveBeenCalledWith('Failed to start the import');
      expect(mockGet).not.toHaveBeenCalled();
    });
  });
});
