import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InspectorBaseAddress } from '@properfy/shared';
import { api } from '@/services/api';

interface UpdateInspectorSelfInput {
  phone?: string | null;
  address?: InspectorBaseAddress;
}

export interface UpdateInspectorSelfResult {
  /**
   * True when the base address was saved but could not be geocoded (no result,
   * timeout, or account without permanent mode). Only present when `address` was
   * sent. `/v1/inspectors/me` has no response schema, so it is read from the
   * runtime envelope rather than the (never-typed) generated response.
   */
  baseGeocodeFailed?: boolean;
}

/** A field-level issue from a 400 `VALIDATION_ERROR` (`details[]`). */
export interface ApiFieldIssue {
  path: (string | number)[];
  message: string;
}

/** Error thrown on a failed save, carrying the API `details[]` so the form can map them to fields. */
export class UpdateInspectorSelfError extends Error {
  readonly details?: ApiFieldIssue[];
  constructor(message: string, details?: ApiFieldIssue[]) {
    super(message);
    this.name = 'UpdateInspectorSelfError';
    this.details = details;
  }
}

/** PATCH /v1/inspectors/me — updates editable inspector fields (phone, base address). */
export function useUpdateInspectorSelf() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateInspectorSelfInput): Promise<UpdateInspectorSelfResult> => {
      const { data, error } = await api.PATCH('/v1/inspectors/me', { body: input });
      if (error) {
        const envelope =
          error && typeof error === 'object' && 'error' in error
            ? (error as { error?: { message?: string; details?: ApiFieldIssue[] } }).error
            : undefined;
        throw new UpdateInspectorSelfError(envelope?.message ?? 'Failed to update profile', envelope?.details);
      }
      const envelope = data as { data?: { baseGeocodeFailed?: boolean } } | undefined;
      return { baseGeocodeFailed: envelope?.data?.baseGeocodeFailed };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspector'] });
    },
  });
}
