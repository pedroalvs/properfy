import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

import { apiClient } from '@/lib/api-client';
import { useAppointmentDetail } from './useAppointmentDetail';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;

const MOCK_APPOINTMENT = {
  id: 'apt-01',
  code: 'VST-001',
  status: 'SCHEDULED',
  contactName: 'João',
  address: 'Rua das Flores, 123',
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: MOCK_APPOINTMENT });
});

describe('useAppointmentDetail', () => {
  it('returns appointment by id', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentDetail('apt-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.appointment).not.toBeNull();
    expect(result.current.appointment?.code).toBe('VST-001');
  });

  it('returns null when id is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentDetail(null), { wrapper });

    expect(result.current.appointment).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('shows loading state initially', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentDetail('apt-01'), { wrapper });

    expect(result.current.isLoading).toBe(true);
  });

  it('calls API with correct path', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentDetail('apt-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/appointments/apt-01');
  });

  it('handles API error gracefully', async () => {
    mockGet.mockRejectedValueOnce(new Error('Not found'));
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentDetail('apt-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.appointment).toBeNull();
  });
});
