import { useCallback } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useUserDetail } from '../hooks/useUserDetail';
import { UserStatusChip } from './UserStatusChip';
import { UserDetailSections } from './UserDetailSections';

interface UserDetailDrawerProps {
  userId: string | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (id: string) => void;
  onResetPassword?: (id: string) => void;
  tenantId?: string;
}

export function UserDetailDrawer({
  userId,
  open,
  onClose,
  onEdit,
  onResetPassword,
  tenantId,
}: UserDetailDrawerProps) {
  const { user, isLoading } = useUserDetail(userId, tenantId);

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
                </>
              }
            />
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <UserDetailSections user={user} />
            </div>
          </>
        ) : null}
      </div>
    </DrawerPanel>
  );
}
