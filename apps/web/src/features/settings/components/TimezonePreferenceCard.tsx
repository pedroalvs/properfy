import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { TimezoneSelect } from '@/components/forms/TimezoneSelect';
import { Button } from '@/components/ui/Button';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useAuth } from '@/hooks/useAuth';
import { useUpdateMyTimezone } from '../hooks/useUpdateMyTimezone';

/**
 * Personal timezone preference for cross-tenant roles (AM/OP/INSP). Empty
 * means "no override" — the platform default applies.
 */
export function TimezonePreferenceCard() {
  const { user, refreshUser } = useAuth();
  const { updateTimezone, isSaving } = useUpdateMyTimezone();
  const { showSuccess, showError } = useSnackbar();
  const queryClient = useQueryClient();
  const [timezone, setTimezone] = useState(user?.personalTimezone ?? '');

  // Track the profile as it hydrates/refreshes (login lands before /v1/me).
  useEffect(() => {
    setTimezone(user?.personalTimezone ?? '');
  }, [user?.personalTimezone]);

  const handleSave = useCallback(async () => {
    const result = await updateTimezone(timezone || null);
    if (result.success) {
      await refreshUser();
      // Every dated payload on screen may now render differently.
      queryClient.invalidateQueries();
      showSuccess('Timezone preference saved');
    } else {
      showError(result.error ?? 'Failed to update timezone');
    }
  }, [timezone, updateTimezone, refreshUser, queryClient, showSuccess, showError]);

  return (
    <div className="rounded bg-card-bg p-6 shadow-sm">
      <FormSection title="Timezone Preference">
        <div className="flex max-w-md flex-col gap-4">
          <FormField
            label="Timezone"
            hint="Leave empty to use the platform default (Australia/Sydney)."
          >
            <TimezoneSelect
              value={timezone}
              onChange={setTimezone}
              placeholder="Platform default"
              aria-label="Timezone"
            />
          </FormField>
          <div>
            <Button variant="primary" loading={isSaving} onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </FormSection>
    </div>
  );
}
