import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useSnackbar } from '@/hooks/useSnackbar';

const MAX_POLL_ATTEMPTS = 20;

export interface ImportStatus {
  id: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  successCount: number;
  errorCount: number;
  errors: { row: number; message: string }[];
}

interface BackendImportCreateResponse {
  importId: string;
  status: string;
  acceptedCount: number;
  warningCount: number;
  errorCount: number;
}

interface BackendImportStatusResponse {
  id: string;
  status: string;
  totalRows: number;
  successCount: number;
  errorCount: number;
  errorsJson: unknown[] | null;
}

function normalizeErrors(errorsJson: unknown[] | null): ImportStatus['errors'] {
  if (!Array.isArray(errorsJson)) return [];

  return errorsJson.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];

    const rowValue = 'row' in entry ? (entry as { row?: unknown }).row : undefined;
    const messageValue = 'message' in entry ? (entry as { message?: unknown }).message : undefined;

    if (typeof rowValue !== 'number' || typeof messageValue !== 'string') {
      return [];
    }

    return [{ row: rowValue, message: messageValue }];
  });
}

function normalizeStatus(data: BackendImportStatusResponse): ImportStatus {
  const status =
    data.status === 'COMPLETED' || data.status === 'FAILED'
      ? data.status
      : 'PROCESSING';

  return {
    id: data.id,
    status,
    progress: status === 'PROCESSING' ? 0 : 100,
    successCount: data.successCount,
    errorCount: data.errorCount,
    errors: normalizeErrors(data.errorsJson),
  };
}

export interface UseAppointmentImportReturn {
  upload: (file: File) => void;
  isUploading: boolean;
  importStatus: ImportStatus | null;
  isPolling: boolean;
}

export function useAppointmentImport(): UseAppointmentImportReturn {
  const { showError } = useSnackbar();
  const [isUploading, setIsUploading] = useState(false);
  const [importId, setImportId] = useState<string | null>(null);
  const [initialStatus, setInitialStatus] = useState<ImportStatus | null>(null);
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

  const importStatus = pollQuery.data ?? initialStatus;

  const upload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setInitialStatus(null);
      setImportId(null);
      pollingEnabledRef.current = false;
      pollAttemptsRef.current = 0;

      try {
        const formData = new FormData();
        formData.append('file', file);

        const idempotencyKey = crypto.randomUUID();

        const { data, error } = await api.POST('/v1/appointments/import' as any, {
          body: formData as any,
          headers: {
            'Idempotency-Key': idempotencyKey,
          },
          bodySerializer: (body: any) => body,
        } as any);

        if (error) {
          showError('Failed to upload file for import');
          return;
        }

        const responseData = data as { data: BackendImportCreateResponse };
        const newImportId = responseData.data.importId;
        const status: ImportStatus = {
          id: newImportId,
          status: 'PROCESSING',
          progress: 0,
          successCount: responseData.data.acceptedCount,
          errorCount: responseData.data.errorCount,
          errors: [],
        };
        setInitialStatus(status);
        setImportId(newImportId);
        pollingEnabledRef.current = true;
      } catch {
        showError('Failed to upload file for import');
      } finally {
        setIsUploading(false);
      }
    },
    [showError],
  );

  return {
    upload,
    isUploading,
    importStatus,
    isPolling: pollQuery.isFetching,
  };
}
