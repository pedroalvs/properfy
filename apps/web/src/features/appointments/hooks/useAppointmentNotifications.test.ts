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

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

import { api } from '@/services/api';
import { useAppointmentNotifications } from './useAppointmentNotifications';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_NOTIFICATIONS = [
  {
    id: 'notif-01',
    channel: 'EMAIL',
    recipient: 'tenant@example.com',
    templateCode: 'INITIAL_NOTICE',
    status: 'SENT',
    sentAt: '2026-03-10T10:00:00Z',
    deliveredAt: '2026-03-10T10:01:00Z',
    failedAt: null,
    failureReason: null,
    retryCount: 0,
    createdAt: '2026-03-10T09:55:00Z',
  },
  {
    id: 'notif-02',
    channel: 'SMS',
    recipient: '+5511999000000',
    templateCode: 'REMINDER_T1',
    status: 'PENDING',
    sentAt: null,
    deliveredAt: null,
    failedAt: null,
    failureReason: null,
    retryCount: 1,
    createdAt: '2026-03-11T14:00:00Z',
  },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    data: { data: MOCK_NOTIFICATIONS, pagination: { page: 1, pageSize: 50, total: 2, totalPages: 1 } },
  });
});

describe('useAppointmentNotifications', () => {
  it('returns notifications for an appointment', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentNotifications('apt-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.notifications).toHaveLength(2);
    expect(result.current.notifications[0]!.channel).toBe('EMAIL');
    expect(result.current.notifications[0]!.templateCode).toBe('INITIAL_NOTICE');
  });

  it('returns empty list when id is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentNotifications(null), { wrapper });

    expect(result.current.notifications).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('shows loading state initially', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentNotifications('apt-01'), { wrapper });

    expect(result.current.isLoading).toBe(true);
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Server error' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentNotifications('apt-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.notifications).toEqual([]);
  });
});
