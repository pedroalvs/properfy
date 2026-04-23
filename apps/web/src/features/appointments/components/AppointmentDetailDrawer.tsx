import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { AppointmentStatusChip } from '@/features/appointments/components/AppointmentStatusChip';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useAuth } from '@/hooks/useAuth';
import { useAppointmentDetail } from '../hooks/useAppointmentDetail';
import { useAppointmentTransition } from '../hooks/useAppointmentTransition';
import { getAvailableTransitions } from '../lib/transitions';
import { isAppointmentEditable } from '../lib/editability';
import { AppointmentDetailSections } from './AppointmentDetailSections';
import { AppointmentTransitionActions } from './AppointmentTransitionActions';

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
  const navigate = useNavigate();
  const { appointment, isLoading, refetch } = useAppointmentDetail(appointmentId);
  const { user } = useAuth();
  const { transition, isTransitioning } = useAppointmentTransition(appointmentId, refetch);

  const transitions =
    appointment && user
      ? getAvailableTransitions(appointment.status, user.role)
      : [];
  const canEditAppointment = !!appointment && isAppointmentEditable(appointment.status);

  const handleEdit = useCallback(() => {
    if (onEdit && appointmentId) {
      onEdit(appointmentId);
    }
  }, [onEdit, appointmentId]);

  const handleOpenFullDetail = useCallback(() => {
    if (appointmentId) {
      onClose();
      navigate(`/appointments/${appointmentId}`);
    }
  }, [appointmentId, onClose, navigate]);

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
              title={`${appointment.code}${appointment.appointmentNumber != null ? ` · #${appointment.appointmentNumber}` : ''}`}
              onClose={onClose}
              actions={
                <>
                  <AppointmentStatusChip status={appointment.status} doneCheckedByUserId={appointment.doneCheckedByUserId} isOverdue={appointment.isOverdue} />
                  {onEdit && canEditAppointment ? (
                    <Button variant="icon" onClick={handleEdit} aria-label="Edit">
                      <i className="mdi mdi-pencil-outline text-xl" />
                    </Button>
                  ) : null}
                </>
              }
            />
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <AppointmentDetailSections appointment={appointment} />
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
            {transitions.length > 0 && (
              <div className="border-t border-black/10 px-6 py-4">
                <AppointmentTransitionActions
                  transitions={transitions}
                  onTransition={transition}
                  loading={isTransitioning}
                />
              </div>
            )}
          </>
        ) : null}
      </div>
    </DrawerPanel>
  );
}
