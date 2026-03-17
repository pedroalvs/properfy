import { useParams } from 'react-router-dom';
import { AppointmentStatus, TenantConfirmationStatus } from '@properfy/shared';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { PortalLayout } from '../components/PortalLayout';
import { PortalErrorState } from '../components/PortalErrorState';
import { AppointmentInfoCard } from '../components/AppointmentInfoCard';
import { ConfirmSection } from '../components/ConfirmSection';
import { RescheduleForm } from '../components/RescheduleForm';
import { ContactForm } from '../components/ContactForm';
import { UnavailableSection } from '../components/UnavailableSection';
import { usePortalData } from '../hooks/usePortalData';

const TERMINAL_STATUSES = new Set<string>([
  AppointmentStatus.DONE,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.REJECTED,
]);

export function PortalPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError, error, refetch } = usePortalData(token ?? '');

  if (!token) {
    return (
      <PortalLayout>
        <PortalErrorState
          error={new Error('No portal token provided')}
          onRetry={() => window.location.reload()}
        />
      </PortalLayout>
    );
  }

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded bg-card-bg shadow-sm"
            />
          ))}
        </div>
      </PortalLayout>
    );
  }

  if (isError || !data) {
    return (
      <PortalLayout>
        <PortalErrorState
          error={error ?? new Error('Failed to load portal data')}
          onRetry={() => refetch()}
        />
      </PortalLayout>
    );
  }

  const { appointment, contact, restrictions } = data;
  const isReadOnly = data.token.isReadOnly;
  const isTerminal = TERMINAL_STATUSES.has(appointment.status);
  const showConfirm =
    !isTerminal &&
    appointment.tenantConfirmationStatus !== TenantConfirmationStatus.UNAVAILABLE;
  const showReschedule = !isTerminal && !isReadOnly;
  const showUnavailable =
    !isTerminal &&
    appointment.tenantConfirmationStatus !== TenantConfirmationStatus.CONFIRMED;

  return (
    <PortalLayout>
      <div className="space-y-4">
        {isReadOnly && (
          <InfoBanner>
            This portal is read-only. The confirmation deadline has passed.
            You can still view details and report unavailability.
          </InfoBanner>
        )}

        {isTerminal && (
          <InfoBanner>
            This appointment is{' '}
            <strong>{appointment.status.toLowerCase().replace('_', ' ')}</strong>.
            No further actions are available.
          </InfoBanner>
        )}

        <AppointmentInfoCard appointment={appointment} />

        {showConfirm && (
          <ConfirmSection
            appointment={appointment}
            token={token}
            isReadOnly={isReadOnly}
          />
        )}

        {showReschedule && (
          <RescheduleForm
            appointment={appointment}
            token={token}
            isReadOnly={isReadOnly}
          />
        )}

        <ContactForm contact={contact} token={token} />

        {showUnavailable && (
          <UnavailableSection
            appointment={appointment}
            token={token}
            isReadOnly={isReadOnly}
          />
        )}
      </div>
    </PortalLayout>
  );
}
