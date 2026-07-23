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
import { useServiceRegionDetail } from './useServiceRegionDetail';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_REGION = {
  id: 'sr-01',
  name: 'Inner West',
  status: 'ACTIVE',
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: MOCK_REGION } });
});

describe('useServiceRegionDetail', () => {
  it('returns service region by id', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceRegionDetail('sr-01'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.serviceRegion?.name).toBe('Inner West');
  });

  it('returns null when id is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceRegionDetail(null), { wrapper });

    expect(result.current.serviceRegion).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps a stable serviceRegion reference across re-renders with unchanged data', async () => {
    // Regression guard for the PR #961 bug class: an unstable reference here
    // feeds ServiceRegionFormDrawer's populate effect (deps
    // [isEditMode, serviceRegion]), whose setState calls would re-render into
    // an infinite loop that starves router updates.
    const wrapper = createQueryWrapper();
    const { result, rerender } = renderHook(() => useServiceRegionDetail('sr-01'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const first = result.current.serviceRegion;
    expect(first).not.toBeNull();
    rerender();
    expect(result.current.serviceRegion).toBe(first);
  });
});
