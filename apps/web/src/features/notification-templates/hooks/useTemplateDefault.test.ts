import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

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
import { useTemplateDefault } from './useTemplateDefault';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const FACTORY_SMS = {
  subject: null,
  body: 'Properfy: Hi {{rentalTenantName}}, inspection on {{scheduledDate}}.',
  source: 'FACTORY' as const,
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: FACTORY_SMS }, error: undefined });
});

describe('useTemplateDefault', () => {
  it('requests the default endpoint for the given code and channel', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateDefault(), { wrapper });

    await act(async () => {
      await result.current.fetchDefault('INSPECTION_NOTICE_SMS', 'SMS', null);
    });

    expect(mockGet).toHaveBeenCalledWith(
      '/v1/notification-templates/{templateCode}/{channel}/default',
      { params: { path: { templateCode: 'INSPECTION_NOTICE_SMS', channel: 'SMS' }, query: {} } },
    );
  });

  it('sends tenantId when resetting an agency override', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateDefault(), { wrapper });

    await act(async () => {
      await result.current.fetchDefault('INSPECTION_NOTICE', 'EMAIL', 'tenant-1');
    });

    expect(mockGet).toHaveBeenCalledWith(
      '/v1/notification-templates/{templateCode}/{channel}/default',
      { params: { path: { templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL' }, query: { tenantId: 'tenant-1' } } },
    );
  });

  it('returns the default payload', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateDefault(), { wrapper });

    let payload: unknown;
    await act(async () => {
      payload = await result.current.fetchDefault('INSPECTION_NOTICE_SMS', 'SMS', null);
    });

    expect(payload).toEqual(FACTORY_SMS);
  });

  it('returns null when the request fails, so the caller keeps the current form', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { error: { message: 'boom' } } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateDefault(), { wrapper });

    let payload: unknown = 'unset';
    await act(async () => {
      payload = await result.current.fetchDefault('INSPECTION_NOTICE', 'EMAIL', null);
    });

    expect(payload).toBeNull();
  });

  it('returns null when the request throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'));
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateDefault(), { wrapper });

    let payload: unknown = 'unset';
    await act(async () => {
      payload = await result.current.fetchDefault('INSPECTION_NOTICE', 'EMAIL', null);
    });

    expect(payload).toBeNull();
  });
});
