import { useState, useCallback } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LoadingState } from '@/components/feedback/LoadingState';
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
  const { user, isLoading, refetch } = useUserDetail(userId, tenantId, scope);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);

  const { deactivate, isDeactivating } = useUserDeactivate(
    userId,
    tenantId,
    scope,
    () => {
      setShowDeactivateConfirm(false);
      refetch();
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
                  {user.status === 'ACTIVE' ? (
                    <Button
                      variant="icon"
                      onClick={() => setShowDeactivateConfirm(true)}
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

      <ConfirmDialog
        open={showDeactivateConfirm}
        title="Deactivate User"
        message={`Are you sure you want to deactivate "${user?.name}"? They will no longer be able to log in.`}
        confirmLabel="Deactivate"
        variant="danger"
        loading={isDeactivating}
        onConfirm={deactivate}
        onClose={() => setShowDeactivateConfirm(false)}
      />
    </DrawerPanel>
  );
}
