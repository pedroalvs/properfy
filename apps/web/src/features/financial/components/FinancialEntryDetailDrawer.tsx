import { useCallback } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useFinancialEntryDetail } from '../hooks/useFinancialEntryDetail';
import { FinancialStatusChip } from './FinancialStatusChip';
import { FinancialEntryDetailSections } from './FinancialEntryDetailSections';

interface FinancialEntryDetailDrawerProps {
  entryId: string | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (id: string) => void;
}

export function FinancialEntryDetailDrawer({ entryId, open, onClose, onEdit }: FinancialEntryDetailDrawerProps) {
  const { entry, isLoading } = useFinancialEntryDetail(entryId);
  const { showInfo } = useSnackbar();

  const handleEdit = useCallback(() => {
    if (onEdit && entryId) {
      onEdit(entryId);
    } else {
      showInfo('Editing coming soon');
    }
  }, [onEdit, entryId, showInfo]);

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
        ) : entry ? (
          <>
            <DrawerHeader
              title={entry.appointmentCode}
              onClose={onClose}
              actions={
                <>
                  <FinancialStatusChip status={entry.status} />
                  <Button variant="icon" onClick={handleEdit} aria-label="Editar">
                    <i className="mdi mdi-pencil-outline text-xl" />
                  </Button>
                </>
              }
            />
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <FinancialEntryDetailSections entry={entry} />
            </div>
          </>
        ) : null}
      </div>
    </DrawerPanel>
  );
}
