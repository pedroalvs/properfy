import { ConfirmationSheet } from './ConfirmationSheet';

interface SyncConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function SyncConfirmModal({ onConfirm, onCancel }: SyncConfirmModalProps) {
  return (
    <ConfirmationSheet
      icon="mdi-sync"
      iconClassName="text-primary"
      title="Is this inspection synced to the Inspection App?"
      description="If not, sync it in the Inspection App first, then come back to complete."
      confirmLabel="Yes, it's synced"
      cancelLabel="No, not yet"
      onConfirm={onConfirm}
      onCancel={onCancel}
      testId="sync-confirm-modal"
      confirmTestId="sync-confirm-yes"
      cancelTestId="sync-confirm-no"
    />
  );
}
