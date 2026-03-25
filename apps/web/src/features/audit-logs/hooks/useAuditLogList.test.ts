import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) { super(message); this.name = 'ApiError'; }
  },
}));

import { api } from '@/services/api';
import { useAuditLogList } from './useAuditLogList';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_LOGS = [
  { id: 'log-01', tenantId: 'ten-1', actorType: 'USER', actorId: 'usr-1', entityType: 'APPOINTMENT', entityId: 'apt-01', action: 'STATUS_TRANSITION', reason: 'Released to inspector', beforeJson: null, afterJson: null, requestId: 'req-1', ipAddress: '127.0.0.1', metadataJson: null, createdAt: '2026-03-17T10:00:00Z' },
  { id: 'log-02', tenantId: null, actorType: 'SYSTEM', actorId: null, entityType: 'USER', entityId: 'usr-2', action: 'CREATE', reason: null, beforeJson: null, afterJson: null, requestId: 'req-2', ipAddress: null, metadataJson: null, createdAt: '2026-03-17T09:00:00Z' },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: {
    data: MOCK_LOGS,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  } });
});

describe('useAuditLogList', () => {
  it('returns data after loading resolves', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAuditLogList(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
  });

  it('calls API with correct path', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAuditLogList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/audit-logs', { params: { query: expect.any(Object) } });
  });

  it('pagination total reflects API response', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAuditLogList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pagination.total).toBe(2);
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Network error' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAuditLogList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });

  it('sends only supported backend filters', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAuditLogList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    result.current.setFilters({
      actorId: 'usr-1',
      entityType: 'APPOINTMENT',
      entityId: 'apt-01',
      action: 'STATUS_TRANSITION',
      fromDate: '2026-03-01T00:00:00.000Z',
      toDate: '2026-03-31T23:59:59.999Z',
    });

    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith('/v1/audit-logs', {
        params: {
          query: expect.objectContaining({
            actorId: 'usr-1',
            entityType: 'APPOINTMENT',
            entityId: 'apt-01',
            action: 'STATUS_TRANSITION',
            fromDate: '2026-03-01T00:00:00.000Z',
            toDate: '2026-03-31T23:59:59.999Z',
          }),
        },
      });
    });

    const lastCall = mockGet.mock.calls.at(-1)?.[1];
    expect(lastCall?.params?.query).not.toHaveProperty('search');
    expect(lastCall?.params?.query).not.toHaveProperty('startDate');
    expect(lastCall?.params?.query).not.toHaveProperty('endDate');
  });
});
