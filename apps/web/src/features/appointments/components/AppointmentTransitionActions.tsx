import { useState } from 'react';
import { cn } from '@properfy/frontend-standards';
import { Button } from '@/components/ui/Button';
import { StatusTransitionDialog } from './StatusTransitionDialog';
import type { StatusTransitionConfirmPayload } from './StatusTransitionDialog';
import type { AppointmentStatus } from '@properfy/shared';
import type { AppointmentTransition } from '../types';

interface AppointmentTransitionActionsProps {
  transitions: AppointmentTransition[];
  /**
   * Runs the transition. May resolve to an error message (kept open, shown in the
   * dialog) or to `null`/`undefined`/void on success (dialog closes). A void
   * return is treated as success for callers that don't report errors back.
   */
  onTransition: (
    targetStatus: AppointmentStatus,
    reason?: string,
    reasonCode?: string,
    notifyRentalTenant?: boolean,
  ) => void | Promise<string | null>;
  /** The appointment's current status — drives the dialog's rejection reason options (F07-3). */
  currentStatus?: AppointmentStatus;
  /** Passed through to the dialog to gate the "notify the tenant" checkbox. */
  rentalTenantNotified?: boolean;
  loading?: boolean;
}

const variantToButtonClass: Record<AppointmentTransition['variant'], string> = {
  primary: '',
  outlined: '',
  danger: 'bg-error text-white hover:brightness-95 active:brightness-90',
  warning: 'bg-warning text-white hover:brightness-95 active:brightness-90',
};

function getButtonVariant(variant: AppointmentTransition['variant']): 'primary' | 'outlined' {
  if (variant === 'primary') return 'primary';
  if (variant === 'outlined') return 'outlined';
  return 'primary';
}

export function AppointmentTransitionActions({
  transitions,
  onTransition,
  currentStatus,
  rentalTenantNotified = false,
  loading = false,
}: AppointmentTransitionActionsProps) {
  const [dialogTransition, setDialogTransition] = useState<AppointmentTransition | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  if (transitions.length === 0) return null;

  const openDialog = (transition: AppointmentTransition | null) => {
    setDialogError(null);
    setDialogTransition(transition);
  };

  const handleClick = (transition: AppointmentTransition) => {
    if (transition.requiresReason) {
      openDialog(transition);
    } else {
      onTransition(transition.targetStatus);
    }
  };

  const handleConfirm = ({
    reason,
    reasonCode,
    notifyRentalTenant,
  }: StatusTransitionConfirmPayload) => {
    if (!dialogTransition) return;
    setDialogError(null);
    const result = onTransition(dialogTransition.targetStatus, reason, reasonCode, notifyRentalTenant);
    // A returned message means the server refused (e.g. 422 wrong-origin reason):
    // keep the dialog open and show it. `null`/`undefined`/void is success → close.
    // Awaiting only a real promise keeps void callers synchronous (no act warning).
    if (result && typeof (result as Promise<string | null>).then === 'function') {
      void (result as Promise<string | null>).then((message) => {
        if (message) setDialogError(message);
        else setDialogTransition(null);
      });
    } else {
      setDialogTransition(null);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {transitions.map((transition) => {
          const extraClass = variantToButtonClass[transition.variant];
          const buttonVariant = getButtonVariant(transition.variant);

          return (
            <Button
              key={transition.targetStatus}
              variant={buttonVariant}
              disabled={loading}
              className={extraClass}
              onClick={() => handleClick(transition)}
            >
              <i className={cn('mdi', transition.icon, 'text-base')} aria-hidden="true" />
              {transition.label}
            </Button>
          );
        })}
      </div>

      {dialogTransition && (
        <StatusTransitionDialog
          open={dialogTransition !== null}
          onClose={() => openDialog(null)}
          onConfirm={handleConfirm}
          title={dialogTransition.label}
          message={`Are you sure you want to transition to "${dialogTransition.label}"?`}
          variant={dialogTransition.variant === 'danger' ? 'danger' : 'warning'}
          targetStatus={dialogTransition.targetStatus}
          currentStatus={currentStatus}
          error={dialogError ?? undefined}
          rentalTenantNotified={rentalTenantNotified}
          loading={loading}
        />
      )}
    </>
  );
}
