import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { StatusTransitionDialog } from './StatusTransitionDialog';
import type { AppointmentStatus } from '@properfy/shared';
import type { AppointmentTransition } from '../types';

interface AppointmentTransitionActionsProps {
  transitions: AppointmentTransition[];
  onTransition: (targetStatus: AppointmentStatus, reason?: string) => void;
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
  loading = false,
}: AppointmentTransitionActionsProps) {
  const [dialogTransition, setDialogTransition] = useState<AppointmentTransition | null>(null);

  if (transitions.length === 0) return null;

  const handleClick = (transition: AppointmentTransition) => {
    if (transition.requiresReason) {
      setDialogTransition(transition);
    } else {
      onTransition(transition.targetStatus);
    }
  };

  const handleConfirm = (reason: string) => {
    if (dialogTransition) {
      onTransition(dialogTransition.targetStatus, reason);
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
              <i className={`mdi ${transition.icon} text-base`} aria-hidden="true" />
              {transition.label}
            </Button>
          );
        })}
      </div>

      {dialogTransition && (
        <StatusTransitionDialog
          open={dialogTransition !== null}
          onClose={() => setDialogTransition(null)}
          onConfirm={handleConfirm}
          title={dialogTransition.label}
          message={`Are you sure you want to transition to "${dialogTransition.label}"?`}
          variant={dialogTransition.variant === 'danger' ? 'danger' : 'warning'}
          loading={loading}
        />
      )}
    </>
  );
}
