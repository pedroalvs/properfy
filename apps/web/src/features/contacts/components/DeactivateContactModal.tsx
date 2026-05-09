import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface DeactivateContactModalProps {
  open: boolean;
  contactName: string | null;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeactivateContactModal({
  open,
  contactName,
  loading,
  onClose,
  onConfirm,
}: DeactivateContactModalProps) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Deactivate contact"
      confirmLabel="Deactivate"
      variant="warning"
      loading={loading}
      message={
        <>
          <p>
            Deactivate <strong>{contactName ?? 'this contact'}</strong>? They will no longer
            appear in the active list and cannot be linked to new appointments.
          </p>
          <p className="mt-2 text-xs text-muted">
            Existing appointments keep the contact snapshot taken at link time. The
            contact record can be reactivated at any time.
          </p>
        </>
      }
    />
  );
}
