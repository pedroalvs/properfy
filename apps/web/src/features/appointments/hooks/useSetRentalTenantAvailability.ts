import type { AvailableSlot } from '@properfy/shared';
import { useActionMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UseSetRentalTenantAvailabilityReturn {
  setAvailability: (slots: AvailableSlot[], markUnavailable: boolean) => void;
  isSaving: boolean;
}

/**
 * Records the weekly availability a rental tenant gave outside the portal.
 *
 * Invalidates both `['appointments']` and `['appointments', id]`: the list and
 * map read the flattened `rentalTenantAvailableSlots`, while the detail page
 * reads it nested under `restrictions[].availableSlotsJson`.
 */
export function useSetRentalTenantAvailability(
  appointmentId: string | null,
  onSuccess?: () => void,
): UseSetRentalTenantAvailabilityReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useActionMutation(
    `/v1/appointments/${appointmentId}/rental-tenant-availability`,
    [['appointments'], ['appointments', appointmentId]],
  );

  const setAvailability = (availableSlots: AvailableSlot[], markUnavailable: boolean) => {
    if (!appointmentId) return;
    mutation.mutate(
      { availableSlots, markUnavailable },
      {
        onSuccess: () => {
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
