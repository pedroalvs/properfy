import { useCallback, useState } from 'react';
import { api } from '@/services/api';
import { useSnackbar } from '@/hooks/useSnackbar';

export function useInspectorDocumentDownload() {
  const [isDownloading, setIsDownloading] = useState(false);
  const { showError } = useSnackbar();

  const download = useCallback(async (inspectorId: string, kind: 'INSURANCE' | 'POLICE_CHECK') => {
    setIsDownloading(true);
    try {
      const { data, error } = await api.GET(
        `/v1/inspectors/{inspectorId}/documents/{kind}/download` as never,
        { params: { path: { inspectorId, kind } } } as never,
      );
      if (error || !data) {
        showError('Failed to get download URL');
        return;
      }
      const url = (data as { downloadUrl?: string }).downloadUrl;
      if (url) window.open(url, '_blank');
    } catch {
      showError('Failed to download document');
    } finally {
      setIsDownloading(false);
    }
  }, [showError]);

  return { download, isDownloading };
}
