import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { PropertyImportPreviewResponse } from '@properfy/shared';

const FAST_POLL_INTERVAL_MS = 3000;
const SLOW_POLL_INTERVAL_MS = 10000;
const MAX_STALLED_POLL_ATTEMPTS = 20;

export interface ImportRowResultEntry {
  rowNumber: number;
  status: 'created' | 'reused' | 'error';
  propertyId?: string;
  message?: string;
}

export interface ImportStatus {
  id: string;
  status: 'PREVIEW' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  successCount: number;
  errorCount: number;
  results: ImportRowResultEntry[];
}

interface BackendImportStatusResponse {
  id: string;
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
    if (
      typeof e['rowNumber'] !== 'number' ||
      (e['status'] !== 'created' && e['status'] !== 'reused' && e['status'] !== 'error')
    ) {
      return [];
    }
    return [{
      rowNumber: e['rowNumber'],
      status: e['status'] as 'created' | 'reused' | 'error',
      propertyId: typeof e['propertyId'] === 'string' ? e['propertyId'] : undefined,
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
    status,
    totalRows: data.totalRows,
    successCount: data.successCount,
    errorCount: data.errorCount,
    results: normalizeResults(data.resultsJson),
  };
}

export interface UsePropertyImportReturn {
  /** tenantId is required for AM/OP (cross-tenant) and omitted for CL_ADMIN. */
  preview: (file: File, tenantId?: string) => Promise<PropertyImportPreviewResponse | null>;
  isPreviewing: boolean;
  commit: (importId: string, opts: { skipInvalidRows: boolean }) => Promise<boolean>;
  isCommitting: boolean;
  importStatus: ImportStatus | null;
  isPolling: boolean;
}

/** Server-driven preview→commit flow for the property importer, mirroring
 * `useAppointmentImport` (same polling backoff, same idempotency scheme). */
export function usePropertyImport(): UsePropertyImportReturn {
  const { showError } = useSnackbar();
  const [isPreviewing, setIsPreviewing] = useState(false);
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
    queryKey: ['property-import-status', importId],
    queryFn: async () => {
      if (!importId) return null;
      const { data, error } = await api.GET('/v1/properties/import/{importId}', {
        params: { path: { importId } },
      });
      if (error) throw error;
      const normalized = normalizeStatus((data as unknown as { data: BackendImportStatusResponse }).data);
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
    async (file: File, tenantId?: string): Promise<PropertyImportPreviewResponse | null> => {
      setIsPreviewing(true);
      try {
        const formData = new FormData();
        // tenantId (when present) appended BEFORE the file — the backend
        // reads all multipart parts regardless of order, but this keeps
        // client and server conventions aligned per the documented contract.
        if (tenantId) formData.append('tenantId', tenantId);
        formData.append('file', file);

        // Multipart still needs the body cast: openapi-fetch types the body
        // from the spec's JSON shape, while the wire format is FormData
        // passed through an identity serializer.
        const { data, error } = await api.POST('/v1/properties/import/preview', {
          body: formData as never,
          bodySerializer: (body: unknown) => body as BodyInit,
        });

        if (error) {
          showError('Failed to preview the import file');
          return null;
        }

        return (data as { data: PropertyImportPreviewResponse }).data;
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
    async (id: string, opts: { skipInvalidRows: boolean }): Promise<boolean> => {
      setIsCommitting(true);
      try {
        // Derived from the importId, not randomUUID() — a retry of the same
        // logical commit must reuse the same key so the backend recognizes
        // it as a replay instead of a second attempt.
        const idempotencyKey = `property-import-commit:${id}`;
        const { error } = await api.POST('/v1/properties/import/{importId}/commit', {
          params: { path: { importId: id } },
          body: { skipInvalidRows: opts.skipInvalidRows },
          headers: { 'Idempotency-Key': idempotencyKey },
        });

        if (error) {
          showError('Failed to start the import');
          return false;
        }

        stalledPollAttemptsRef.current = 0;
        processedRowsRef.current = 0;
        warnedAboutSlowImportRef.current = false;
        setPollIntervalMs(FAST_POLL_INTERVAL_MS);
        setImportId(id);
        setPollingEnabled(true);
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
