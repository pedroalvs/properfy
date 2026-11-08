import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { useProgramPeriods } from './useProgramPeriods';

vi.mock('@/services/api', () => ({ api: { GET: vi.fn() } }));
import { api } from '@/services/api';
const mockGet = api.GET as unknown as Mock;

beforeEach(() => mockGet.mockReset());

const periods = [
  { start: '2026-11-02', end: '2026-11-08', status: 'IN_PROGRESS' as const },
  { start: '2026-10-26', end: '2026-11-01', status: 'CLOSED' as const },
];

describe('useProgramPeriods', () => {
  it('fetches periods with the query and unwraps data.data', async () => {
    mockGet.mockResolvedValue({ data: { data: periods }, error: undefined });
    const { result } = renderHook(
      () => useProgramPeriods({ periodType: 'WEEKLY', direction: 'past', count: 12 }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => expect(result.current.periods.length).toBe(2));
    expect(mockGet).toHaveBeenCalledWith('/v1/inspector-program/periods', {
      params: { query: { periodType: 'WEEKLY', direction: 'past', count: 12 } },
    });
    expect(result.current.periods).toEqual(periods);
    expect(result.current.isError).toBe(false);
  });

  it('is disabled when enabled is false', () => {
    const { result } = renderHook(
      () => useProgramPeriods({ periodType: 'WEEKLY', direction: 'upcoming', count: 13, enabled: false }),
      { wrapper: createQueryWrapper() },
    );
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.periods).toEqual([]);
  });

  it('reports an error state on failure', async () => {
    mockGet.mockResolvedValue({ data: undefined, error: { code: 'INTERNAL', message: 'boom' }, response: { status: 500 } });
    const { result } = renderHook(
      () => useProgramPeriods({ periodType: 'MONTHLY', direction: 'past', count: 12 }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.periods).toEqual([]);
  });
});
