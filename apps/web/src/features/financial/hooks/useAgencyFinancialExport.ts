import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';

export interface AgencyExportRange {
  fromDate?: string;
  toDate?: string;
}

/** Decodes a base64 XLSX payload and triggers a browser download. */
function downloadBase64(filename: string, contentType: string, base64: string): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface UseAgencyFinancialExportReturn {
  exportStatement: (range?: AgencyExportRange) => Promise<void>;
  isExporting: boolean;
}

/**
 * 031 — downloads the agency's own-tenant financial statement as XLSX
 * (`GET /v1/financial/export`, gated by `financial.agency_export`).
 */
export function useAgencyFinancialExport(): UseAgencyFinancialExportReturn {
  const [isExporting, setIsExporting] = useState(false);

  const exportStatement = useCallback(async (range?: AgencyExportRange) => {
    setIsExporting(true);
    try {
      const query = {
        ...(range?.fromDate ? { fromDate: range.fromDate } : {}),
        ...(range?.toDate ? { toDate: range.toDate } : {}),
      };
      const { data, error, response } = await api.GET('/v1/financial/export', {
        params: { query },
      });
      const err = error as { error?: { message?: string; code?: string } } | undefined;
      const payload = (data as { data?: { filename: string; contentType: string; contentBase64: string } } | undefined)?.data;
      if (err || !payload) {
        throw new ApiError(response.status, err?.error?.message ?? 'Export failed', err?.error?.code);
      }
      downloadBase64(payload.filename, payload.contentType, payload.contentBase64);
    } finally {
      setIsExporting(false);
    }
  }, []);

  return { exportStatement, isExporting };
}
