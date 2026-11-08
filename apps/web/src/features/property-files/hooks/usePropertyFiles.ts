import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  PropertyFileType,
  PropertyFileResponse,
  FileCounts,
  ListPropertyFilesResponse,
} from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError, type ApiError } from '@/lib/api-error';

export interface UsePropertyFilesParams {
  propertyId?: string;
  appointmentId?: string;
  type?: PropertyFileType;
}

const EMPTY_COUNTS: FileCounts = { total: 0, issues: 0, documents: 0, reports: 0, other: 0 };

export interface UsePropertyFilesReturn {
  files: PropertyFileResponse[];
  counts: FileCounts;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
}

/**
 * READY files for a property or appointment, optionally filtered by type
 * (F10 `GET /v1/property-files`). The key sits under `['property-files', scopeId]`
 * so file mutations that invalidate that prefix refresh the subtab. Derived
 * arrays are memoised on the raw payload (web §13.11).
 */
export function usePropertyFiles(
  params: UsePropertyFilesParams,
  options?: { enabled?: boolean },
): UsePropertyFilesReturn {
  const scopeId = params.appointmentId ?? params.propertyId ?? null;
  const type = params.type ?? null;

  const query = useQuery<ListPropertyFilesResponse, ApiError>({
    queryKey: ['property-files', scopeId, type],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/v1/property-files', {
        params: {
          query: {
            propertyId: params.propertyId,
            appointmentId: params.appointmentId,
            type: params.type,
          },
        },
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return (data as { data: ListPropertyFilesResponse }).data;
    },
    enabled: scopeId != null && (options?.enabled ?? true),
  });

  const files = useMemo(() => query.data?.files ?? [], [query.data]);
  const counts = useMemo(() => query.data?.counts ?? EMPTY_COUNTS, [query.data]);

  return {
    files,
    counts,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}
