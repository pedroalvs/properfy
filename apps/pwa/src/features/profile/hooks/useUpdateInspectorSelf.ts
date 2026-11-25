import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InspectorBaseAddress, AddressNotVerifiedReason } from '@properfy/shared';
import { ADDRESS_NOT_VERIFIED_CODE, ADDRESS_NOT_VERIFIED_REASONS } from '@properfy/shared';
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
  /**
   * V-3: set when the save was rejected with a 422 ADDRESS_NOT_VERIFIED, so the
   * base-address card can show the matching per-reason copy instead of a generic
   * error.
   */
  readonly addressNotVerifiedReason?: AddressNotVerifiedReason;
  constructor(
    message: string,
    details?: ApiFieldIssue[],
    addressNotVerifiedReason?: AddressNotVerifiedReason,
  ) {
    super(message);
    this.name = 'UpdateInspectorSelfError';
    this.details = details;
    this.addressNotVerifiedReason = addressNotVerifiedReason;
  }
}

/** Read a 422 ADDRESS_NOT_VERIFIED reason off the error envelope, if present. */
function readAddressNotVerifiedReason(
  envelope: { code?: string; details?: unknown } | undefined,
): AddressNotVerifiedReason | undefined {
  if (envelope?.code !== ADDRESS_NOT_VERIFIED_CODE) return undefined;
  const details = Array.isArray(envelope.details) ? envelope.details : [];
  const reason = (details[0] as { reason?: string } | undefined)?.reason;
  return ADDRESS_NOT_VERIFIED_REASONS.includes(reason as AddressNotVerifiedReason)
    ? (reason as AddressNotVerifiedReason)
    : undefined;
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
            ? (error as { error?: { code?: string; message?: string; details?: ApiFieldIssue[] } }).error
            : undefined;
        throw new UpdateInspectorSelfError(
          envelope?.message ?? 'Failed to update profile',
          envelope?.details,
          readAddressNotVerifiedReason(envelope),
        );
      }
      const envelope = data as { data?: { baseGeocodeFailed?: boolean } } | undefined;
      return { baseGeocodeFailed: envelope?.data?.baseGeocodeFailed };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspector'] });
    },
  });
}
