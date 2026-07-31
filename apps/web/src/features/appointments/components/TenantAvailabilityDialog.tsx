import { useEffect, useRef, useState } from 'react';
import type { AvailableSlot } from '@properfy/shared';
import { Dialog, ConfirmDialog, Button } from '@/components/ui';
import { Checkbox } from '@/components/forms/Checkbox';
import { WeeklyAvailabilityPicker } from '@/components/forms/WeeklyAvailabilityPicker';
import { useSetRentalTenantAvailability } from '../hooks/useSetRentalTenantAvailability';

interface TenantAvailabilityDialogProps {
  open: boolean;
  appointmentId: string;
  /** Availability already on the appointment, so editing starts from it. */
  slots?: AvailableSlot[] | null;
  /**
   * Whether this actor may also decline on the tenant's behalf. False for
   * CL_ADMIN: the state machine admits only AM/OP/SYS to a `→ REJECTED` edge,
   * so offering the checkbox would promise something the server refuses.
   */
  canMarkUnavailable: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Lets an operator record the weekly availability a rental tenant gave outside
 * the portal — over the phone, by email — which until now had no way in.
 *
 * Reuses the very picker the tenant sees in the portal, so both sides of the
 * conversation are entering the same shape.
 */
export function TenantAvailabilityDialog({
  open,
  appointmentId,
  slots,
  canMarkUnavailable,
  onClose,
  onSaved,
}: TenantAvailabilityDialogProps) {
  const [value, setValue] = useState<AvailableSlot[]>([]);
  const [markUnavailable, setMarkUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { setAvailability, isSaving } = useSetRentalTenantAvailability(appointmentId, onSaved);

  // `slots` comes from React Query data, so a background refetch hands us a new
  // array identity. Keying the reset on it would wipe the operator's in-progress
  // edits mid-form, so the effect depends on `open` alone and reads the current
  // slots through a ref — the same reason `Dialog` keeps `onClose` in a ref.
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  // Reset per opening so a previous edit never leaks into the next appointment.
  useEffect(() => {
    if (!open) return;
    setValue(slotsRef.current ?? []);
    setMarkUnavailable(false);
    setError(null);
    setConfirmOpen(false);
  }, [open]);

  const submit = (decline: boolean) => {
    setConfirmOpen(false);
    setAvailability(value, decline);
  };

  const handleSave = () => {
    if (value.length === 0) {
      setError('Pick at least one day the tenant is available.');
      return;
    }
    setError(null);
    // Declining rejects the inspection and emails the agency, so it never
    // happens on a single click.
    if (markUnavailable && canMarkUnavailable) {
      setConfirmOpen(true);
      return;
    }
    submit(false);
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Set tenant availability"
        maxWidth="560px"
        actions={
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} loading={isSaving}>Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Record the days and times the tenant said they are available. This is the same
            weekly pattern they would pick in the portal.
          </p>

          <WeeklyAvailabilityPicker value={value} onChange={setValue} disabled={isSaving} />

          {error && <p className="text-sm text-error">{error}</p>}

          {canMarkUnavailable && (
            <div className="rounded border border-black/10 p-3">
              <Checkbox
                checked={markUnavailable}
                onChange={setMarkUnavailable}
                label="Also mark tenant as unavailable"
                disabled={isSaving}
              />
              <p className="mt-1 pl-7 text-xs text-warning">
                Rejects the inspection and emails the agency.
              </p>
            </div>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => submit(true)}
        title="Reject this inspection?"
        message="Marking the tenant unavailable will reject this inspection and email the agency. The availability you recorded is kept so it can be rescheduled."
        confirmLabel="Reject and save"
        variant="danger"
        loading={isSaving}
      />
    </>
  );
}
