import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';

export interface DeleteResult {
  success: boolean;
  error?: string;
}

export interface UseTemplateDeleteReturn {
  deleteTemplate: (templateId: string) => Promise<DeleteResult>;
  isDeleting: boolean;
}

export function useTemplateDelete(): UseTemplateDeleteReturn {
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();

  const deleteTemplate = useCallback(async (templateId: string): Promise<DeleteResult> => {
    setIsDeleting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (api as any).DELETE(`/v1/notification-templates/${templateId}`);
      if (error) {
        const errObj = error as { error?: { message?: string } };
        return { success: false, error: errObj.error?.message ?? 'Request failed' };
      }
      queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to delete' };
    } finally {
      setIsDeleting(false);
    }
  }, [queryClient]);

  return { deleteTemplate, isDeleting };
}
