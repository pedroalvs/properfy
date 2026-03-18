import { Button } from '@/components/ui/Button';

interface LeaveWarningModalProps {
  onStay: () => void;
  onLeave: () => void;
}

export function LeaveWarningModal({ onStay, onLeave }: LeaveWarningModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      data-testid="leave-warning-modal"
    >
      <div className="w-full max-w-lg rounded-t-2xl bg-card-bg p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <i className="mdi mdi-alert-circle text-[40px] text-warning" aria-hidden="true" />
          <h2 className="text-lg font-bold text-text-primary">Leave inspection?</h2>
          <p className="text-sm text-text-secondary">
            You have an inspection in progress. Your data is saved locally and you can resume later.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Button
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
