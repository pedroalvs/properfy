import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface EmailAsset {
  id: string;
  tenantId: string | null;
  placeholderKey: string;
  publicUrl: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  status: string;
  everSent: boolean;
  uploadedByUserId: string;
  createdAt: string;
}

export interface UseEmailAssetsReturn {
  assets: EmailAsset[];
  isLoading: boolean;
  fetchAssets: () => Promise<void>;
  requestUpload: (params: { placeholderKey: string; filename: string; contentType: string; sizeBytes: number }) => Promise<{ id: string; uploadUrl: string } | null>;
  confirmUpload: (assetId: string, file: File) => Promise<EmailAsset | null>;
  deleteAsset: (assetId: string) => Promise<{ everSent: boolean } | null>;
  editBinding: (assetId: string, bindingId: string, data: { altText?: string; width?: number; height?: number }) => Promise<void>;
}

export function useEmailAssets(tenantId?: string | null): UseEmailAssetsReturn {
  const [assets, setAssets] = useState<EmailAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();

  type ApiMethod = (url: string, opts?: unknown) => Promise<{ data?: unknown; error?: unknown }>;
  type ApiRecord = { GET: ApiMethod; POST: ApiMethod; PATCH: ApiMethod; PUT: ApiMethod; DELETE: ApiMethod };
  const getApi = useCallback(async (): Promise<ApiRecord> => {
    const { api } = await import('@/services/api');
    return api as unknown as ApiRecord;
  }, []);

  const fetchAssets = useCallback(async () => {
    setIsLoading(true);
    try {
      const api = await getApi();
      const qs = tenantId ? `?tenantId=${tenantId}` : '';
      const result = await api.GET(`/v1/email-assets${qs}`);
      if (!result.error && result.data) {
        const d = result.data as { data?: EmailAsset[] };
        setAssets(d.data ?? []);
      }
    } catch {
      // keep stale
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, getApi]);

  const requestUpload = useCallback(async (params: {
    placeholderKey: string; filename: string; contentType: string; sizeBytes: number;
  }) => {
    try {
      const api = await getApi();
      const result = await api.POST('/v1/email-assets', {
        body: { ...params, tenantId: tenantId ?? undefined },
      });
      if (result.error) return null;
      return (result.data as { data?: { id: string; uploadUrl: string } }).data ?? null;
    } catch {
      return null;
    }
  }, [tenantId, getApi]);

  const confirmUpload = useCallback(async (assetId: string, _file: File): Promise<EmailAsset | null> => {
    try {
      // 1. Upload the file to the presigned URL (done by caller before this)
      // 2. Confirm with the backend
      const api = await getApi();
      const result = await api.POST(`/v1/email-assets/${assetId}/confirm`);
      if (result.error) return null;
      const confirmed = (result.data as { data?: EmailAsset }).data ?? null;
      void queryClient.invalidateQueries({ queryKey: ['email-assets'] });
      return confirmed;
    } catch {
      return null;
    }
  }, [getApi, queryClient]);

  const deleteAsset = useCallback(async (assetId: string): Promise<{ everSent: boolean } | null> => {
    try {
      const api = await getApi();
      const result = await api.DELETE(`/v1/email-assets/${assetId}`, { body: { confirm: true } });
      if (result.error) return null;
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
      return (result.data as { data?: { everSent: boolean } }).data ?? null;
    } catch {
      return null;
    }
  }, [getApi]);

  const editBinding = useCallback(async (assetId: string, bindingId: string, data: { altText?: string; width?: number; height?: number }) => {
    const api = await getApi();
    await api.PATCH(`/v1/email-assets/${assetId}/bindings/${bindingId}`, { body: data });
  }, [getApi]);

  return { assets, isLoading, fetchAssets, requestUpload, confirmUpload, deleteAsset, editBinding };
}
