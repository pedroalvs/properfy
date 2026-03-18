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
import { useTemplateList } from './useTemplateList';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_TEMPLATES = [
  {
    id: 'tpl-01',
    code: 'INSPECTION_NOTICE',
    channel: 'EMAIL',
    subject: 'Inspection Scheduled',
    body: 'Hello {{tenant_name}}, your inspection is on {{scheduled_date}}.',
    active: true,
    requiredVariables: ['tenant_name', 'scheduled_date'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'tpl-02',
    code: 'REMINDER_7D',
    channel: 'SMS',
    subject: '',
    body: 'Reminder: inspection at {{property_address}} on {{scheduled_date}}.',
    active: false,
    requiredVariables: ['property_address', 'scheduled_date'],
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

    expect(result.current.filters).toEqual({ search: '', channel: '', active: '' });
    expect(typeof result.current.setFilters).toBe('function');
  });

  it('pagination total reflects API response', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pagination.total).toBe(2);
  });
});
