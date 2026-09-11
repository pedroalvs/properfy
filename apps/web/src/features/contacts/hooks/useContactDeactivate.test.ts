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
import { useContactDeactivate } from './useContactDeactivate';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;
const mockPatch = api.PATCH as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPost.mockReset();
  mockPatch.mockReset();
});

describe('useContactDeactivate', () => {
  it('resolves (never rejects) to a failure result when deactivate throws', async () => {
    // WI-5 (#202): a rejected api.POST must not escape as an unhandled
    // rejection — it becomes a DeactivateResult and isPending returns to false.
    mockPost.mockRejectedValue(new TypeError('network down'));
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useContactDeactivate(), { wrapper });

    let outcome: Awaited<ReturnType<typeof result.current.deactivate>> | undefined;
    await act(async () => {
      outcome = await result.current.deactivate('c-1');
    });

    expect(outcome?.success).toBe(false);
    expect(outcome?.errorCode).toBeTruthy();
    expect(outcome?.errorMessage).toBeTruthy();
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it('resolves (never rejects) to a failure result when reactivate throws', async () => {
    mockPatch.mockRejectedValue(new TypeError('network down'));
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useContactDeactivate(), { wrapper });

    let outcome: Awaited<ReturnType<typeof result.current.reactivate>> | undefined;
    await act(async () => {
      outcome = await result.current.reactivate('c-1');
    });

    expect(outcome?.success).toBe(false);
    expect(outcome?.errorMessage).toBeTruthy();
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it('still returns a failure result for the resolved {error} envelope shape', async () => {
    mockPost.mockResolvedValue({ error: { error: { code: 'CONTACT_NOT_FOUND', message: 'Gone' } } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useContactDeactivate(), { wrapper });

    let outcome: Awaited<ReturnType<typeof result.current.deactivate>> | undefined;
    await act(async () => {
      outcome = await result.current.deactivate('c-1');
    });

    expect(outcome?.success).toBe(false);
    expect(outcome?.errorCode).toBe('CONTACT_NOT_FOUND');
    expect(outcome?.errorMessage).toBe('Gone');
  });

  it('returns success when the call resolves without error', async () => {
    mockPost.mockResolvedValue({ data: { data: { id: 'c-1', isActive: false } } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useContactDeactivate(), { wrapper });

    let outcome: Awaited<ReturnType<typeof result.current.deactivate>> | undefined;
    await act(async () => {
      outcome = await result.current.deactivate('c-1');
    });

    expect(outcome?.success).toBe(true);
  });
});
