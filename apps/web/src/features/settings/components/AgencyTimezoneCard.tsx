import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { TimezoneSelect } from '@/components/forms/TimezoneSelect';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useAuth } from '@/hooks/useAuth';
import { useUpdateAgencyTimezone } from '../hooks/useUpdateAgencyTimezone';

/**
 * Agency timezone editor for CL_ADMIN. Saving is gated behind a confirmation
 * dialog because the change affects every user of the agency, reminder send
 * times and date boundaries.
 */
export function AgencyTimezoneCard() {
  const { user, refreshUser } = useAuth();
  const { updateTimezone, isSaving } = useUpdateAgencyTimezone();
  const { showSuccess, showError } = useSnackbar();
  const queryClient = useQueryClient();
  // CL_* users have no personal override, so the effective timezone IS the agency's.
  const [timezone, setTimezone] = useState(user?.timezone ?? '');
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    setTimezone(user?.timezone ?? '');
  }, [user?.timezone]);

  const handleConfirm = useCallback(async () => {
    if (!user?.tenantId || !timezone) return;
    const result = await updateTimezone(user.tenantId, timezone);
    setShowConfirm(false);
    if (result.success) {
      await refreshUser();
      // Every dated payload on screen may now render differently.
      queryClient.invalidateQueries();
      showSuccess('Agency timezone updated');
    } else {
      showError(result.error ?? 'Failed to update timezone');
    }
  }, [user?.tenantId, timezone, updateTimezone, refreshUser, queryClient, showSuccess, showError]);

  return (
    <div className="rounded bg-card-bg p-6 shadow-sm">
      <FormSection title="Agency Timezone">
        <div className="flex max-w-md flex-col gap-4">
          <FormField label="Timezone">
            <TimezoneSelect
              value={timezone}
              onChange={setTimezone}
              placeholder="Search timezones"
              aria-label="Agency timezone"
            />
          </FormField>
          <div>
            <Button
              variant="primary"
              loading={isSaving}
              disabled={!timezone || timezone === user?.timezone}
              onClick={() => setShowConfirm(true)}
            >
              Save
            </Button>
          </div>
        </div>
      </FormSection>

      <ConfirmDialog
        open={showConfirm}
        title="Change agency timezone?"
        message="This changes the timezone for ALL users of this agency. Reminder send times and date boundaries will follow the new timezone."
        confirmLabel="Change timezone"
        cancelLabel="Cancel"
        variant="warning"
        loading={isSaving}
        onConfirm={handleConfirm}
        onClose={() => setShowConfirm(false)}
      />
    </div>
  );
}
