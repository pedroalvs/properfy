import { useCallback, useMemo } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useResetUserTotp } from '../hooks/useResetUserTotp';
import type { UserScope } from '../types';

interface UserResetTotpDialogProps {
  open: boolean;
  userId: string | null;
  userName?: string | null;
  /** Target role — an AM target is warned they must re-enrol at next login. */
  userRole?: string | null;
  tenantId?: string;
  scope?: UserScope;
  onClose: () => void;
  onReset?: () => void;
}

/**
 * Admin action to reset another user's 2FA (lost-authenticator recovery). Clears
 * their secret and revokes their sessions. Mirrors {@link UserResetPasswordDialog}.
 */
export function UserResetTotpDialog({
  open,
  userId,
  userName,
  userRole,
  tenantId,
  scope = 'tenant',
  onClose,
  onReset,
}: UserResetTotpDialogProps) {
  const { showSuccess, showError } = useSnackbar();
  const { resetTotp, isResetting } = useResetUserTotp(tenantId, scope);

  const title = useMemo(
    () => `Reset two-factor authentication${userName ? `: ${userName}` : ''}`,
    [userName],
  );

  const handleSubmit = useCallback(async () => {
    if (!userId) return;
    const result = await resetTotp(userId);
    if (!result.success) {
      showError(result.error ?? 'Failed to reset 2FA');
      return;
    }
    showSuccess('Two-factor authentication reset. Existing sessions were revoked.');
    onReset?.();
    onClose();
  }, [userId, resetTotp, showError, showSuccess, onReset, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      actions={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={isResetting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={isResetting}>
            Reset 2FA
          </Button>
        </>
      )}
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">
          This turns off two-factor authentication for this user and signs them out of all active
          sessions. Use it when they have lost access to their authenticator app.
        </p>
        {userRole === 'AM' && (
          <p className="text-sm text-text-muted">
            This user is an admin, so two-factor authentication is required — they&apos;ll be
            prompted to set it up again the next time they sign in.
          </p>
        )}
      </div>
    </Dialog>
  );
}
