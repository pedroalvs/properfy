import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { AppointmentImportPreviewResponse } from '@properfy/shared';

// 60 attempts * 3s = 3 minutes. A larger batch (each row does a property
// lookup/create, a contact lookup/create, and an appointment create with
// an incremental DB write) can genuinely take longer than the previous
// budget (20 * 3s = 60s) under real production latency — the batch keeps
// running server-side regardless, but polling would give up and show a
// "taking longer than expected" error while the import was still healthy.
const MAX_POLL_ATTEMPTS = 60;

export interface ImportRowResultEntry {
  rowNumber: number;
  status: 'created' | 'error';
  appointmentId?: string;
  message?: string;
}

export interface ImportStatus {
  id: string;
  branchId: string | null;
  status: 'PREVIEW' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  successCount: number;
  errorCount: number;
  results: ImportRowResultEntry[];
}

interface BackendImportStatusResponse {
  id: string;
  branchId: string | null;
  status: string;
  totalRows: number;
  successCount: number;
  errorCount: number;
  resultsJson: unknown;
}

function normalizeResults(resultsJson: unknown): ImportRowResultEntry[] {
  if (!Array.isArray(resultsJson)) return [];

  return resultsJson.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const e = entry as Record<string, unknown>;
    if (typeof e['rowNumber'] !== 'number' || (e['status'] !== 'created' && e['status'] !== 'error')) {
      return [];
    }
    return [{
      rowNumber: e['rowNumber'],
      status: e['status'] as 'created' | 'error',
      appointmentId: typeof e['appointmentId'] === 'string' ? e['appointmentId'] : undefined,
      message: typeof e['message'] === 'string' ? e['message'] : undefined,
    }];
  });
}

function normalizeStatus(data: BackendImportStatusResponse): ImportStatus {
  const status: ImportStatus['status'] =
    data.status === 'PREVIEW' || data.status === 'COMPLETED' || data.status === 'FAILED'
      ? data.status
      : 'PROCESSING';

  return {
    id: data.id,
    branchId: data.branchId,
    status,
    totalRows: data.totalRows,
    successCount: data.successCount,
    errorCount: data.errorCount,
    results: normalizeResults(data.resultsJson),
  };
}

export interface UseAppointmentImportReturn {
  preview: (file: File, branchId: string, actorTimezone?: string) => Promise<AppointmentImportPreviewResponse | null>;
  isPreviewing: boolean;
  commit: (importId: string, opts: { skipInvalidRows: boolean; actorTimezone?: string }) => Promise<boolean>;
  isCommitting: boolean;
  importStatus: ImportStatus | null;
  isPolling: boolean;
}

export function useAppointmentImport(): UseAppointmentImportReturn {
  const { showError } = useSnackbar();
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [importId, setImportId] = useState<string | null>(null);
  const pollingEnabledRef = useRef(false);
  const pollAttemptsRef = useRef(0);

  const pollQuery = useQuery({
    queryKey: ['appointment-import-status', importId],
    queryFn: async () => {
      if (!importId) return null;
      const { data, error } = await api.GET('/v1/appointments/import/{importId}' as any, {
        params: { path: { importId } } as any,
      });
      if (error) throw error;
      return normalizeStatus((data as { data: BackendImportStatusResponse }).data);
    },
    enabled: !!importId && pollingEnabledRef.current,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'COMPLETED' || status === 'FAILED') {
        pollingEnabledRef.current = false;
        pollAttemptsRef.current = 0;
        return false;
      }

      pollAttemptsRef.current += 1;
      if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
        pollingEnabledRef.current = false;
        showError('Import is taking longer than expected. Check back later.');
        return false;
      }

      return 3000;
    },
  });

  const preview = useCallback(
    async (file: File, branchId: string, actorTimezone?: string): Promise<AppointmentImportPreviewResponse | null> => {
      setIsPreviewing(true);
      try {
        const formData = new FormData();
        // branchId (and actorTimezone) appended BEFORE the file — the backend
        // reads all multipart parts regardless of order, but this keeps
        // client and server conventions aligned per the documented contract.
        formData.append('branchId', branchId);
        if (actorTimezone) formData.append('actorTimezone', actorTimezone);
        formData.append('file', file);

        const { data, error } = await api.POST('/v1/appointments/import/preview' as any, {
          body: formData as any,
          bodySerializer: (body: any) => body,
        } as any);

        if (error) {
          showError('Failed to preview the import file');
          return null;
        }

        return (data as { data: AppointmentImportPreviewResponse }).data;
      } catch {
        showError('Failed to preview the import file');
        return null;
      } finally {
        setIsPreviewing(false);
      }
    },
    [showError],
  );

  const commit = useCallback(
    async (id: string, opts: { skipInvalidRows: boolean; actorTimezone?: string }): Promise<boolean> => {
      setIsCommitting(true);
      pollAttemptsRef.current = 0;
      try {
        // Derived from the importId, not randomUUID() — a retry of the same
        // logical commit (e.g. a flaky network response after the request
        // actually landed) must reuse the same key so the backend can
        // recognize it as a replay instead of a second attempt.
        const idempotencyKey = `appointment-import-commit:${id}`;
        const { error } = await api.POST('/v1/appointments/import/{importId}/commit' as any, {
          params: { path: { importId: id } } as any,
          body: { skipInvalidRows: opts.skipInvalidRows, actorTimezone: opts.actorTimezone },
          headers: { 'Idempotency-Key': idempotencyKey },
        } as any);

        if (error) {
          showError('Failed to start the import');
          return false;
        }

        setImportId(id);
        pollingEnabledRef.current = true;
        return true;
      } catch {
        showError('Failed to start the import');
        return false;
      } finally {
        setIsCommitting(false);
      }
    },
    [showError],
  );

  return {
    preview,
    isPreviewing,
    commit,
    isCommitting,
    importStatus: pollQuery.data ?? null,
    isPolling: pollQuery.isFetching,
  };
}
