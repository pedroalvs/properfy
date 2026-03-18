import { LoadingState } from '@/components/feedback/LoadingState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useAppointmentAuditLog } from '../hooks/useAppointmentAuditLog';
import { AuditTimeline } from './AuditTimeline';

interface AppointmentTimelineTabProps {
  appointmentId: string;
}

export function AppointmentTimelineTab({ appointmentId }: AppointmentTimelineTabProps) {
  const { entries, isLoading, isError, refetch } = useAppointmentAuditLog(appointmentId);

  if (isLoading) {
    return <LoadingState rows={4} />;
  }

  if (isError) {
    return <ErrorState message="Failed to load audit log" onRetry={refetch} />;
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        title="No audit entries"
        description="No events have been recorded for this appointment yet."
        icon="mdi-timeline-outline"
      />
    );
  }

  return <AuditTimeline entries={entries} />;
}
