import { useState, useCallback } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/forms/Textarea';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useAuth } from '@/hooks/useAuth';
import { useUserDetail } from '../hooks/useUserDetail';
import { useUserDeactivate } from '../hooks/useUserDeactivate';
import { UserStatusChip } from './UserStatusChip';
import { UserDetailSections } from './UserDetailSections';
import type { UserScope } from '../types';

interface UserDetailDrawerProps {
  userId: string | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (id: string) => void;
  onResetPassword?: (id: string) => void;
  onDeactivated?: () => void;
  tenantId?: string;
  scope?: UserScope;
}

export function UserDetailDrawer({
  userId,
  open,
  onClose,
  onEdit,
  onResetPassword,
  onDeactivated,
  tenantId,
  scope = 'tenant',
}: UserDetailDrawerProps) {
  const { user: authUser } = useAuth();
  const { user, isLoading } = useUserDetail(userId, tenantId, scope);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  const { deactivate, isDeactivating } = useUserDeactivate(
    userId,
    tenantId,
    scope,
    () => {
      // Deactivation soft-deletes the user, so re-fetching the detail would 404.
      // Close the drawer instead; the mutation already invalidates the list query.
      setShowDeactivateConfirm(false);
      setDeactivateReason('');
      setReasonError('');
      onDeactivated?.();
    },
  );

  const handleEdit = useCallback(() => {
    if (onEdit && userId) {
      onEdit(userId);
    }
  }, [onEdit, userId]);

  const handleResetPassword = useCallback(() => {
    if (onResetPassword && userId) {
      onResetPassword(userId);
    }
  }, [onResetPassword, userId]);

  const handleDeactivateClick = useCallback(() => {
    setShowDeactivateConfirm(true);
    setDeactivateReason('');
    setReasonError('');
  }, []);

  const handleCancelDeactivate = useCallback(() => {
    setShowDeactivateConfirm(false);
    setDeactivateReason('');
    setReasonError('');
  }, []);

  const handleConfirmDeactivate = useCallback(() => {
    if (!deactivateReason.trim()) {
      setReasonError('Reason is required');
      return;
    }
    deactivate(deactivateReason.trim());
  }, [deactivateReason, deactivate]);

  // You cannot deactivate your own account (the API refuses it too).
  const canDeactivate =
    user?.status === 'ACTIVE' && user?.id !== authUser?.id;

  return (
    <DrawerPanel open={open} onClose={onClose} size="narrow">
      <div className="flex h-full flex-col">
        {isLoading ? (
          <>
            <DrawerHeader title="Loading..." onClose={onClose} />
            <div className="flex-1 px-6 py-4">
              <LoadingState rows={6} />
            </div>
          </>
        ) : user ? (
          <>
            <DrawerHeader
              title={user.name}
              onClose={onClose}
              actions={
                <>
                  <UserStatusChip status={user.status} />
                  {onResetPassword ? (
                    <Button variant="icon" onClick={handleResetPassword} aria-label="Reset Password">
                      <i className="mdi mdi-lock-reset text-xl" />
                    </Button>
                  ) : null}
                  {onEdit ? (
                    <Button variant="icon" onClick={handleEdit} aria-label="Edit">
                      <i className="mdi mdi-pencil-outline text-xl" />
                    </Button>
                  ) : null}
                  {canDeactivate ? (
                    <Button
                      variant="icon"
                      onClick={handleDeactivateClick}
                      aria-label="Deactivate User"
                      disabled={isDeactivating}
                    >
                      <i className="mdi mdi-account-off-outline text-xl text-error" />
                    </Button>
                  ) : null}
                </>
              }
            />
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <UserDetailSections user={user} />
            </div>
          </>
        ) : null}
      </div>

      <Dialog
        open={showDeactivateConfirm}
        onClose={handleCancelDeactivate}
        title="Deactivate User"
        actions={
          <>
            <Button variant="secondary" onClick={handleCancelDeactivate}>
              Cancel
            </Button>
            <Button
              className="bg-error text-white hover:brightness-95 active:brightness-90"
              onClick={handleConfirmDeactivate}
              loading={isDeactivating}
            >
              Deactivate
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">
            Are you sure you want to deactivate &quot;{user?.name}&quot;? They will no
            longer be able to log in. Please provide a reason.
          </p>
          <Textarea
            value={deactivateReason}
            onChange={setDeactivateReason}
            rows={3}
            maxLength={500}
            placeholder="Reason for deactivation"
            aria-label="Deactivation reason"
          />
          {reasonError && <p className="text-sm text-error">{reasonError}</p>}
        </div>
      </Dialog>
    </DrawerPanel>
  );
}
