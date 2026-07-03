import { useCallback, useState } from 'react';
import type { paths } from '@properfy/shared';
import { api } from '@/services/api';
import { useSnackbar } from '@/hooks/useSnackbar';
import { unwrapSuccessData } from '@/lib/api-envelope';

type InspectorDocumentDownloadResponse =
  paths['/v1/inspectors/{inspectorId}/documents/{kind}/download']['get']['responses'][200]['content']['application/json'];

export function useInspectorDocumentDownload() {
  const [isDownloading, setIsDownloading] = useState(false);
  const { showError } = useSnackbar();

  const download = useCallback(async (inspectorId: string, kind: 'INSURANCE' | 'POLICE_CHECK') => {
    setIsDownloading(true);
    try {
      const { data, error } = await api.GET(
        '/v1/inspectors/{inspectorId}/documents/{kind}/download',
        { params: { path: { inspectorId, kind } } },
      );
      if (error || !data) {
        showError('Failed to get download URL');
        return;
      }
      const url = unwrapSuccessData<InspectorDocumentDownloadResponse['data']>(data)?.downloadUrl;
      if (url) window.open(url, '_blank');
    } catch {
      showError('Failed to download document');
    } finally {
      setIsDownloading(false);
    }
  }, [showError]);

  return { download, isDownloading };
}
