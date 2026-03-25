import { useCallback } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useInspectorDetail } from '../hooks/useInspectorDetail';
import { InspectorStatusChip } from './InspectorStatusChip';
import { InspectorDetailSections } from './InspectorDetailSections';

interface InspectorDetailDrawerProps {
  inspectorId: string | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (id: string) => void;
}

export function InspectorDetailDrawer({
  inspectorId,
  open,
  onClose,
  onEdit,
}: InspectorDetailDrawerProps) {
  const { inspector, isLoading } = useInspectorDetail(inspectorId);

  const handleEdit = useCallback(() => {
    if (onEdit && inspectorId) {
      onEdit(inspectorId);
    }
  }, [onEdit, inspectorId]);

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
        ) : inspector ? (
          <>
            <DrawerHeader
              title={inspector.name}
              onClose={onClose}
              actions={
                <>
                  <InspectorStatusChip status={inspector.status} />
                  {onEdit ? (
                    <Button variant="icon" onClick={handleEdit} aria-label="Edit">
                      <i className="mdi mdi-pencil-outline text-xl" />
                    </Button>
                  ) : null}
                </>
              }
            />
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <InspectorDetailSections inspector={inspector} />
            </div>
          </>
        ) : null}
      </div>
    </DrawerPanel>
  );
}
