import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';

interface LeaveWarningModalProps {
  onStay: () => void;
  onLeave: () => void;
}

const TITLE_ID = 'leave-warning-modal-title';
const DESCRIPTION_ID = 'leave-warning-modal-description';

export function LeaveWarningModal({ onStay, onLeave }: LeaveWarningModalProps) {
  const stayButtonRef = useRef<HTMLButtonElement>(null);
  // Depend on a boolean (this component is only ever mounted while "open"),
  // not a recreated callback — see project_dialog_focus_steal_oncloseref.
  const isOpen = true;

  useEffect(() => {
    if (isOpen) stayButtonRef.current?.focus();
  }, [isOpen]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      data-testid="leave-warning-modal"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      aria-describedby={DESCRIPTION_ID}
    >
      <div className="w-full max-w-lg rounded-t-2xl bg-card-bg p-6 pb-safe-b-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <i className="mdi mdi-alert-circle text-[40px] text-warning" aria-hidden="true" />
          <h2 id={TITLE_ID} className="text-lg font-bold text-text-primary">Leave inspection?</h2>
          <p id={DESCRIPTION_ID} className="text-sm text-text-secondary">
            You have an inspection in progress. Your data is saved locally and you can resume later.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Button
            ref={stayButtonRef}
            variant="primary"
            onClick={onStay}
            className="!w-full !min-h-touch"
            data-testid="stay-button"
          >
            Stay
          </Button>
          <Button
            variant="outlined"
            onClick={onLeave}
            className="!w-full !min-h-touch !text-error !border-error"
            data-testid="leave-button"
          >
            Leave anyway
          </Button>
        </div>
      </div>
    </div>
  );
}
