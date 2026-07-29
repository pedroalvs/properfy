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
    rentalTenantName: 'Acme Realty',
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
    expect(result.current.data[0]?.rentalTenantName).toBeNull();
    expect(result.current.data[1]?.rentalTenantName).toBe('Acme Realty');
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

    expect(result.current.filters).toEqual({ templateCode: '', channel: '', includeDefaults: 'true', tenantId: '' });
    expect(typeof result.current.setFilters).toBe('function');
  });

  it('sends only supported query params and omits an empty tenantId', async () => {
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
        tenantId: '',
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

  it('sends tenantId when an agency is selected', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setFilters({
        templateCode: '',
        channel: '',
        includeDefaults: 'true',
        tenantId: 'tenant-1',
      });
    });

    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith(
        '/v1/notification-templates',
        expect.objectContaining({
          params: {
            query: expect.objectContaining({ tenantId: 'tenant-1' }),
          },
        }),
      );
    });
  });

  // The list endpoint flattens a NULL body_html to '' (see
  // list-notification-templates.use-case.ts). Because '' is NOT nullish, the old
  // `raw.bodyHtml ?? raw.bodyText` never reached bodyText, so every SMS template
  // rendered with an empty Body while the seeded copy still went out over the
  // wire. The fixtures above omit bodyHtml entirely, which lets `??` fall through
  // — that mismatch with the real payload is why the bug shipped. These use the
  // shape the API actually returns.
  describe('channel-aware body mapping', () => {
    function mockRows(rows: Record<string, unknown>[]) {
      mockGet.mockResolvedValue({
        data: { data: rows, pagination: { page: 1, pageSize: 10, total: rows.length, totalPages: 1 } },
      });
    }

    const SMS_COPY = 'Properfy: Hi {{rentalTenantName}}, inspection on {{scheduledDate}}.';

    it('reads an SMS body from bodyText when the API sends bodyHtml as an empty string', async () => {
      mockRows([
        {
          id: 'tpl-sms',
          tenantId: null,
          templateCode: 'INSPECTION_NOTICE_SMS',
          channel: 'SMS',
          subject: null,
          bodyHtml: '',
          bodyText: SMS_COPY,
          isActive: true,
          variables: [],
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ]);

      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useTemplateList(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.data[0]?.body).toBe(SMS_COPY);
    });

    it('prefers bodyText for SMS even when a legacy row still carries bodyHtml', async () => {
      mockRows([
        {
          id: 'tpl-sms-legacy',
          tenantId: 'tenant-1',
          templateCode: 'INSPECTION_NOTICE_SMS',
          channel: 'SMS',
          subject: null,
          bodyHtml: '<p>stale html copy</p>',
          bodyText: SMS_COPY,
          isActive: true,
          variables: [],
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ]);

      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useTemplateList(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.data[0]?.body).toBe(SMS_COPY);
    });

    it('reads an EMAIL body from bodyHtml, not the derived plain-text alternative', async () => {
      mockRows([
        {
          id: 'tpl-email',
          tenantId: null,
          templateCode: 'INSPECTION_NOTICE',
          channel: 'EMAIL',
          subject: 'Inspection Scheduled',
          bodyHtml: '<p>Hello {{rentalTenantName}}</p>',
          bodyText: 'Hello {{rentalTenantName}}',
          isActive: true,
          variables: [],
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ]);

      const wrapper = createQueryWrapper();
      const { result } = renderHook(() => useTemplateList(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.data[0]?.body).toBe('<p>Hello {{rentalTenantName}}</p>');
    });
  });

  it('keeps a stable data array reference across re-renders with unchanged data', async () => {
    // Regression guard for the PR #961 bug class: an unstable reference here
    // can feed a consumer effect (e.g. deps [isEditMode, entity]) whose
    // setState calls re-render into an infinite loop that starves router
    // updates — URL changes but the screen never swaps.
    const wrapper = createQueryWrapper();
    const { result, rerender } = renderHook(() => useTemplateList(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const first = result.current.data;
    expect(first).not.toBeNull();
    rerender();
    expect(result.current.data).toBe(first);
  });
});
