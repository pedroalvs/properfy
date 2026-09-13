import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

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
import { useContactTimeline } from './useContactTimeline';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

function auditLogsCalls() {
  return mockGet.mock.calls
    .filter(([p]) => String(p).startsWith('/v1/audit-logs'))
    .map(([, opts]) => (opts as { params?: { query?: Record<string, unknown> } })?.params?.query ?? {});
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    data: { data: [], pagination: { page: 1, pageSize: 20, total: 100, totalPages: 5 } },
  });
});

describe('useContactTimeline', () => {
  it('resets page to 1 when the contactId changes (WI-7 #546)', async () => {
    const wrapper = createQueryWrapper();
    const { result, rerender } = renderHook(
      ({ id }) => useContactTimeline(id, { enabled: true }),
      { wrapper, initialProps: { id: 'contact-a' } },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Advance to page 3 on contact A.
    act(() => result.current.pagination.onChange(3, 20));
    await waitFor(() =>
      expect(auditLogsCalls().some((q) => q.entityId === "contact-a" && Number(q.page) === 3)).toBe(true),
    );

    // Switch to contact B — the next query must start at page 1, not 3.
    rerender({ id: 'contact-b' });
    await waitFor(() =>
      expect(auditLogsCalls().some((q) => q.entityId === 'contact-b')).toBe(true),
    );

    const bCalls = auditLogsCalls().filter((q) => q.entityId === 'contact-b');
    expect(bCalls.every((q) => Number(q.page) === 1)).toBe(true);
    expect(result.current.pagination.page).toBe(1);
  });

  it('keeps the user-chosen pageSize when the contact changes', async () => {
    const wrapper = createQueryWrapper();
    const { result, rerender } = renderHook(
      ({ id }) => useContactTimeline(id, { enabled: true }),
      { wrapper, initialProps: { id: 'contact-a' } },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.pagination.onChange(2, 50));
    await waitFor(() =>
      expect(auditLogsCalls().some((q) => q.entityId === "contact-a" && Number(q.pageSize) === 50)).toBe(true),
    );

    rerender({ id: 'contact-b' });
    await waitFor(() =>
      expect(auditLogsCalls().some((q) => q.entityId === 'contact-b')).toBe(true),
    );

    const bCalls = auditLogsCalls().filter((q) => q.entityId === 'contact-b');
    expect(bCalls.every((q) => Number(q.pageSize) === 50 && Number(q.page) === 1)).toBe(true);
  });
});
