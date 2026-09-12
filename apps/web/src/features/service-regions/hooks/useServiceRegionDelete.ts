import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from '@/hooks/useSnackbar';
import { getErrorMessage } from '@/lib/api-error';

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
      const { error } = await api.DELETE('/v1/service-regions/{id}', {
        params: { path: { id: regionId } },
      });

      if (error) {
        showError(getErrorMessage(error, 'Request failed'));
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
