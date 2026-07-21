import { Button } from '@/components/ui/Button';

interface PastTimeConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function PastTimeConfirmModal({ onConfirm, onCancel }: PastTimeConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      data-testid="past-time-confirm-modal"
    >
      <div className="w-full max-w-lg rounded-t-2xl bg-card-bg p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <i className="mdi mdi-clock-alert-outline text-[40px] text-warning" aria-hidden="true" />
          <h2 className="text-lg font-bold text-text-primary">
            This inspection is past its scheduled time. Complete it anyway?
          </h2>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={onConfirm}
            className="!w-full !min-h-touch"
            data-testid="past-time-confirm"
          >
            Complete anyway
          </Button>
          <Button
            variant="outlined"
            onClick={onCancel}
            className="!w-full !min-h-touch"
            data-testid="past-time-cancel"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
