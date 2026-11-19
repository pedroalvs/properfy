import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
const showError = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showError, showSuccess: vi.fn(), showInfo: vi.fn() }),
}));

import { api } from '@/services/api';
import { useMarkIssueSeen } from './useMarkIssueSeen';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPost.mockReset();
  showError.mockReset();
});

describe('useMarkIssueSeen', () => {
  it('posts to the seen route', async () => {
    mockPost.mockResolvedValue({
      data: { data: { seen: true, alreadySeen: false, seenAt: '2026-11-07T00:00:00Z', seenByUserId: 'me' } },
      error: undefined,
      response: { status: 200 },
    });
    const { result } = renderHook(() => useMarkIssueSeen(), { wrapper: createQueryWrapper() });
    await act(async () => {
      result.current.markSeen('issue-1');
    });
    expect(mockPost).toHaveBeenCalledWith('/v1/property-issues/{id}/seen', {
      params: { path: { id: 'issue-1' } },
    });
  });

  it('is idempotent — a second call does not error (CAS alreadySeen)', async () => {
    mockPost.mockResolvedValue({
      data: { data: { seen: false, alreadySeen: true, seenAt: '2026-11-07T00:00:00Z', seenByUserId: 'someone' } },
      error: undefined,
      response: { status: 200 },
    });
    const { result } = renderHook(() => useMarkIssueSeen(), { wrapper: createQueryWrapper() });
    await act(async () => {
      result.current.markSeen('issue-1');
    });
    await act(async () => {
      result.current.markSeen('issue-1');
    });
    expect(showError).not.toHaveBeenCalled();
  });

  it('surfaces an error', async () => {
    mockPost.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'NOT_FOUND', message: 'Gone' } },
      response: { status: 404 },
    });
    const { result } = renderHook(() => useMarkIssueSeen(), { wrapper: createQueryWrapper() });
    await act(async () => {
      result.current.markSeen('issue-1');
    });
    await vi.waitFor(() => expect(showError).toHaveBeenCalled());
  });
});
