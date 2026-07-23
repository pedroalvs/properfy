import { ConfirmationSheet } from './ConfirmationSheet';

interface PastTimeConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function PastTimeConfirmModal({ onConfirm, onCancel }: PastTimeConfirmModalProps) {
  return (
    <ConfirmationSheet
      icon="mdi-clock-alert-outline"
      iconClassName="text-warning"
      title="This inspection is past its scheduled time. Complete it anyway?"
      confirmLabel="Complete anyway"
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onCancel={onCancel}
      testId="past-time-confirm-modal"
      confirmTestId="past-time-confirm"
      cancelTestId="past-time-cancel"
    />
  );
}
