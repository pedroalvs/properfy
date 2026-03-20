import { useCallback } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useServiceGroupDetail } from '../hooks/useServiceGroupDetail';
import { ServiceGroupStatusChip } from './ServiceGroupStatusChip';
import { ServiceGroupDetailSections } from './ServiceGroupDetailSections';

interface ServiceGroupDetailDrawerProps {
  serviceGroupId: string | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (id: string) => void;
}

export function ServiceGroupDetailDrawer({ serviceGroupId, open, onClose, onEdit }: ServiceGroupDetailDrawerProps) {
  const { serviceGroup, isLoading } = useServiceGroupDetail(serviceGroupId);
  const { showInfo } = useSnackbar();

  const handleEdit = useCallback(() => {
    if (onEdit && serviceGroupId) {
      onEdit(serviceGroupId);
    } else {
      showInfo('Editing coming soon');
    }
  }, [onEdit, serviceGroupId, showInfo]);

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
        ) : serviceGroup ? (
          <>
            <DrawerHeader
              title={serviceGroup.name ?? '—'}
              onClose={onClose}
              actions={
                <>
                  <ServiceGroupStatusChip status={serviceGroup.status} />
                  <Button variant="icon" onClick={handleEdit} aria-label="Edit">
                    <i className="mdi mdi-pencil-outline text-xl" />
                  </Button>
                </>
              }
            />
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <ServiceGroupDetailSections serviceGroup={serviceGroup} />
            </div>
          </>
        ) : null}
      </div>
    </DrawerPanel>
  );
}
