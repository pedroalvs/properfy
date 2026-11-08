import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createIdempotencyKeyManager } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';
import { useSnackbar } from '@/hooks/useSnackbar';
import { resolveFileErrorMessage } from '../lib/file-errors';

export interface CreatePropertyIssueInput {
  propertyId: string;
  appointmentId?: string;
  reason: string;
  /** Ids of photos already presigned → PUT → confirmed (PENDING, linked READY on create). */
  photoFileIds: string[];
}

export interface UseCreatePropertyIssueReturn {
  create: (input: CreatePropertyIssueInput) => Promise<boolean>;
  isCreating: boolean;
}

/**
 * Create an issue (`POST /v1/property-issues`, F10). Requires an `Idempotency-Key`
 * (D24) — stable per attempt via the shared manager, rotated only on success so a
 * retry after a timeout does not duplicate the issue. Photos are uploaded one at a
 * time by the drawer (presign → PUT → confirm); only the confirmed ids are passed
 * here, and the backend links them READY in one transaction (D20). Invalidates the
 * `property-issues` prefix (lists + unseen-count) and the two list prefixes.
 */
export function useCreatePropertyIssue(): UseCreatePropertyIssueReturn {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();
  const idempotency = useRef(createIdempotencyKeyManager());
  const [isCreating, setIsCreating] = useState(false);

  const create = useCallback(
    async (input: CreatePropertyIssueInput): Promise<boolean> => {
      setIsCreating(true);
      try {
        const { error, response } = await api.POST('/v1/property-issues', {
          body: {
            propertyId: input.propertyId,
            appointmentId: input.appointmentId,
            reason: input.reason,
            photoFileIds: input.photoFileIds.length > 0 ? input.photoFileIds : undefined,
          },
          headers: { 'Idempotency-Key': idempotency.current.current() },
        });
        if (error) throw toApiError(error, (response as Response | undefined)?.status);
        idempotency.current.rotate();
        await queryClient.invalidateQueries({ queryKey: ['property-issues'] });
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
        queryClient.invalidateQueries({ queryKey: ['properties'] });
        showSuccess('Issue reported');
        return true;
      } catch (err) {
        showError(resolveFileErrorMessage(err, 'Could not report the issue'));
        return false;
      } finally {
        setIsCreating(false);
      }
    },
    [queryClient, showSuccess, showError],
  );

  return { create, isCreating };
}
