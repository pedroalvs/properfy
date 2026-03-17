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
}

export function UserDetailDrawer({ userId, open, onClose, onEdit }: UserDetailDrawerProps) {
  const { user, isLoading } = useUserDetail(userId);
  const { showInfo } = useSnackbar();

  const handleEdit = useCallback(() => {
    if (onEdit && userId) {
      onEdit(userId);
    } else {
      showInfo('Edição em breve');
    }
  }, [onEdit, userId, showInfo]);

  return (
    <DrawerPanel open={open} onClose={onClose} size="narrow">
      <div className="flex h-full flex-col">
        {isLoading ? (
          <>
            <DrawerHeader title="Carregando..." onClose={onClose} />
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
                  <Button variant="icon" onClick={handleEdit} aria-label="Editar">
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
