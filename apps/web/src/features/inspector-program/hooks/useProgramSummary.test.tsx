import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { useProgramSummary } from './useProgramSummary';

vi.mock('@/services/api', () => ({ api: { GET: vi.fn() } }));
import { api } from '@/services/api';
const mockGet = api.GET as unknown as Mock;

beforeEach(() => mockGet.mockReset());

describe('useProgramSummary', () => {
  it('is disabled until a period is chosen', () => {
    const { result } = renderHook(() => useProgramSummary('WEEKLY', null), { wrapper: createQueryWrapper() });
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.summary).toBeNull();
  });

  it('fetches the summary for the chosen period', async () => {
    mockGet.mockResolvedValue({ data: { data: { periodStart: '2026-11-02', totals: { promised: 90 } } }, error: undefined });
    const { result } = renderHook(() => useProgramSummary('WEEKLY', '2026-11-02'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.summary).not.toBeNull());
    expect(mockGet).toHaveBeenCalledWith('/v1/inspector-program/summary', {
      params: { query: { periodType: 'WEEKLY', periodStart: '2026-11-02' } },
    });
  });
});
