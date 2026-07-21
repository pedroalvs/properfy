import { Button } from '@/components/ui/Button';

interface SyncConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function SyncConfirmModal({ onConfirm, onCancel }: SyncConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      data-testid="sync-confirm-modal"
    >
      <div className="w-full max-w-lg rounded-t-2xl bg-card-bg p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <i className="mdi mdi-sync text-[40px] text-primary" aria-hidden="true" />
          <h2 className="text-lg font-bold text-text-primary">
            Is this inspection synced to the Inspection App?
          </h2>
          <p className="text-sm text-text-secondary">
            If not, sync it in the Inspection App first, then come back to complete.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={onConfirm}
            className="!w-full !min-h-touch"
            data-testid="sync-confirm-yes"
          >
            Yes, it&apos;s synced
          </Button>
          <Button
            variant="outlined"
            onClick={onCancel}
            className="!w-full !min-h-touch"
            data-testid="sync-confirm-no"
          >
            No, not yet
          </Button>
        </div>
      </div>
    </div>
  );
}
