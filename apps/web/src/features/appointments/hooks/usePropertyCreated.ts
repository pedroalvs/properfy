import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AppointmentFormData, AppointmentFormErrors } from '../types';

/**
 * Shared onCreated handler for the inline PropertyFormDrawer in the
 * appointment create flows: refetches every property options list so the new
 * property shows up, auto-selects it in the form and clears its field error.
 */
export function usePropertyCreated(
  setForm: Dispatch<SetStateAction<AppointmentFormData>>,
  setErrors: Dispatch<SetStateAction<AppointmentFormErrors>>,
): (propertyId: string) => void {
  const queryClient = useQueryClient();
  return useCallback(
    (propertyId: string) => {
      void queryClient.invalidateQueries({ queryKey: ['properties'] });
      setForm((prev) => ({ ...prev, propertyId }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next.propertyId;
        return next;
      });
    },
    [queryClient, setForm, setErrors],
  );
}
