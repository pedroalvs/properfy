import { useCallback } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useSnackbar } from '@/hooks/useSnackbar';
import { usePropertyDetail } from '../hooks/usePropertyDetail';
import { PropertyTypeChip } from './PropertyTypeChip';
import { PropertyDetailSections } from './PropertyDetailSections';

interface PropertyDetailDrawerProps {
  propertyId: string | null;
  open: boolean;
  onClose: () => void;
}

export function PropertyDetailDrawer({
  propertyId,
  open,
  onClose,
}: PropertyDetailDrawerProps) {
  const { property, isLoading } = usePropertyDetail(propertyId);
  const { showInfo } = useSnackbar();

  const handleEdit = useCallback(() => {
    showInfo('Edição em breve');
  }, [showInfo]);

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
        ) : property ? (
          <>
            <DrawerHeader
              title={property.propertyCode}
              onClose={onClose}
              actions={
                <>
                  <PropertyTypeChip type={property.type} />
                  <Button variant="icon" onClick={handleEdit} aria-label="Editar">
                    <i className="mdi mdi-pencil-outline text-xl" />
                  </Button>
                </>
              }
            />
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <PropertyDetailSections property={property} />
            </div>
          </>
        ) : null}
      </div>
    </DrawerPanel>
  );
}
