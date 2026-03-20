import { useCallback } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useUserDetail } from '../hooks/useUserDetail';
import { UserStatusChip } from './UserStatusChip';
import { UserDetailSections } from './UserDetailSections';

interface UserDetailDrawerProps {
  userId: string | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (id: string) => void;
  tenantId?: string;
}

export function UserDetailDrawer({ userId, open, onClose, onEdit, tenantId }: UserDetailDrawerProps) {
  const { user, isLoading } = useUserDetail(userId, tenantId);
  const { showInfo } = useSnackbar();

  const handleEdit = useCallback(() => {
    if (onEdit && userId) {
      onEdit(userId);
    } else {
      showInfo('Editing coming soon');
    }
  }, [onEdit, userId, showInfo]);

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
                  <Button variant="icon" onClick={handleEdit} aria-label="Edit">
                    <i className="mdi mdi-pencil-outline text-xl" />
                  </Button>
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
