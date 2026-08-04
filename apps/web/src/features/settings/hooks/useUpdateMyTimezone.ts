import { useState, useCallback } from 'react';
import { api } from '@/services/api';

export interface SaveResult {
  success: boolean;
  error?: string;
}

export interface UseUpdateMyTimezoneReturn {
  /** PATCH /v1/me with the personal timezone (null clears the override). */
  updateTimezone: (timezone: string | null) => Promise<SaveResult>;
  isSaving: boolean;
}

/**
 * Personal timezone preference (AM/OP/INSP only — the backend returns 403 for
 * CL_* roles, which inherit their agency's timezone).
 */
export function useUpdateMyTimezone(): UseUpdateMyTimezoneReturn {
  const [isSaving, setIsSaving] = useState(false);

  const updateTimezone = useCallback(async (timezone: string | null): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      const { error } = await api.PATCH('/v1/me' as any, { body: { timezone } as any });
      if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update timezone';
      return { success: false, error: message };
    } finally {
      setIsSaving(false);
    }
  }, []);

  return { updateTimezone, isSaving };
}
