import { useState, useCallback } from 'react';
import { api } from '@/services/api';

export interface SaveResult {
  success: boolean;
  error?: string;
}

export interface UseUpdateAgencyTimezoneReturn {
  /** PATCH /v1/tenants/:tenantId with the agency timezone. */
  updateTimezone: (tenantId: string, timezone: string) => Promise<SaveResult>;
  isSaving: boolean;
}

/**
 * Agency timezone (CL_ADMIN on its own tenant; AM anywhere). Changes the
 * effective timezone for every user of the agency.
 */
export function useUpdateAgencyTimezone(): UseUpdateAgencyTimezoneReturn {
  const [isSaving, setIsSaving] = useState(false);

  const updateTimezone = useCallback(
    async (tenantId: string, timezone: string): Promise<SaveResult> => {
      setIsSaving(true);
      try {
        const { error } = await api.PATCH('/v1/tenants/{tenantId}', {
          params: { path: { tenantId } },
          body: { timezone },
        });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update timezone';
        return { success: false, error: message };
      } finally {
        setIsSaving(false);
      }
    },
    [],
  );

  return { updateTimezone, isSaving };
}
