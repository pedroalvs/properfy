import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { CreateScheduledReportPayload, ScheduledReport } from '../types';

export interface MutationResult {
  success: boolean;
  error?: string;
  data?: ScheduledReport;
}

export interface UseScheduledReportMutationsReturn {
  createScheduledReport: (data: CreateScheduledReportPayload) => Promise<MutationResult>;
  updateScheduledReport: (id: string, data: Partial<CreateScheduledReportPayload>) => Promise<MutationResult>;
  deleteScheduledReport: (id: string) => Promise<MutationResult>;
  pauseScheduledReport: (id: string) => Promise<MutationResult>;
  resumeScheduledReport: (id: string) => Promise<MutationResult>;
  reassignScheduleOwnership: (id: string, newOwnerUserId: string) => Promise<MutationResult>;
  isMutating: boolean;
}

function extractError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Request failed';
}

/**
 * Feature 019: mutations for scheduled report lifecycle.
 * The backend endpoints are under /v1/reports/schedules and are not yet
 * in the generated OpenAPI client, so we use `as any` casts (same pattern
 * as other features that outpace the generator).
 */
export function useScheduledReportMutations(): UseScheduledReportMutationsReturn {
  const [isMutating, setIsMutating] = useState(false);
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
  }, [queryClient]);

  const createScheduledReport = useCallback(
    async (data: CreateScheduledReportPayload): Promise<MutationResult> => {
      setIsMutating(true);
      try {
        const { data: result, error } = await (api as any).POST('/v1/reports/schedules', {
          body: data,
        });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
        invalidate();
        return { success: true, data: result };
      } catch (err) {
        return { success: false, error: extractError(err) };
      } finally {
        setIsMutating(false);
      }
    },
    [invalidate],
  );

  const updateScheduledReport = useCallback(
    async (id: string, data: Partial<CreateScheduledReportPayload>): Promise<MutationResult> => {
      setIsMutating(true);
      try {
        const { data: result, error } = await (api as any).PUT(
          `/v1/reports/schedules/${id}`,
          { body: data },
        );
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
        invalidate();
        return { success: true, data: result };
      } catch (err) {
        return { success: false, error: extractError(err) };
      } finally {
        setIsMutating(false);
      }
    },
    [invalidate],
  );

  const deleteScheduledReport = useCallback(
    async (id: string): Promise<MutationResult> => {
      setIsMutating(true);
      try {
        const { error } = await (api as any).DELETE(`/v1/reports/schedules/${id}`);
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
        invalidate();
        return { success: true };
      } catch (err) {
        return { success: false, error: extractError(err) };
      } finally {
        setIsMutating(false);
      }
    },
    [invalidate],
  );

  const pauseScheduledReport = useCallback(
    async (id: string): Promise<MutationResult> => {
      setIsMutating(true);
      try {
        const { error } = await (api as any).POST(`/v1/reports/schedules/${id}/pause`, {});
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
        invalidate();
        return { success: true };
      } catch (err) {
        return { success: false, error: extractError(err) };
      } finally {
        setIsMutating(false);
      }
    },
    [invalidate],
  );

  const resumeScheduledReport = useCallback(
    async (id: string): Promise<MutationResult> => {
      setIsMutating(true);
      try {
        const { error } = await (api as any).POST(`/v1/reports/schedules/${id}/resume`, {});
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
        invalidate();
        return { success: true };
      } catch (err) {
        return { success: false, error: extractError(err) };
      } finally {
        setIsMutating(false);
      }
    },
    [invalidate],
  );

  const reassignScheduleOwnership = useCallback(
    async (id: string, newOwnerUserId: string): Promise<MutationResult> => {
      setIsMutating(true);
      try {
        const { error } = await (api as any).POST(`/v1/reports/schedules/${id}/reassign`, {
          body: { newOwnerUserId },
        });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
        invalidate();
        return { success: true };
      } catch (err) {
        return { success: false, error: extractError(err) };
      } finally {
        setIsMutating(false);
      }
    },
    [invalidate],
  );

  return {
    createScheduledReport,
    updateScheduledReport,
    deleteScheduledReport,
    pauseScheduledReport,
    resumeScheduledReport,
    reassignScheduleOwnership,
    isMutating,
  };
}
