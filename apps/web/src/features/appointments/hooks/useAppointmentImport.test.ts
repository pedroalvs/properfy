import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { createElement, type ReactNode } from 'react';

const { mockShowError, mockShowInfo, mockShowSuccess } = vi.hoisted(() => ({
  mockShowError: vi.fn(),
  mockShowInfo: vi.fn(),
  mockShowSuccess: vi.fn(),
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
      showInfo: mockShowInfo,
      showSuccess: mockShowSuccess,
      dismiss: vi.fn(),
    }),
  };
});

import { api } from '@/services/api';
import { useAppointmentImport } from './useAppointmentImport';

const mockPost = api.POST as ReturnType<typeof vi.fn>;
const mockGet = api.GET as ReturnType<typeof vi.fn>;
const POLL_INTERVAL_MS = 3000;

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
  branchId: 'branch-1',
  tenantId: 'tenant-1',
  summary: { totalRows: 1, importable: 1, withWarnings: 0, withErrors: 0 },
  rows: [{ rowNumber: 2, severity: 'ready', importable: true }],
};

beforeEach(() => {
  mockPost.mockReset();
  mockGet.mockReset();
  mockShowError.mockReset();
  mockShowInfo.mockReset();
  mockShowSuccess.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAppointmentImport', () => {
  describe('preview', () => {
    it('POSTs multipart FormData with branchId appended before the file', async () => {
      mockPost.mockResolvedValue({ data: { data: PREVIEW_RESPONSE } });
      const { result } = renderHook(() => useAppointmentImport(), { wrapper: createWrapper() });
      const file = new File(['Type\nRoutine Inspection\n'], 'import.csv', { type: 'text/csv' });

      await act(async () => {
        await result.current.preview(file, 'branch-1');
      });

      expect(mockPost).toHaveBeenCalledTimes(1);
      const [path, options] = mockPost.mock.calls[0]!;
      expect(path).toBe('/v1/appointments/import/preview');
      const formData = options.body as FormData;
      expect(formData).toBeInstanceOf(FormData);
      const keys = Array.from(formData.keys());
      expect(keys.indexOf('branchId')).toBeLessThan(keys.indexOf('file'));
      expect(formData.get('branchId')).toBe('branch-1');
    });

    it('includes actorTimezone when provided', async () => {
      mockPost.mockResolvedValue({ data: { data: PREVIEW_RESPONSE } });
      const { result } = renderHook(() => useAppointmentImport(), { wrapper: createWrapper() });
      const file = new File(['data'], 'import.csv');

      await act(async () => {
        await result.current.preview(file, 'branch-1', 'Australia/Sydney');
      });

      const formData = mockPost.mock.calls[0]![1].body as FormData;
      expect(formData.get('actorTimezone')).toBe('Australia/Sydney');
    });

    it('returns the preview response data', async () => {
      mockPost.mockResolvedValue({ data: { data: PREVIEW_RESPONSE } });
      const { result } = renderHook(() => useAppointmentImport(), { wrapper: createWrapper() });
      const file = new File(['data'], 'import.csv');

      let returned: unknown;
      await act(async () => {
        returned = await result.current.preview(file, 'branch-1');
      });

      expect(returned).toEqual(PREVIEW_RESPONSE);
    });

    it('returns null and does not throw when the API errors', async () => {
      mockPost.mockResolvedValue({ error: { code: 'VALIDATION_ERROR', message: 'bad file' } });
      const { result } = renderHook(() => useAppointmentImport(), { wrapper: createWrapper() });
      const file = new File(['data'], 'import.csv');

      let returned: unknown = 'not-set';
      await act(async () => {
        returned = await result.current.preview(file, 'branch-1');
      });

      expect(returned).toBeNull();
    });

    it('tracks isPreviewing around the call', async () => {
      let resolvePost!: (v: unknown) => void;
      mockPost.mockReturnValue(new Promise((resolve) => { resolvePost = resolve; }));
      const { result } = renderHook(() => useAppointmentImport(), { wrapper: createWrapper() });
      const file = new File(['data'], 'import.csv');

      let previewPromise!: Promise<unknown>;
      act(() => {
        previewPromise = result.current.preview(file, 'branch-1');
      });
      await waitFor(() => expect(result.current.isPreviewing).toBe(true));

      await act(async () => {
        resolvePost({ data: { data: PREVIEW_RESPONSE } });
        await previewPromise;
      });
      expect(result.current.isPreviewing).toBe(false);
    });
  });

  describe('commit', () => {
    it('POSTs to the commit endpoint with skipInvalidRows and an Idempotency-Key header', async () => {
      mockPost.mockResolvedValue({ data: { data: { importId: 'import-123', status: 'PROCESSING' } } });
      const { result } = renderHook(() => useAppointmentImport(), { wrapper: createWrapper() });

      let ok = false;
      await act(async () => {
        ok = await result.current.commit('import-123', { skipInvalidRows: true, actorTimezone: 'Australia/Sydney' });
      });

      expect(ok).toBe(true);
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/appointments/import/{importId}/commit',
        expect.objectContaining({
          params: { path: { importId: 'import-123' } },
          body: { skipInvalidRows: true, actorTimezone: 'Australia/Sydney' },
        }),
      );
      const headers = mockPost.mock.calls[0]![1].headers;
      expect(typeof headers['Idempotency-Key']).toBe('string');
    });

    it('sends the same Idempotency-Key on a retry for the same importId', async () => {
      mockPost.mockResolvedValue({ data: { data: { importId: 'import-123', status: 'PROCESSING' } } });
      const { result } = renderHook(() => useAppointmentImport(), { wrapper: createWrapper() });

      await act(async () => { await result.current.commit('import-123', { skipInvalidRows: false }); });
      await act(async () => { await result.current.commit('import-123', { skipInvalidRows: false }); });

      const firstKey = mockPost.mock.calls[0]![1].headers['Idempotency-Key'];
      const secondKey = mockPost.mock.calls[1]![1].headers['Idempotency-Key'];
      expect(secondKey).toBe(firstKey);
    });

    it('uses a different Idempotency-Key for a different importId', async () => {
      mockPost.mockResolvedValue({ data: { data: { importId: 'import-123', status: 'PROCESSING' } } });
      const { result } = renderHook(() => useAppointmentImport(), { wrapper: createWrapper() });

      await act(async () => { await result.current.commit('import-123', { skipInvalidRows: false }); });
      await act(async () => { await result.current.commit('import-456', { skipInvalidRows: false }); });

      const firstKey = mockPost.mock.calls[0]![1].headers['Idempotency-Key'];
      const secondKey = mockPost.mock.calls[1]![1].headers['Idempotency-Key'];
      expect(secondKey).not.toBe(firstKey);
    });

    it('returns false and does not throw when the API errors', async () => {
      mockPost.mockResolvedValue({ error: { code: 'CONFLICT', message: 'has errors' } });
      const { result } = renderHook(() => useAppointmentImport(), { wrapper: createWrapper() });

      let ok = true;
      await act(async () => {
        ok = await result.current.commit('import-123', { skipInvalidRows: false });
      });

      expect(ok).toBe(false);
    });

    it('starts polling the status endpoint after a successful commit', async () => {
      mockPost.mockResolvedValue({ data: { data: { importId: 'import-123', status: 'PROCESSING' } } });
      mockGet.mockResolvedValue({
        data: {
          data: {
            id: 'import-123', branchId: 'branch-1', status: 'COMPLETED',
            totalRows: 1, successCount: 1, errorCount: 0, resultsJson: [],
          },
        },
      });
      const { result } = renderHook(() => useAppointmentImport(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.commit('import-123', { skipInvalidRows: false });
      });

      await waitFor(() => expect(mockGet).toHaveBeenCalled(), { timeout: 5000 });
      await waitFor(() => expect(result.current.importStatus?.status).toBe('COMPLETED'));
    });

    it('normalizes resultsJson into per-row results', async () => {
      mockPost.mockResolvedValue({ data: { data: { importId: 'import-123', status: 'PROCESSING' } } });
      mockGet.mockResolvedValue({
        data: {
          data: {
            id: 'import-123', branchId: 'branch-1', status: 'FAILED',
            totalRows: 2, successCount: 1, errorCount: 1,
            resultsJson: [
              { rowNumber: 2, status: 'created', appointmentId: 'apt-1' },
              { rowNumber: 3, status: 'error', message: 'No service type found' },
            ],
          },
        },
      });
      const { result } = renderHook(() => useAppointmentImport(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.commit('import-123', { skipInvalidRows: true });
      });

      await waitFor(() => expect(result.current.importStatus?.status).toBe('FAILED'));
      expect(result.current.importStatus?.results).toEqual([
        { rowNumber: 2, status: 'created', appointmentId: 'apt-1', message: undefined },
        { rowNumber: 3, status: 'error', appointmentId: undefined, message: 'No service type found' },
      ]);
    });

    it('keeps polling after a slow-import warning and only shows the warning once', async () => {
      vi.useFakeTimers();
      mockPost.mockResolvedValue({ data: { data: { importId: 'import-123', status: 'PROCESSING' } } });

      let statusCalls = 0;
      mockGet.mockImplementation(() => {
        statusCalls += 1;

        if (statusCalls <= 20) {
          return Promise.resolve({
            data: {
              data: {
                id: 'import-123',
                branchId: 'branch-1',
                status: 'PROCESSING',
                totalRows: 2,
                successCount: 0,
                errorCount: 0,
                resultsJson: [],
              },
            },
          });
        }

        return Promise.resolve({
          data: {
            data: {
              id: 'import-123',
              branchId: 'branch-1',
              status: 'COMPLETED',
              totalRows: 2,
              successCount: 2,
              errorCount: 0,
              resultsJson: [
                { rowNumber: 2, status: 'created', appointmentId: 'apt-1' },
                { rowNumber: 3, status: 'created', appointmentId: 'apt-2' },
              ],
            },
          },
        });
      });

      const { result } = renderHook(() => useAppointmentImport(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.commit('import-123', { skipInvalidRows: false });
      });
      await act(async () => {});
      expect(mockGet).toHaveBeenCalledTimes(1);

      await act(async () => {
        for (let i = 0; i < 20; i += 1) {
          await vi.advanceTimersByTimeAsync(3000);
        }
      });
      await act(async () => {});

      expect(mockShowError).toHaveBeenCalledTimes(1);
      expect(mockShowError).toHaveBeenCalledWith('Import is taking longer than expected. Check back later.');
      expect(mockGet.mock.calls.length).toBeGreaterThan(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      await act(async () => {});

      expect(mockGet.mock.calls.length).toBeGreaterThan(2);
      expect(mockShowError).toHaveBeenCalledTimes(1);
    });

    it('resets the stalled poll budget when progress resumes before warning threshold', async () => {
      vi.useFakeTimers();
      mockPost.mockResolvedValue({ data: { data: { importId: 'import-123', status: 'PROCESSING' } } });

      let statusCalls = 0;
      mockGet.mockImplementation(() => {
        statusCalls += 1;

        if (statusCalls <= 10) {
          return Promise.resolve({
            data: {
              data: {
                id: 'import-123',
                branchId: 'branch-1',
                status: 'PROCESSING',
                totalRows: 2,
                successCount: 0,
                errorCount: 0,
                resultsJson: [],
              },
            },
          });
        }

        if (statusCalls === 11) {
          return Promise.resolve({
            data: {
              data: {
                id: 'import-123',
                branchId: 'branch-1',
                status: 'PROCESSING',
                totalRows: 2,
                successCount: 1,
                errorCount: 0,
                resultsJson: [{ rowNumber: 2, status: 'created', appointmentId: 'apt-1' }],
              },
            },
          });
        }

        if (statusCalls <= 30) {
          return Promise.resolve({
            data: {
              data: {
                id: 'import-123',
                branchId: 'branch-1',
                status: 'PROCESSING',
                totalRows: 2,
                successCount: 1,
                errorCount: 0,
                resultsJson: [{ rowNumber: 2, status: 'created', appointmentId: 'apt-1' }],
              },
            },
          });
        }

        return Promise.resolve({
          data: {
            data: {
              id: 'import-123',
              branchId: 'branch-1',
              status: 'COMPLETED',
              totalRows: 2,
              successCount: 2,
              errorCount: 0,
              resultsJson: [
                { rowNumber: 2, status: 'created', appointmentId: 'apt-1' },
                { rowNumber: 3, status: 'created', appointmentId: 'apt-2' },
              ],
            },
          },
        });
      });

      const { result } = renderHook(() => useAppointmentImport(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.commit('import-123', { skipInvalidRows: false });
      });
      await act(async () => {});

      await act(async () => {
        for (let i = 0; i < 29; i += 1) {
          await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
        }
      });
      await act(async () => {});

      expect(mockShowError).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      });
      await act(async () => {});

      expect(result.current.importStatus?.status).toBe('COMPLETED');
      expect(mockShowError).not.toHaveBeenCalled();
    });
  });
});
