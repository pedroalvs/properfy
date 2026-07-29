import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useSnackbar } from '@/hooks/useSnackbar';
import { getErrorMessage, toApiError, type ApiError } from '@/lib/api-error';
import { importFileIssueSchema } from '@properfy/shared';
import type { AppointmentImportPreviewResponse, ImportFileIssue } from '@properfy/shared';

const FAST_POLL_INTERVAL_MS = 3000;
const SLOW_POLL_INTERVAL_MS = 10000;
const MAX_STALLED_POLL_ATTEMPTS = 20;

export interface ImportRowResultEntry {
  rowNumber: number;
  status: 'created' | 'error';
  appointmentId?: string;
  message?: string;
}

/** Whole-file reason a commit failed, as persisted by the commit worker. */
export interface ImportFailure {
  code: string;
  message: string;
}

export interface ImportStatus {
  id: string;
  branchId: string | null;
  status: 'PREVIEW' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  successCount: number;
  errorCount: number;
  results: ImportRowResultEntry[];
  failure: ImportFailure | null;
}

interface BackendImportStatusResponse {
  id: string;
  branchId: string | null;
  status: string;
  totalRows: number;
  successCount: number;
  errorCount: number;
  resultsJson: unknown;
  errorsJson: unknown;
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

/** Picks the file-scoped failure the commit worker records on `errorsJson`.
 * Anything else in there is legacy per-row data and is ignored. */
function normalizeFailure(errorsJson: unknown): ImportFailure | null {
  if (!Array.isArray(errorsJson)) return null;

  for (const entry of errorsJson) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (e['scope'] === 'file' && typeof e['code'] === 'string' && typeof e['message'] === 'string') {
      return { code: e['code'], message: e['message'] };
    }
  }
  return null;
}

/** Narrows an API error's `details` to the structured file issues the backend
 * attaches to a blocking import rejection. Validates with the shared schema
 * rather than sniffing `code`: entries that are not file issues (a plain
 * `{ field, message }` from a VALIDATION_ERROR) drop out, and a partial
 * payload gets the schema's defaults, so the renderer can dereference
 * `missingColumns` and friends without guarding each one. */
