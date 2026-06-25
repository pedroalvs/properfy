import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UseServiceRegionDeleteReturn {
  remove: () => void;
  isDeleting: boolean;
}

export function useServiceRegionDelete(
  regionId: string | null,
  onSuccess?: () => void,
): UseServiceRegionDeleteReturn {
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();

  const remove = useCallback(async () => {
    if (!regionId) return;
    setIsDeleting(true);
    try {
      const { error } = await api.DELETE(`/v1/service-regions/${regionId}` as any, {} as any);
      const apiError = error as any;

      if (apiError) {
        const message = apiError?.error?.message ?? 'Request failed';
        showError(message);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ['service-regions'] });
      showSuccess('Service region deleted successfully');
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete service region';
      showError(message);
    } finally {
      setIsDeleting(false);
    }
  }, [regionId, queryClient, showSuccess, showError, onSuccess]);

  return { remove, isDeleting };
}
