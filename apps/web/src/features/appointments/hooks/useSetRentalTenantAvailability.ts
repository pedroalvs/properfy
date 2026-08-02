import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AvailableSlot } from '@properfy/shared';
import { useSnackbar } from '@/hooks/useSnackbar';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';

export interface UseSetRentalTenantAvailabilityReturn {
  setAvailability: (slots: AvailableSlot[], markUnavailable: boolean) => void;
  isSaving: boolean;
}

/**
 * Records the weekly availability a rental tenant gave outside the portal.
 *
 * Invalidates both `['appointments']` and `['appointments', id]`: the list and
 * map and detail responses both expose the flattened `rentalTenantAvailableSlots`.
 */
export function useSetRentalTenantAvailability(
  appointmentId: string | null,
  onSuccess?: () => void,
): UseSetRentalTenantAvailabilityReturn {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();
  const pendingDecline = useRef<{ fingerprint: string; key: string } | null>(null);

  const mutation = useMutation({
    mutationFn: async ({
      body,
      idempotencyKey,
    }: {
      body: { availableSlots: AvailableSlot[]; markUnavailable: boolean };
      idempotencyKey?: string;
    }) => {
      const { data, error, response } = await api.POST(
        `/v1/appointments/${appointmentId}/rental-tenant-availability` as any,
        {
          body: body as any,
          ...(idempotencyKey
            ? { headers: { 'Idempotency-Key': idempotencyKey } }
            : {}),
        },
      );
      if (error) throw toApiError(error, response?.status);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointments', appointmentId] });
      queryClient.invalidateQueries({ queryKey: ['appointments-map'] });
    },
  });

  const setAvailability = (availableSlots: AvailableSlot[], markUnavailable: boolean) => {
    if (!appointmentId) return;
    const body = { availableSlots, markUnavailable };
    const fingerprint = JSON.stringify({ appointmentId, ...body });
    let idempotencyKey: string | undefined;
    if (markUnavailable) {
      if (pendingDecline.current?.fingerprint !== fingerprint) {
        pendingDecline.current = { fingerprint, key: crypto.randomUUID() };
      }
      idempotencyKey = pendingDecline.current.key;
    }
    mutation.mutate(
      { body, idempotencyKey },
      {
        onSuccess: () => {
          if (pendingDecline.current?.key === idempotencyKey) {
            pendingDecline.current = null;
          }
          showSuccess(
            markUnavailable
              ? 'Availability saved and the inspection was rejected'
              : 'Tenant availability saved',
          );
          onSuccess?.();
        },
        onError: (err) => {
          showError(err.message || 'Failed to save tenant availability');
        },
      },
    );
  };

  return { setAvailability, isSaving: mutation.isPending };
}
