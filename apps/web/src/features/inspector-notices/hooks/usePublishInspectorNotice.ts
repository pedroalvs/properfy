import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createIdempotencyKeyManager } from '@properfy/shared';
import type { PublishInspectorNoticeInput } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError, type ApiError } from '@/lib/api-error';

export interface PublishInspectorNoticeResult {
  id: string;
  recipientCount: number;
}

export interface UsePublishInspectorNoticeReturn {
  publish: (input: PublishInspectorNoticeInput) => Promise<PublishInspectorNoticeResult>;
  isPending: boolean;
  error: ApiError | null;
  /** Rotate the Idempotency-Key — called when the drawer (re)opens so each new
   * notice gets a fresh key, while a retry of the same submission reuses it. */
  resetKey: () => void;
}

/**
 * Publishes an inspector notice. The `Idempotency-Key` is stable across retries
 * of the same submission (D16) and rotated on success or when the drawer reopens,
 * so a double-click or a lost response never creates two notices.
 */
export function usePublishInspectorNotice(): UsePublishInspectorNoticeReturn {
  const queryClient = useQueryClient();
  const idempotencyKey = useRef(createIdempotencyKeyManager());

  const mutation = useMutation<PublishInspectorNoticeResult, ApiError, PublishInspectorNoticeInput>({
    mutationFn: async (input) => {
      const { data, error, response } = await api.POST('/v1/inspector-notices', {
        body: input,
        headers: { 'Idempotency-Key': idempotencyKey.current.current() },
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return (data as { data: PublishInspectorNoticeResult }).data;
    },
    onSuccess: () => {
      idempotencyKey.current.rotate();
      queryClient.invalidateQueries({ queryKey: ['inspector-notices'] });
    },
  });

  return {
    publish: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
    resetKey: () => idempotencyKey.current.rotate(),
  };
}
