import { useState, useCallback } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/forms/Textarea';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useAuth } from '@/hooks/useAuth';
import { useInspectorDetail } from '../hooks/useInspectorDetail';
import { useInspectorDeactivate } from '../hooks/useInspectorDeactivate';
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
  const { user } = useAuth();
  const { inspector, isLoading, refetch } = useInspectorDetail(inspectorId);

  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  const { deactivate, isDeactivating } = useInspectorDeactivate(
    inspectorId,
    () => {
      setShowDeactivateDialog(false);
      setDeactivateReason('');
      setReasonError('');
      refetch();
    },
  );

  const isAmOp = user?.role === 'AM' || user?.role === 'OP';
  const canDeactivate = isAmOp && inspector?.status === 'ACTIVE';

  const handleEdit = useCallback(() => {
    if (onEdit && inspectorId) {
      onEdit(inspectorId);
    }
  }, [onEdit, inspectorId]);

  const handleDeactivateClick = useCallback(() => {
    setShowDeactivateDialog(true);
    setDeactivateReason('');
    setReasonError('');
  }, []);

  const handleCancelDeactivate = useCallback(() => {
    setShowDeactivateDialog(false);
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

  return (
    <>
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
                    {canDeactivate ? (
                      <Button
                        variant="icon"
                        onClick={handleDeactivateClick}
                        aria-label="Deactivate"
                        className="text-error hover:bg-error/10"
                      >
                        <i className="mdi mdi-account-off-outline text-xl" />
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

      <Dialog
        open={showDeactivateDialog}
        onClose={handleCancelDeactivate}
        title="Deactivate Inspector"
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
            Are you sure you want to deactivate this inspector? Please provide a reason.
          </p>
          <Textarea
            value={deactivateReason}
            onChange={setDeactivateReason}
            rows={3}
            placeholder="Reason for deactivation"
            aria-label="Deactivation reason"
          />
          {reasonError && (
            <p className="text-sm text-error">{reasonError}</p>
          )}
        </div>
      </Dialog>
    </>
  );
}
