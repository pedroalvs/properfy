import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { act } from '@testing-library/react';
import {
  useAppointmentBoard,
  BOARD_COLUMN_STATUSES,
  BOARD_COLUMN_PAGE_SIZE,
  BOARD_COLUMN_MAX_LOADED,
} from './useAppointmentBoard';

const usePaginatedQueryMock = vi.fn();

vi.mock('@/hooks/useApiQuery', () => ({
  usePaginatedQuery: (...args: unknown[]) => usePaginatedQueryMock(...args),
}));

function wrapper(initialEntries: string[]) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );
}

/** Every call's `params` argument, keyed by the column status it carries. */
function paramsByStatus() {
  const result: Record<string, any> = {};
  for (const call of usePaginatedQueryMock.mock.calls) {
    const params = call[2] as { status?: string };
    if (params?.status) result[params.status] = params;
  }
  return result;
}

/** Options argument (4th) keyed by column status. */
function optionsByStatus() {
  const result: Record<string, any> = {};
  for (const call of usePaginatedQueryMock.mock.calls) {
    const params = call[2] as { status?: string };
    if (params?.status) result[params.status] = call[3];
  }
  return result;
}

describe('useAppointmentBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePaginatedQueryMock.mockReturnValue({
      data: { data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('issues one query per board column, each pinned to its own status', () => {
    renderHook(() => useAppointmentBoard(), { wrapper: wrapper(['/appointments/board']) });

    const params = paramsByStatus();
    expect(Object.keys(params).sort()).toEqual([...BOARD_COLUMN_STATUSES].sort());
  });

  it('never requests DRAFT — draft appointments belong to the list view only', () => {
    renderHook(() => useAppointmentBoard(), { wrapper: wrapper(['/appointments/board']) });

    expect(paramsByStatus()).not.toHaveProperty('DRAFT');
  });

  it('does not send showCancelled — an explicit status filter already wins server-side', () => {
    renderHook(() => useAppointmentBoard(), {
      wrapper: wrapper(['/appointments/board?showCancelled=true']),
    });

    for (const params of Object.values(paramsByStatus())) {
      expect(params.showCancelled).toBeUndefined();
    }
  });

  it('forwards the shared URL filters to every column', () => {
    renderHook(() => useAppointmentBoard(), {
      wrapper: wrapper(['/appointments/board?search=king&branchId=branch-1&startDate=2026-08-01']),
    });

    for (const params of Object.values(paramsByStatus())) {
      expect(params.search).toBe('king');
      expect(params.branchId).toBe('branch-1');
      expect(params.fromDate).toBe('2026-08-01');
    }
  });

  it('starts each column at the standard page size', () => {
    renderHook(() => useAppointmentBoard(), { wrapper: wrapper(['/appointments/board']) });

    for (const params of Object.values(paramsByStatus())) {
      expect(params.page).toBe(1);
      expect(params.pageSize).toBe(BOARD_COLUMN_PAGE_SIZE);
    }
  });

  describe('overdueOnly', () => {
    it('only queries the two statuses that can be overdue', () => {
      // Server-side `overdueOnly` REPLACES the status filter with
      // (SCHEDULED, AWAITING_INSPECTOR). Querying the other columns would fill
      // them with scheduled work that does not belong there.
      renderHook(() => useAppointmentBoard(), {
        wrapper: wrapper(['/appointments/board?overdueOnly=true']),
      });

      const options = optionsByStatus();
      expect(options['AWAITING_INSPECTOR'].enabled).toBe(true);
      expect(options['SCHEDULED'].enabled).toBe(true);
      expect(options['DONE'].enabled).toBe(false);
      expect(options['CANCELLED'].enabled).toBe(false);
      expect(options['REJECTED'].enabled).toBe(false);
    });

    it('reports zero and no loading for the skipped columns', () => {
      const { result } = renderHook(() => useAppointmentBoard(), {
        wrapper: wrapper(['/appointments/board?overdueOnly=true']),
      });

      const done = result.current.columns.find((c) => c.status === 'DONE')!;
      expect(done.total).toBe(0);
      expect(done.items).toEqual([]);
      expect(done.isLoading).toBe(false);
    });

    it('queries every column when the filter is off', () => {
      renderHook(() => useAppointmentBoard(), { wrapper: wrapper(['/appointments/board']) });

      for (const options of Object.values(optionsByStatus())) {
        expect(options.enabled).toBe(true);
      }
    });
  });

  it('exposes the per-status total from the server, not the loaded count', () => {
    usePaginatedQueryMock.mockReturnValue({
      data: {
        data: [{ id: 'a1' }, { id: 'a2' }],
        pagination: { page: 1, pageSize: 20, total: 37, totalPages: 2 },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useAppointmentBoard(), {
      wrapper: wrapper(['/appointments/board']),
    });

    const column = result.current.columns[0]!;
    expect(column.total).toBe(37);
    expect(column.items).toHaveLength(2);
    expect(column.hasMore).toBe(true);
  });

  it('aggregates loaded cards across columns for cross-column bulk selection', () => {
    usePaginatedQueryMock.mockReturnValue({
      data: {
        data: [{ id: 'a1' }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useAppointmentBoard(), {
      wrapper: wrapper(['/appointments/board']),
    });

    expect(result.current.allItems).toHaveLength(BOARD_COLUMN_STATUSES.length);
  });

  describe('load more', () => {
    /** Mock a column that always has far more rows than are loaded. */
    function mockLargeColumn() {
      usePaginatedQueryMock.mockImplementation((_key, _path, params: any) => ({
        data: {
          data: Array.from({ length: params.pageSize }, (_, i) => ({ id: `a${i}` })),
          pagination: { page: 1, pageSize: params.pageSize, total: 500, totalPages: 25 },
        },
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      }));
    }

    it('actually grows the requested pageSize by one step', () => {
      // Without this, a no-op loadMore would still pass every other test.
      mockLargeColumn();
      const { result } = renderHook(() => useAppointmentBoard(), {
        wrapper: wrapper(['/appointments/board']),
      });

      act(() => result.current.columns[0]!.loadMore());

      expect(paramsByStatus()['AWAITING_INSPECTOR'].pageSize).toBe(BOARD_COLUMN_PAGE_SIZE * 2);
    });

    it('grows only the column that was asked to load more', () => {
      mockLargeColumn();
      const { result } = renderHook(() => useAppointmentBoard(), {
        wrapper: wrapper(['/appointments/board']),
      });

      act(() => result.current.columns[0]!.loadMore());

      expect(paramsByStatus()['SCHEDULED'].pageSize).toBe(BOARD_COLUMN_PAGE_SIZE);
    });

    it('never requests a pageSize above the server cap', () => {
      // paginationSchema caps pageSize at 100 — exceeding it is a 400 that would
      // wipe an already-populated column and leave Retry looping on it.
      mockLargeColumn();
      const { result } = renderHook(() => useAppointmentBoard(), {
        wrapper: wrapper(['/appointments/board']),
      });

      for (let i = 0; i < 12; i += 1) {
        act(() => result.current.columns[0]!.loadMore());
      }

      const requested = usePaginatedQueryMock.mock.calls
        .map((call) => (call[2] as { pageSize: number }).pageSize)
        .filter((size) => size !== undefined);
      expect(Math.max(...requested)).toBe(BOARD_COLUMN_MAX_LOADED);
    });

    it('stops offering load more at the cap and flags the truncation instead', () => {
      mockLargeColumn();
      const { result } = renderHook(() => useAppointmentBoard(), {
        wrapper: wrapper(['/appointments/board']),
      });

      expect(result.current.columns[0]!.hasMore).toBe(true);
      expect(result.current.columns[0]!.atLoadLimit).toBe(false);

      for (let i = 0; i < 12; i += 1) {
        act(() => result.current.columns[0]!.loadMore());
      }

      expect(result.current.columns[0]!.hasMore).toBe(false);
      expect(result.current.columns[0]!.atLoadLimit).toBe(true);
    });

    it('reports neither hasMore nor a limit when everything is loaded', () => {
      usePaginatedQueryMock.mockReturnValue({
        data: {
          data: [{ id: 'a1' }, { id: 'a2' }],
          pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
        },
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
      const { result } = renderHook(() => useAppointmentBoard(), {
        wrapper: wrapper(['/appointments/board']),
      });

      expect(result.current.columns[0]!.hasMore).toBe(false);
      expect(result.current.columns[0]!.atLoadLimit).toBe(false);
    });
  });

  it('surfaces the API error message on the failing column', () => {
    usePaginatedQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: 'Upstream exploded' },
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useAppointmentBoard(), {
      wrapper: wrapper(['/appointments/board']),
    });

    expect(result.current.columns[0]!.isError).toBe(true);
    expect(result.current.columns[0]!.errorMessage).toBe('Upstream exploded');
  });
});
