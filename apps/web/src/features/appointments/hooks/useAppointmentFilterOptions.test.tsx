import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));

vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

const mockHasRole = vi.fn();
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasRole: mockHasRole, canPerform: vi.fn(), role: 'AM' }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'AM', tenantId: 't-1' }, isAuthenticated: true }),
}));

import { api } from '@/services/api';
import {
  useAgencyFilterOptions,
  useInspectorFilterOptions,
  useBranchFilterOptions,
} from './useAppointmentFilterOptions';
import type { Appointment } from '../types';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

function page(data: unknown[], totalPages = 1) {
  return Promise.resolve({
    data: { data, pagination: { page: 1, pageSize: 100, total: data.length, totalPages } },
  });
}

/**
 * One client per mount, created outside the component body — building it inside
 * would hand every re-render a fresh cache and make the stability assertions
 * below measure the harness instead of the hooks.
 */
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  mockGet.mockReset();
  mockHasRole.mockReturnValue(true);
  mockGet.mockImplementation((path: string) => {
    if (path === '/v1/tenants') return page([{ id: 'tenant-1', name: 'Acme Realty' }]);
    if (path === '/v1/inspectors') return page([{ id: 'insp-1', name: 'Carlos Inspector' }]);
    if (path === '/v1/branches') return page([{ id: 'branch-1', name: 'Downtown Branch' }]);
    return page([]);
  });
});

/**
 * apps/web/CLAUDE.md §13.11: a hook deriving values from a query payload must
 * return a referentially stable array. An unmemoized derived return once froze
 * production — a consumer's `useEffect(..., [value])` looped forever and starved
 * React Router. These hooks feed exactly such consumers, so identity across a
 * re-render with unchanged data is a contract, not an optimisation.
 */
describe('filter option hooks — referential stability (§13.11)', () => {
  it('useAgencyFilterOptions returns the same array across re-renders', async () => {
    const { result, rerender } = renderHook(() => useAgencyFilterOptions(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.length).toBe(2));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('useInspectorFilterOptions returns the same array across re-renders', async () => {
    const { result, rerender } = renderHook(() => useInspectorFilterOptions(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.length).toBe(2));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('useBranchFilterOptions is stable on both the API and the derived branch', async () => {
    const rows: Appointment[] = [];

    // Derived branch (no agency picked): stable across re-renders.
    const derived = renderHook(({ tenantId }) => useBranchFilterOptions(tenantId, rows), {
      wrapper: makeWrapper(),
      initialProps: { tenantId: '' },
    });
    const derivedFirst = derived.result.current;
    derived.rerender({ tenantId: '' });
    expect(derived.result.current).toBe(derivedFirst);

    // API branch (agency picked): stable once the fetch settles.
    const scoped = renderHook(({ tenantId }) => useBranchFilterOptions(tenantId, rows), {
      wrapper: makeWrapper(),
      initialProps: { tenantId: 'tenant-1' },
    });
    await waitFor(() => expect(scoped.result.current.length).toBe(2));
    const scopedFirst = scoped.result.current;
    scoped.rerender({ tenantId: 'tenant-1' });
    expect(scoped.result.current).toBe(scopedFirst);
  });
});

describe('filter option hooks — role gating', () => {
  it('never requests /v1/tenants for a client role', async () => {
    mockHasRole.mockReturnValue(false);
    const { result } = renderHook(() => useAgencyFilterOptions(), { wrapper: makeWrapper() });

    // A permitted role settles into [All]; this one must stay empty. Waiting on
    // that transition gives a wrongly-enabled query time to fire and be caught.
    await waitFor(() => expect(result.current).toEqual([]));
    expect(mockGet).not.toHaveBeenCalled();
  });

  // Empty must mean "not permitted" only. A permitted role whose catalogue is
  // empty (or still loading, or failed) still needs the control so an applied
  // filter stays visible and clearable.
  it('still offers the All option to a global role with no agencies', async () => {
    mockGet.mockImplementation(() => page([]));
    const { result } = renderHook(() => useAgencyFilterOptions(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current).toEqual([{ label: 'All', value: '' }]));
  });

  it('pages past the first 100 inspectors', async () => {
    const first = Array.from({ length: 100 }, (_, i) => ({ id: `i-${i}`, name: `Inspector ${i}` }));
    mockGet.mockImplementation((_path: string, opts: { params: { query: { page?: string } } }) =>
      opts.params.query.page === '1'
        ? page(first, 2)
        : page([{ id: 'i-100', name: 'Inspector 100' }], 2),
    );

    const { result } = renderHook(() => useInspectorFilterOptions(), { wrapper: makeWrapper() });

    // 100 + 1 + the All option: the 101st entity must be reachable, since the
    // backend caps pageSize at 100 and its appointments still show its name.
    await waitFor(() => expect(result.current).toHaveLength(102));
    expect(result.current.at(-1)).toEqual({ value: 'i-100', label: 'Inspector 100' });
  });
});
