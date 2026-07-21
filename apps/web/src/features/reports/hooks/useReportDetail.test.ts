import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

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
import { useReportDetail } from './useReportDetail';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_REPORT = {
  id: 'rpt-01',
  reportType: 'APPOINTMENTS',
  status: 'COMPLETED',
  requestedBy: { id: 'u-1', name: 'Admin Principal' },
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: MOCK_REPORT } });
});

describe('useReportDetail', () => {
  it('returns report by id', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useReportDetail('rpt-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.report?.requestedBy.name).toBe('Admin Principal');
  });

  it('returns null when id is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useReportDetail(null), { wrapper });

    expect(result.current.report).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('shows loading state initially', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useReportDetail('rpt-01'), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.report).toBeNull();
  });

  it('calls API with correct path', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useReportDetail('rpt-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/reports/rpt-01', { params: { query: undefined } });
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Not found' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useReportDetail('rpt-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.report).toBeNull();
  });
});
