import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

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
import { useTemplateList } from './useTemplateList';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_TEMPLATES = [
  {
    id: 'tpl-01',
    tenantId: null,
    templateCode: 'INSPECTION_NOTICE',
    channel: 'EMAIL',
    subject: 'Inspection Scheduled',
    bodyText: 'Hello {{tenant_name}}, your inspection is on {{scheduled_date}}.',
    isActive: true,
    variables: ['tenant_name', 'scheduled_date'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'tpl-02',
    tenantId: 'tenant-1',
    templateCode: 'REMINDER_7D',
    channel: 'SMS',
    subject: '',
    bodyText: 'Reminder: inspection at {{property_address}} on {{scheduled_date}}.',
    isActive: false,
    variablesJson: ['property_address', 'scheduled_date'],
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
  },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    data: {
      data: MOCK_TEMPLATES,
      pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
    },
  });
});

describe('useTemplateList', () => {
  it('returns loading state initially', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateList(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });

  it('returns data after fetch resolves', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data[0]?.code).toBe('INSPECTION_NOTICE');
  });

  it('returns error state on API failure', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Network error' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });

  it('exposes filters and setFilters', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateList(), { wrapper });

    expect(result.current.filters).toEqual({ templateCode: '', channel: '', includeDefaults: 'true' });
    expect(typeof result.current.setFilters).toBe('function');
  });

  it('sends only supported query params', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setFilters({
        templateCode: 'INSPECTION_NOTICE',
        channel: 'EMAIL',
        includeDefaults: 'false',
      });
    });

    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith(
        '/v1/notification-templates',
        expect.objectContaining({
          params: {
            query: {
              templateCode: 'INSPECTION_NOTICE',
              channel: 'EMAIL',
              includeDefaults: 'false',
            },
          },
        }),
      );
    });
  });
});
