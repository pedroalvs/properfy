import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useSnackbar } from '@/hooks/useSnackbar';
import { getErrorMessage, toApiError } from '@/lib/api-error';

export interface UseTenantLogoReturn {
  uploadLogo: (file: File) => Promise<boolean>;
  removeLogo: () => Promise<boolean>;
  isUploading: boolean;
  isRemoving: boolean;
}

export function useTenantLogo(tenantId: string): UseTenantLogoReturn {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const uploadLogo = useCallback(
    async (file: File): Promise<boolean> => {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);

        // Multipart routes are not typed in the OpenAPI spec (mirrors the
        // appointment import preview call): pass FormData through untouched.
        const { data, error, response } = await api.POST(
          '/v1/tenants/{tenantId}/branding/logo' as any,
          {
            params: { path: { tenantId } },
            body: formData as any,
            bodySerializer: (body: any) => body,
          } as any,
        );

        if (error || !data) {
          showError(
            getErrorMessage(toApiError(error, response?.status), 'Failed to upload logo'),
          );
          return false;
        }

        await queryClient.invalidateQueries({ queryKey: ['tenant-admins'] });
        showSuccess('Logo uploaded');
        return true;
      } finally {
        setIsUploading(false);
      }
    },
    [tenantId, queryClient, showSuccess, showError],
  );

  const removeLogo = useCallback(async (): Promise<boolean> => {
    setIsRemoving(true);
    try {
      const { data, error, response } = await api.DELETE(
        '/v1/tenants/{tenantId}/branding/logo',
        { params: { path: { tenantId } } },
      );

      if (error || !data) {
        // The route schema only declares 200, so openapi-fetch types the error
        // branch as `never`; widen it for the shared error mapper.
        showError(
          getErrorMessage(
            toApiError(error as unknown, (response as Response | undefined)?.status),
            'Failed to remove logo',
          ),
        );
        return false;
      }

      await queryClient.invalidateQueries({ queryKey: ['tenant-admins'] });
      showSuccess('Logo removed');
      return true;
    } finally {
      setIsRemoving(false);
    }
  }, [tenantId, queryClient, showSuccess, showError]);

  return { uploadLogo, removeLogo, isUploading, isRemoving };
}
