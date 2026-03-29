import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface PropertyImportError {
  row: number;
  field?: string;
  message: string;
}

export interface PropertyImportStatus {
  id: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  successCount: number;
  errorCount: number;
  errors: PropertyImportError[];
}

export interface UsePropertyImportReturn {
  upload: (file: File) => void;
  isUploading: boolean;
  importStatus: PropertyImportStatus | null;
  isPolling: boolean;
}

export function usePropertyImport(): UsePropertyImportReturn {
  const { showError } = useSnackbar();
  const [isUploading, setIsUploading] = useState(false);
  const [importId, setImportId] = useState<string | null>(null);
  const [initialStatus, setInitialStatus] = useState<PropertyImportStatus | null>(null);
  const pollingEnabledRef = useRef(false);

  const pollQuery = useQuery({
    queryKey: ['property-import-status', importId],
    queryFn: async () => {
      if (!importId) return null;
      const { data, error } = await api.GET('/v1/properties/import/{importId}' as any, {
        params: { path: { importId } } as any,
      });
      if (error) throw error;
      const raw = (data as { data: Record<string, unknown> }).data;
      const errorsJson = (raw.errorsJson ?? []) as { row: number; field?: string; message: string }[];
      const totalRows = (raw.totalRows as number) ?? 0;
      const successCount = (raw.successCount as number) ?? 0;
      const progress = totalRows > 0 ? Math.round(((successCount + (raw.errorCount as number ?? 0)) / totalRows) * 100) : 0;
      return {
        id: raw.id as string,
        status: raw.status as PropertyImportStatus['status'],
        progress,
        successCount,
        errorCount: (raw.errorCount as number) ?? 0,
        errors: errorsJson,
      };
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

        const { data, error } = await api.POST('/v1/properties/import' as any, {
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
        const status: PropertyImportStatus = {
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
