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
import { usePropertyAppointments } from './usePropertyAppointments';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_APPOINTMENTS = [
  { id: 'apt-01', code: 'VST-001', status: 'SCHEDULED', serviceTypeName: 'Routine', scheduledDate: '2026-04-01', timeSlotStart: '09:00', timeSlotEnd: '12:00', inspectorName: 'Diego', createdAt: '2026-03-01T10:00:00Z' },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: {
    data: MOCK_APPOINTMENTS,
    pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
  } });
});

describe('usePropertyAppointments', () => {
  it('returns data when propertyId is provided', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePropertyAppointments('prop-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(1);
  });

  it('does not fetch when propertyId is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePropertyAppointments(null), { wrapper });
    expect(result.current.data).toHaveLength(0);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Error' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePropertyAppointments('prop-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
  });
});
