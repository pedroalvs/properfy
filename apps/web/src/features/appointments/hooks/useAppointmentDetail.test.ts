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
import { useAppointmentDetail } from './useAppointmentDetail';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_APPOINTMENT = {
  id: 'apt-01',
  appointmentCode: 'INS-0042',
  status: 'SCHEDULED',
  contactName: 'João',
  address: 'Rua das Flores, 123',
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: MOCK_APPOINTMENT } });
});

describe('useAppointmentDetail', () => {
  it('returns appointment by id', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentDetail('apt-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.appointment).not.toBeNull();
    expect(result.current.appointment?.appointmentCode).toBe('INS-0042');
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

    expect(mockGet).toHaveBeenCalledWith('/v1/appointments/apt-01', { params: { query: undefined } });
  });

  it('normalizes customFieldsJson into a typed customFields array', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        data: {
          ...MOCK_APPOINTMENT,
          customFieldsJson: [
            { label: 'Gate code', value: '1234' },
            { label: 'Parking', value: 'Level 2' },
          ],
        },
      },
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentDetail('apt-01'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.appointment?.customFields).toEqual([
      { label: 'Gate code', value: '1234' },
      { label: 'Parking', value: 'Level 2' },
    ]);
  });

  it('coerces a legacy non-array customFieldsJson to an empty array', async () => {
    mockGet.mockResolvedValueOnce({
      data: { data: { ...MOCK_APPOINTMENT, customFieldsJson: { realtyDescription: 'legacy' } } },
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentDetail('apt-01'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.appointment?.customFields).toEqual([]);
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Not found' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentDetail('apt-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.appointment).toBeNull();
  });
});
