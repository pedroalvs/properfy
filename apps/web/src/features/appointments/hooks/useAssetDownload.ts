import { useCallback, useState } from 'react';
import { api } from '@/services/api';
import { useSnackbar } from '@/hooks/useSnackbar';

export function useAssetDownload() {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const { showError } = useSnackbar();

  const download = useCallback(async (appointmentId: string, assetId: string) => {
    setDownloadingId(assetId);
    try {
      const { data, error } = await api.GET(
        `/v1/appointments/{appointmentId}/assets/{assetId}/download` as never,
        { params: { path: { appointmentId, assetId } } } as never,
      );
      if (error || !data) {
        showError('Failed to get download URL');
        return;
      }
      const url = (data as { downloadUrl?: string }).downloadUrl;
      if (url) window.open(url, '_blank');
    } catch {
      showError('Failed to download asset');
    } finally {
      setDownloadingId(null);
    }
  }, [showError]);

  return { download, downloadingId };
}
