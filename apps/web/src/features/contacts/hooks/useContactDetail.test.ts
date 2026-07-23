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
import { useContactDetail } from './useContactDetail';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_CONTACT = {
  id: 'ct-01',
  displayName: 'Jane Tenant',
  contactType: 'RENTAL_TENANT',
  isActive: true,
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: MOCK_CONTACT } });
});

describe('useContactDetail', () => {
  it('returns contact by id', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useContactDetail('ct-01'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.contact?.displayName).toBe('Jane Tenant');
  });

  it('returns null when id is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useContactDetail(null), { wrapper });

    expect(result.current.contact).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps a stable contact reference across re-renders with unchanged data', async () => {
    // Regression guard for the PR #961 bug class: an unstable reference here
    // feeds ContactFormDrawer's populate effect (deps [isEditMode, contact]),
    // whose setState calls would re-render into an infinite loop that starves
    // router updates — URL changes but the screen never swaps.
    const wrapper = createQueryWrapper();
    const { result, rerender } = renderHook(() => useContactDetail('ct-01'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const first = result.current.contact;
    expect(first).not.toBeNull();
    rerender();
    expect(result.current.contact).toBe(first);
  });
});
