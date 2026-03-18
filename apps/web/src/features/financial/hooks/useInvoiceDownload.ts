import { useState, useCallback } from 'react';
import { api } from '@/services/api';

export interface UseInvoiceDownloadReturn {
  download: (invoiceId: string) => Promise<void>;
  isDownloading: boolean;
}

export function useInvoiceDownload(): UseInvoiceDownloadReturn {
  const [isDownloading, setIsDownloading] = useState(false);

  const download = useCallback(async (invoiceId: string) => {
    setIsDownloading(true);
    try {
      const { data, error } = await api.GET(`/v1/billing/invoices/${invoiceId}/download` as any, {});
      if (error) throw new Error((error as any)?.error?.message ?? 'Download failed');

      const response = data as unknown as { downloadUrl: string };
      if (response?.downloadUrl) {
        window.open(response.downloadUrl, '_blank');
      }
    } finally {
      setIsDownloading(false);
    }
  }, []);

  return { download, isDownloading };
}
