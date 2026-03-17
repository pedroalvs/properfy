import { useState, useCallback } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useAuth } from '@/hooks/useAuth';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useAppointmentDetail } from '../hooks/useAppointmentDetail';
import { getAvailableTransitions } from '../lib/transitions';
import { AppointmentDetailSections } from './AppointmentDetailSections';
import { AppointmentTransitionActions } from './AppointmentTransitionActions';
import type { AppointmentStatus } from '@properfy/shared';

interface AppointmentDetailDrawerProps {
  appointmentId: string | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (id: string) => void;
}

export function AppointmentDetailDrawer({
  appointmentId,
  open,
  onClose,
  onEdit,
}: AppointmentDetailDrawerProps) {
  const { appointment, isLoading, refetch } = useAppointmentDetail(appointmentId);
  const { user } = useAuth();
  const { showSuccess, showInfo } = useSnackbar();
  const [transitionLoading, setTransitionLoading] = useState(false);

  const transitions =
    appointment && user
      ? getAvailableTransitions(appointment.status, user.role)
      : [];

  const handleTransition = useCallback(
    async (_targetStatus: AppointmentStatus, _reason?: string) => {
      setTransitionLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 500));
      setTransitionLoading(false);
      showSuccess('Transition completed');
      refetch();
    },
    [showSuccess, refetch],
  );

  const handleEdit = useCallback(() => {
    if (onEdit && appointmentId) {
      onEdit(appointmentId);
    } else {
      showInfo('Editing coming soon');
    }
  }, [onEdit, appointmentId, showInfo]);

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
        ) : appointment ? (
          <>
            <DrawerHeader
              title={appointment.code}
              onClose={onClose}
              actions={
                <>
                  <StatusChip status={appointment.status} />
                  <Button variant="icon" onClick={handleEdit} aria-label="Edit">
                    <i className="mdi mdi-pencil-outline text-xl" />
                  </Button>
                </>
              }
            />
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <AppointmentDetailSections appointment={appointment} />
            </div>
            {transitions.length > 0 && (
              <div className="border-t border-black/10 px-6 py-4">
                <AppointmentTransitionActions
                  transitions={transitions}
                  onTransition={handleTransition}
                  loading={transitionLoading}
                />
              </div>
            )}
          </>
        ) : null}
      </div>
    </DrawerPanel>
  );
}
