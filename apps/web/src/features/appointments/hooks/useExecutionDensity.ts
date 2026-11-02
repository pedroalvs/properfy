import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { ExecutionDensityResponse, ExecutionDensityCell } from '@properfy/shared';
import { api } from '@/services/api';

interface UseExecutionDensityParams {
  enabled: boolean;
  fromDate: string;
  toDate: string;
  tenantId?: string;
  inspectorId?: string;
}

export interface UseExecutionDensityReturn {
  cells: ExecutionDensityCell[];
  totalExecutions: number;
  cellCount: number;
  excludedWithoutCoordinates: number;
  truncated: boolean;
  minCellCount: number;
  /** `error.details.reason` from the envelope, e.g. 'PERIOD_NOT_A_PRESET' (L-F09-01). */
  errorReason?: string;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
}

/** Empty state — also what `isError` returns, so a failed request never leaks stale data (L-F09-08). */
const EMPTY = {
  cells: [] as ExecutionDensityCell[],
  totalExecutions: 0,
  cellCount: 0,
  excludedWithoutCoordinates: 0,
  truncated: false,
  minCellCount: 1,
} as const;

/** Carries the error envelope's `details.reason` so the control can react to it. */
class ExecutionDensityError extends Error {
  readonly reason?: string;
  constructor(message: string, reason?: string) {
    super(message);
    this.name = 'ExecutionDensityError';
    this.reason = reason;
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: { reason?: string } };
}

export function useExecutionDensity({
  enabled,
  fromDate,
  toDate,
  tenantId,
  inspectorId,
}: UseExecutionDensityParams): UseExecutionDensityReturn {
  const query = useQuery<ExecutionDensityResponse, ExecutionDensityError>({
    queryKey: ['map', 'execution-density', fromDate, toDate, tenantId ?? null, inspectorId ?? null],
    enabled: enabled && !!fromDate && !!toDate,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const queryParams: { fromDate: string; toDate: string; tenantId?: string; inspectorId?: string } = {
        fromDate,
        toDate,
      };
      if (tenantId) queryParams.tenantId = tenantId;
      if (inspectorId) queryParams.inspectorId = inspectorId;

      const { data, error } = await api.GET('/v1/map/execution-density', {
        params: { query: queryParams },
      });
      if (error) {
        const envelope = error as ErrorEnvelope;
        throw new ExecutionDensityError(
          envelope.error?.message ?? 'Failed to load activity density',
          envelope.error?.details?.reason,
        );
      }
      return (data as unknown as { data: ExecutionDensityResponse }).data;
    },
  });

  // On error, return the frozen empty state — never `data`/placeholder (keepPreviousData
  // would otherwise leave the previous agency's cells visible after a failed switch).
  const payload = query.isError ? undefined : query.data;

  return {
    cells: payload?.cells ?? EMPTY.cells,
    totalExecutions: payload?.totalExecutions ?? EMPTY.totalExecutions,
    cellCount: payload?.cellCount ?? EMPTY.cellCount,
    excludedWithoutCoordinates: payload?.excludedWithoutCoordinates ?? EMPTY.excludedWithoutCoordinates,
    truncated: payload?.truncated ?? EMPTY.truncated,
    minCellCount: payload?.minCellCount ?? EMPTY.minCellCount,
    errorReason: query.error?.reason,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: () => {
      void query.refetch();
    },
  };
}
