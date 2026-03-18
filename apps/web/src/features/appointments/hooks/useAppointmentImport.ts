import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface ImportStatus {
  id: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  successCount: number;
  errorCount: number;
  errors: { row: number; message: string }[];
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

  const pollQuery = useQuery({
    queryKey: ['appointment-import-status', importId],
    queryFn: async () => {
      if (!importId) return null;
      const { data, error } = await api.GET('/v1/appointments/import/{importId}' as any, {
        params: { path: { importId } } as any,
      });
      if (error) throw error;
      return (data as { data: ImportStatus }).data;
    },
    enabled: !!importId && pollingEnabledRef.current,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'COMPLETED' || status === 'FAILED') {
        pollingEnabledRef.current = false;
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

        const responseData = data as { data: { id: string } };
        const newImportId = responseData.data.id;
        const status: ImportStatus = {
          id: newImportId,
          status: 'PROCESSING',
          progress: 0,
          successCount: 0,
          errorCount: 0,
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
