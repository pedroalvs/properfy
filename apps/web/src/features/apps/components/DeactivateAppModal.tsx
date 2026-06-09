import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface DeactivateAppModalProps {
  open: boolean;
  appName: string | null;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeactivateAppModal({ open, appName, loading, onClose, onConfirm }: DeactivateAppModalProps) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Deactivate app"
      confirmLabel="Deactivate"
      variant="warning"
      loading={loading}
      message={
        <>
          <p>
            Deactivate <strong>{appName ?? 'this app'}</strong>? It will no longer appear in the
            active list and cannot be linked to new appointments.
          </p>
          <p className="mt-2 text-xs text-muted">
            Appointments already linked keep referencing it. The app can be reactivated at any time.
          </p>
        </>
      }
    />
  );
}
