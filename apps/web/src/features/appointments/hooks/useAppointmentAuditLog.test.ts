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
import { useAppointmentAuditLog } from './useAppointmentAuditLog';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_ENTRIES = [
  {
    id: 'log-01',
    tenantId: 'ten-1',
    actorType: 'USER',
    actorId: 'usr-1',
    entityType: 'APPOINTMENT',
    entityId: 'apt-01',
    action: 'appointment.status_transition',
    reason: null,
    beforeJson: { status: 'DRAFT' },
    afterJson: { status: 'SCHEDULED' },
    requestId: 'req-1',
    ipAddress: '127.0.0.1',
    metadataJson: null,
    createdAt: '2026-03-10T10:00:00Z',
  },
  {
    id: 'log-02',
    tenantId: 'ten-1',
    actorType: 'USER',
    actorId: 'usr-2',
    entityType: 'APPOINTMENT',
    entityId: 'apt-01',
    action: 'appointment.status_transition',
    reason: 'No longer needed',
    beforeJson: { status: 'SCHEDULED' },
    afterJson: { status: 'CANCELLED' },
    requestId: 'req-2',
    ipAddress: '127.0.0.1',
    metadataJson: null,
    createdAt: '2026-03-11T14:00:00Z',
  },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    data: { data: MOCK_ENTRIES, pagination: { page: 1, pageSize: 50, total: 2, totalPages: 1 } },
  });
});

describe('useAppointmentAuditLog', () => {
  it('returns audit log entries for an appointment', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentAuditLog('apt-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries[0]!.action).toBe('appointment.status_transition');
  });

  it('returns empty entries when id is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentAuditLog(null), { wrapper });

    expect(result.current.entries).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('shows loading state initially', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentAuditLog('apt-01'), { wrapper });

    expect(result.current.isLoading).toBe(true);
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Server error' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentAuditLog('apt-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.entries).toEqual([]);
  });
});
