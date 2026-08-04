import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';
import { toAppointmentListParams } from './useAppointmentList';
import type { AppointmentFiltersState } from '../types';

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

export interface UseAppointmentExportReturn {
  exportAppointments: (filters: AppointmentFiltersState) => Promise<void>;
  isExporting: boolean;
}

/**
 * Downloads the current appointments list as XLSX (`GET /v1/appointments/export`).
 *
 * Filters are mapped through `toAppointmentListParams` — the same function the
 * list query uses — so the file is exactly the rows on screen, not a re-derived
 * approximation of them. Pagination is intentionally not sent: the export is the
 * whole filtered set (server-capped), not the visible page.
 */
export function useAppointmentExport(): UseAppointmentExportReturn {
  const [isExporting, setIsExporting] = useState(false);

  const exportAppointments = useCallback(async (filters: AppointmentFiltersState) => {
    setIsExporting(true);
    try {
      const { data, error, response } = await api.GET('/v1/appointments/export', {
        params: { query: toAppointmentListParams(filters) },
      });
      const err = error as { error?: { message?: string; code?: string } } | undefined;
      const payload = (
        data as { data?: { filename: string; contentType: string; contentBase64: string } } | undefined
      )?.data;
      if (err || !payload) {
        throw new ApiError(response.status, err?.error?.message ?? 'Export failed', err?.error?.code);
      }
      downloadBase64(payload.filename, payload.contentType, payload.contentBase64);
    } finally {
      setIsExporting(false);
    }
  }, []);

  return { exportAppointments, isExporting };
}
