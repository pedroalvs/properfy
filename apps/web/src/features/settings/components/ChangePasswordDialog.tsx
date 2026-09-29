import { Dialog } from '@/components/ui/Dialog';
import { ChangePasswordForm } from './ChangePasswordForm';

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Wraps {@link ChangePasswordForm} in a modal for the account Security tab. The
 * form keeps its own submit + logout-on-success behaviour; a successful change
 * signs the user out, which dismisses the dialog with the rest of the app.
 */
export function ChangePasswordDialog({ open, onClose }: ChangePasswordDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Change password">
      <ChangePasswordForm embedded />
    </Dialog>
  );
}
