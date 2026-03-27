import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface TimeSlot {
  id: string;
  tenantId: string | null;
  branchId: string | null;
  label: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TimeSlotListResponse {
  data: TimeSlot[];
}

export interface TimeSlotSaveData {
  tenantId?: string;
  branchId?: string;
  label: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  isActive?: boolean;
}

export interface SaveResult {
  success: boolean;
  error?: string;
  errorCode?: string;
}

// ─── List Hook ─────────────────────────────────────────────────────────────

export function useTimeSlotList(tenantId?: string, branchId?: string | null) {
  const params: Record<string, string> = { includeInactive: 'true' };
  if (tenantId) params.tenantId = tenantId;
  if (branchId) params.branchId = branchId;

  const query = useQuery<TimeSlotListResponse, ApiError>({
    queryKey: ['time-slots', tenantId, branchId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/time-slots' as any, {
        params: { query: params as any },
      });
      if (error) {
        const err = error as any;
        throw new ApiError(
          err?.status ?? 500,
          err?.error?.message ?? 'Failed to load time slots',
          err?.error?.code,
        );
      }
      return data as unknown as TimeSlotListResponse;
    },
  });

  return {
    data: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    errorMessage: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

// ─── Save Hook ─────────────────────────────────────────────────────────────

export interface UseTimeSlotSaveReturn {
  save: (data: TimeSlotSaveData, slotId?: string) => Promise<SaveResult>;
  isSaving: boolean;
}

export function useTimeSlotSave(): UseTimeSlotSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const save = useCallback(async (data: TimeSlotSaveData, slotId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      let apiError: { error?: { code?: string; message?: string } } | undefined;

      if (slotId) {
        const { label, startTime, endTime, sortOrder, isActive } = data;
        const { error } = await api.PATCH(`/v1/time-slots/${slotId}` as any, {
          body: { label, startTime, endTime, sortOrder, isActive } as any,
        });
        apiError = error as any;
      } else {
        const { error } = await api.POST('/v1/time-slots' as any, {
          body: data as any,
        });
        apiError = error as any;
      }

      if (apiError) {
        const code = apiError?.error?.code ?? 'UNKNOWN';
        const message = apiError?.error?.message ?? 'Request failed';
        return { success: false, error: message, errorCode: code };
      }

      await queryClient.invalidateQueries({ queryKey: ['time-slots'] });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      return { success: false, error: message };
    } finally {
      setIsSaving(false);
    }
  }, [queryClient]);

  return { save, isSaving };
}

// ─── Delete Hook ───────────────────────────────────────────────────────────

export interface UseTimeSlotDeleteReturn {
  remove: (slotId: string) => Promise<SaveResult>;
  isDeleting: boolean;
}

export function useTimeSlotDelete(): UseTimeSlotDeleteReturn {
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();

  const remove = useCallback(async (slotId: string): Promise<SaveResult> => {
    setIsDeleting(true);
    try {
      const { error } = await api.DELETE(`/v1/time-slots/${slotId}` as any, {} as any);
      const apiError = error as any;

      if (apiError) {
        const code = apiError?.error?.code ?? 'UNKNOWN';
        const message = apiError?.error?.message ?? 'Request failed';
        return { success: false, error: message, errorCode: code };
      }

      await queryClient.invalidateQueries({ queryKey: ['time-slots'] });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete';
      return { success: false, error: message };
    } finally {
      setIsDeleting(false);
    }
  }, [queryClient]);

  return { remove, isDeleting };
}
