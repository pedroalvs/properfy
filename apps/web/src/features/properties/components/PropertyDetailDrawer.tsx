import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { usePropertyDetail } from '../hooks/usePropertyDetail';
import { PropertyTypeChip } from './PropertyTypeChip';
import { PropertyDetailSections } from './PropertyDetailSections';

interface PropertyDetailDrawerProps {
  propertyId: string | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (id: string) => void;
}

export function PropertyDetailDrawer({
  propertyId,
  open,
  onClose,
  onEdit,
}: PropertyDetailDrawerProps) {
  const navigate = useNavigate();
  const { property, isLoading } = usePropertyDetail(propertyId);

  const handleEdit = useCallback(() => {
    if (onEdit && propertyId) {
      onEdit(propertyId);
    }
  }, [onEdit, propertyId]);

  const handleOpenFullDetail = useCallback(() => {
    if (propertyId) {
      onClose();
      navigate(`/properties/${propertyId}`);
    }
  }, [propertyId, onClose, navigate]);

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
        ) : property ? (
          <>
            <DrawerHeader
              title={property.propertyCode}
              onClose={onClose}
              actions={
                <>
                  <PropertyTypeChip type={property.type} />
                  {onEdit ? (
                    <Button variant="icon" onClick={handleEdit} aria-label="Edit">
                      <i className="mdi mdi-pencil-outline text-xl" />
                    </Button>
                  ) : null}
                </>
              }
            />
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <PropertyDetailSections property={property} />
              <div className="mt-4">
                <Button
                  variant="outlined"
                  onClick={handleOpenFullDetail}
                  aria-label="Open full detail"
                >
                  <i className="mdi mdi-open-in-new text-base" aria-hidden="true" />
                  Open full detail
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </DrawerPanel>
  );
}
