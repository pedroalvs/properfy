import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { useInspectorReliability } from './useInspectorReliability';
import { detailEnvelope, anaDetailFixture, INSPECTOR_IDS } from '../__fixtures__/reliability';

vi.mock('@/services/api', () => ({ api: { GET: vi.fn() } }));
import { api } from '@/services/api';
const mockGet = api.GET as unknown as Mock;

beforeEach(() => mockGet.mockReset());

describe('useInspectorReliability', () => {
  it('is disabled (no request) when no id is given', () => {
    renderHook(() => useInspectorReliability(null), { wrapper: createQueryWrapper() });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches one inspector, keyed on ["reliability","inspector",id], with the path param', async () => {
    mockGet.mockResolvedValue({ data: detailEnvelope(), error: undefined });
    const { result } = renderHook(() => useInspectorReliability(INSPECTOR_IDS.ana), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.inspector).not.toBeNull());
    expect(mockGet).toHaveBeenCalledWith('/v1/dashboard/inspector-performance/{inspectorId}', {
      params: { path: { inspectorId: INSPECTOR_IDS.ana } },
    });
    expect(result.current.inspector).toEqual(anaDetailFixture);
    expect(result.current.isNotFound).toBe(false);
  });

  it('flags a 404 as not-found', async () => {
    mockGet.mockResolvedValue({
      data: undefined,
      error: { code: 'INSPECTOR_NOT_FOUND', message: 'nope' },
      response: { status: 404 } as Response,
    });
    const { result } = renderHook(() => useInspectorReliability(INSPECTOR_IDS.ana), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isNotFound).toBe(true);
  });

  it('a non-404 error is not treated as not-found', async () => {
    mockGet.mockResolvedValue({
      data: undefined,
      error: { code: 'INTERNAL', message: 'boom' },
      response: { status: 500 } as Response,
    });
    const { result } = renderHook(() => useInspectorReliability(INSPECTOR_IDS.ana), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isNotFound).toBe(false);
  });
});
