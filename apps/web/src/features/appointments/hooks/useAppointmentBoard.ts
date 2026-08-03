import { useCallback, useMemo, useState } from 'react';
import { OVERDUE_ELIGIBLE_STATUSES, type AppointmentStatus } from '@properfy/shared';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { APPOINTMENT_STATUS_MAP } from '@/lib/status-colors';
import { APPOINTMENT_FILTER_SCHEMA } from './useAppointmentList';
import type { Appointment, AppointmentFiltersState } from '../types';

/**
 * Columns of the "Service Dashboard" board, in the order defined by the client
 * scope doc §4.3. `DRAFT` is deliberately absent — draft appointments are only
 * reachable from the list view, and the board surfaces a notice saying so.
 */
export const BOARD_COLUMN_STATUSES = [
  'AWAITING_INSPECTOR',
  'SCHEDULED',
  'REJECTED',
  'CANCELLED',
  'DONE',
] as const satisfies ReadonlyArray<AppointmentStatus>;

export type BoardColumnStatus = (typeof BOARD_COLUMN_STATUSES)[number];

/**
 * `overdueOnly` is defined server-side as "status IN OVERDUE_ELIGIBLE_STATUSES AND
 * created_at older than OVERDUE_AGE_DAYS". `buildWhere` intersects it with the
 * per-column status, so a terminal column would correctly come back empty — we skip
 * those requests outright rather than pay for round-trips that can only ever return
 * nothing.
 *
 * Derived from the shared list rather than restated, so it cannot drift from the
 * server's definition. `DRAFT` is overdue-eligible server-side but is not a board
 * column, so intersecting with BOARD_COLUMN_STATUSES drops it here.
 */
const OVERDUE_BOARD_COLUMNS: ReadonlyArray<BoardColumnStatus> = BOARD_COLUMN_STATUSES.filter(
  (status): status is BoardColumnStatus =>
    (OVERDUE_ELIGIBLE_STATUSES as readonly string[]).includes(status),
);

/** Cards fetched per column initially, and added by each "Load more". */
export const BOARD_COLUMN_PAGE_SIZE = 20;

/**
 * Hard ceiling on how many cards one column can load.
 *
 * The shared `paginationSchema` caps `pageSize` at 100, so growing past it is a
 * 400 that would replace an already-populated column with an error state. Past
 * this point the user narrows the filters instead.
 */
export const BOARD_COLUMN_MAX_LOADED = 100;

export interface BoardColumn {
  status: BoardColumnStatus;
  label: string;
  /** Cards currently loaded (never more than `total`). */
  items: Appointment[];
  /** True per-status total from the server, independent of how many are loaded. */
  total: number;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  hasMore: boolean;
  /** More rows exist but the column has hit BOARD_COLUMN_MAX_LOADED. */
  atLoadLimit: boolean;
  loadMore: () => void;
  refetch: () => void;
}

export interface UseAppointmentBoardReturn {
  columns: BoardColumn[];
  /** Every loaded card across all columns — backs cross-column bulk selection. */
  allItems: Appointment[];
  filters: AppointmentFiltersState;
  setFilters: (filters: AppointmentFiltersState) => void;
  refetchAll: () => void;
}

/** Shared filter params sent by every column (each adds its own `status`). */
function buildSharedParams(filters: AppointmentFiltersState): ListParams {
  return {
    rentalTenantConfirmationStatus: filters.rentalTenantConfirmationStatus || undefined,
    tenantId: filters.tenantId || undefined,
    branchId: filters.branchId || undefined,
    inspectorId: filters.inspectorId || undefined,
    serviceTypeId: filters.serviceTypeId || undefined,
    search: filters.search || undefined,
    fromDate: filters.startDate || undefined,
    toDate: filters.endDate || undefined,
    overdueOnly: filters.overdueOnly ? 'true' : undefined,
    // `showCancelled` is intentionally omitted: the backend only applies it when
    // no explicit status filter is present, and every column always sends one.
  };
}

/**
 * One column's data. Called an unconditional, fixed number of times from
 * `useAppointmentBoard`, so the rules of hooks hold.
 */
function useBoardColumn(status: BoardColumnStatus, filters: AppointmentFiltersState): BoardColumn {
  const [pageSize, setPageSize] = useState(BOARD_COLUMN_PAGE_SIZE);

  const enabled = !filters.overdueOnly || OVERDUE_BOARD_COLUMNS.includes(status);

  const params: ListParams = {
    ...buildSharedParams(filters),
    status,
    page: 1,
    pageSize,
  };

  // Shares the ['appointments'] key prefix with the list, so every existing
  // mutation hook that invalidates ['appointments'] refreshes the board too.
  const { data, isLoading, isError, error, refetch } = usePaginatedQuery<Appointment>(
    ['appointments'],
    '/v1/appointments',
    params,
    { enabled },
  );

  const items = useMemo(() => (enabled ? (data?.data ?? []) : []), [enabled, data]);
  const total = enabled ? (data?.pagination.total ?? 0) : 0;

  const loadMore = useCallback(() => {
    setPageSize((current) => Math.min(current + BOARD_COLUMN_PAGE_SIZE, BOARD_COLUMN_MAX_LOADED));
  }, []);

  return useMemo(() => {
    const moreExist = items.length < total;
    return {
      status,
      label: APPOINTMENT_STATUS_MAP[status].label,
      items,
      total,
      isLoading: enabled && isLoading,
      isError: enabled && isError,
      errorMessage: error?.message ?? null,
      // Never offer Load more once the cap is reached — the button would issue
      // the same request forever, or a 400 if the cap were lifted naively.
      hasMore: moreExist && pageSize < BOARD_COLUMN_MAX_LOADED,
      atLoadLimit: moreExist && pageSize >= BOARD_COLUMN_MAX_LOADED,
      loadMore,
      refetch,
    };
  }, [status, items, total, enabled, isLoading, isError, error, pageSize, loadMore, refetch]);
}

/**
 * Board data: five independent per-status queries sharing one set of URL
 * filters with the list screen. Separate queries (rather than one multi-status
 * query) are what give each column its own true total and its own "Load more".
 */
export function useAppointmentBoard(): UseAppointmentBoardReturn {
  const [urlFilters, setFilter] = useUrlFilters(APPOINTMENT_FILTER_SCHEMA);
  const filters = urlFilters as AppointmentFiltersState;

  const setFilters = useCallback(
    (next: AppointmentFiltersState) => {
      for (const key of Object.keys(APPOINTMENT_FILTER_SCHEMA) as (keyof typeof APPOINTMENT_FILTER_SCHEMA)[]) {
        if (next[key] !== filters[key]) setFilter(key, next[key]);
      }
    },
    [filters, setFilter],
  );

  const awaitingInspector = useBoardColumn('AWAITING_INSPECTOR', filters);
  const scheduled = useBoardColumn('SCHEDULED', filters);
  const rejected = useBoardColumn('REJECTED', filters);
  const cancelled = useBoardColumn('CANCELLED', filters);
  const done = useBoardColumn('DONE', filters);

  const columns = useMemo(
    () => [awaitingInspector, scheduled, rejected, cancelled, done],
    [awaitingInspector, scheduled, rejected, cancelled, done],
  );

  const allItems = useMemo(() => columns.flatMap((column) => column.items), [columns]);

  const refetchAll = useCallback(() => {
    for (const column of columns) column.refetch();
  }, [columns]);

  return { columns, allItems, filters, setFilters, refetchAll };
}