export function fileIssuesFromApiError(err: ApiError | null): ImportFileIssue[] {
  if (!err || !Array.isArray(err.details)) return [];

  return err.details.flatMap((detail) => {
    const parsed = importFileIssueSchema.safeParse(detail);
    return parsed.success ? [parsed.data] : [];
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
    failure: normalizeFailure(data.errorsJson),
  };
}

export interface UseAppointmentImportReturn {
  preview: (file: File, branchId: string) => Promise<AppointmentImportPreviewResponse | null>;
  isPreviewing: boolean;
  /** The last preview rejection, kept so the page can render the backend's own
   * message and its structured column lists instead of a hardcoded string. */
  previewError: ApiError | null;
  commit: (importId: string, opts: { skipInvalidRows: boolean }) => Promise<boolean>;
  isCommitting: boolean;
  importStatus: ImportStatus | null;
  isPolling: boolean;
}

export function useAppointmentImport(): UseAppointmentImportReturn {
  const { showError } = useSnackbar();
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<ApiError | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [importId, setImportId] = useState<string | null>(null);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const [pollIntervalMs, setPollIntervalMs] = useState<number | false>(false);
  const stalledPollAttemptsRef = useRef(0);
  const processedRowsRef = useRef(0);
  const warnedAboutSlowImportRef = useRef(false);

  const handlePolledStatus = useCallback((status: ImportStatus) => {
    if (!pollingEnabled) {
      return;
    }

    if (status.status === 'COMPLETED' || status.status === 'FAILED') {
      setPollingEnabled(false);
      stalledPollAttemptsRef.current = 0;
      processedRowsRef.current = 0;
      warnedAboutSlowImportRef.current = false;
      setPollIntervalMs(false);
      return;
    }

    const processedRows = status.successCount + status.errorCount;
    if (processedRows > processedRowsRef.current) {
      processedRowsRef.current = processedRows;
      stalledPollAttemptsRef.current = 0;
      setPollIntervalMs((current) => (current === FAST_POLL_INTERVAL_MS ? current : FAST_POLL_INTERVAL_MS));
      return;
    }

    stalledPollAttemptsRef.current += 1;
    if (stalledPollAttemptsRef.current >= MAX_STALLED_POLL_ATTEMPTS) {
      if (!warnedAboutSlowImportRef.current) {
        warnedAboutSlowImportRef.current = true;
        showError('Import is taking longer than expected. Check back later.');
      }
      setPollIntervalMs((current) => (current === SLOW_POLL_INTERVAL_MS ? current : SLOW_POLL_INTERVAL_MS));
      return;
    }

    setPollIntervalMs((current) => (current === FAST_POLL_INTERVAL_MS ? current : FAST_POLL_INTERVAL_MS));
  }, [pollingEnabled, showError]);

  const pollQuery = useQuery({
    queryKey: ['appointment-import-status', importId],
    queryFn: async () => {
      if (!importId) return null;
      const { data, error } = await api.GET('/v1/appointments/import/{importId}' as any, {
        params: { path: { importId } } as any,
      });
      if (error) throw error;
      const normalized = normalizeStatus((data as { data: BackendImportStatusResponse }).data);
      handlePolledStatus(normalized);
      return normalized;
    },
    enabled: !!importId && pollingEnabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'COMPLETED' || status === 'FAILED') {
        return false;
      }
      return pollIntervalMs;
    },
  });

  const preview = useCallback(
    async (file: File, branchId: string): Promise<AppointmentImportPreviewResponse | null> => {
      setIsPreviewing(true);
      setPreviewError(null);
      try {
        const formData = new FormData();
        // branchId appended BEFORE the file — the backend
        // reads all multipart parts regardless of order, but this keeps
        // client and server conventions aligned per the documented contract.
        formData.append('branchId', branchId);
        formData.append('file', file);

        const { data, error, response } = await api.POST('/v1/appointments/import/preview' as any, {
          body: formData as any,
          bodySerializer: (body: any) => body,
        } as any);

        if (error) {
          const apiError = toApiError(error, response?.status);
          setPreviewError(apiError);
          showError(getErrorMessage(apiError, 'Failed to preview the import file'));
          return null;
        }

        return (data as { data: AppointmentImportPreviewResponse }).data;
      } catch (err) {
        const apiError = toApiError(err);
        setPreviewError(apiError);
        showError(getErrorMessage(apiError, 'Failed to preview the import file'));
        return null;
      } finally {
        setIsPreviewing(false);
      }
    },
    [showError],
  );

  const commit = useCallback(
    async (id: string, opts: { skipInvalidRows: boolean }): Promise<boolean> => {
      setIsCommitting(true);
      try {
        // Derived from the importId, not randomUUID() — a retry of the same
        // logical commit (e.g. a flaky network response after the request
        // actually landed) must reuse the same key so the backend can
        // recognize it as a replay instead of a second attempt.
        const idempotencyKey = `appointment-import-commit:${id}`;
        const { error, response } = await api.POST('/v1/appointments/import/{importId}/commit' as any, {
          params: { path: { importId: id } } as any,
          body: { skipInvalidRows: opts.skipInvalidRows },
          headers: { 'Idempotency-Key': idempotencyKey },
        } as any);

        if (error) {
          showError(getErrorMessage(toApiError(error, response?.status), 'Failed to start the import'));
          return false;
        }

        stalledPollAttemptsRef.current = 0;
        processedRowsRef.current = 0;
        warnedAboutSlowImportRef.current = false;
        setPollIntervalMs(FAST_POLL_INTERVAL_MS);
        setImportId(id);
        setPollingEnabled(true);
        return true;
      } catch (err) {
        showError(getErrorMessage(err, 'Failed to start the import'));
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
    previewError,
    commit,
    isCommitting,
    importStatus: pollQuery.data ?? null,
    isPolling: pollQuery.isFetching,
  };
}
