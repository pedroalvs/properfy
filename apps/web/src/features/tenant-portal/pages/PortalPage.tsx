import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { AppointmentStatus, TenantConfirmationStatus } from '@properfy/shared';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { ApiError } from '@/lib/api-error';
import { PortalLayout } from '../components/PortalLayout';
import { PortalErrorState } from '../components/PortalErrorState';
import { AppointmentInfoCard } from '../components/AppointmentInfoCard';
import { ConfirmSection } from '../components/ConfirmSection';
import { RescheduleForm } from '../components/RescheduleForm';
import { ContactForm } from '../components/ContactForm';
import { UnavailableSection } from '../components/UnavailableSection';
import { TenantPortalExpiredView } from '../components/TenantPortalExpiredView';
import { TenantPortalInvalidView } from '../components/TenantPortalInvalidView';
import { TenantPortalCancelledView } from '../components/TenantPortalCancelledView';
import { ResponseConfirmationCard } from '../components/ResponseConfirmationCard';
import { usePortalData } from '../hooks/usePortalData';

const EXPIRED_CODES = new Set(['PORTAL_TOKEN_EXPIRED']);
const INVALID_CODES = new Set(['PORTAL_TOKEN_INVALID', 'PORTAL_TOKEN_NOT_FOUND']);

export function PortalPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError, error, refetch } = usePortalData(token ?? '');
  const handleDeadlineExpire = useCallback(() => { refetch(); }, [refetch]);

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
    const apiError = error instanceof ApiError ? error : null;
    const errorCode = apiError?.code ?? '';

    if (EXPIRED_CODES.has(errorCode)) {
      return (
        <PortalLayout>
          <TenantPortalExpiredView
            appointment={{
              id: '',
              status: AppointmentStatus.SCHEDULED,
              scheduledDate: '',
              timeSlot: '',
              serviceTypeId: '',
              tenantConfirmationStatus: TenantConfirmationStatus.PENDING,
              keyRequired: false,
              meetingLocation: null,
              notes: null,
            }}
          />
        </PortalLayout>
      );
    }

    if (INVALID_CODES.has(errorCode)) {
      return (
        <PortalLayout>
          <TenantPortalInvalidView />
        </PortalLayout>
      );
    }

    return (
      <PortalLayout>
        <PortalErrorState
          error={error ?? new Error('Failed to load portal data')}
          onRetry={() => refetch()}
        />
      </PortalLayout>
    );
  }

  const { appointment, contact } = data;

  // Appointment is cancelled
  if (appointment.status === AppointmentStatus.CANCELLED) {
    return (
      <PortalLayout>
        <TenantPortalCancelledView agencyPhone={data.agencyPhone} />
      </PortalLayout>
    );
  }

  const isReadOnly = data.token.isReadOnly;
  const isTerminal = appointment.status === AppointmentStatus.DONE ||
    appointment.status === AppointmentStatus.REJECTED;
  const hasResponse = !!data.existingResponse;

  const showConfirm =
    !isTerminal &&
    !isReadOnly &&
    !hasResponse &&
    appointment.tenantConfirmationStatus !== TenantConfirmationStatus.UNAVAILABLE;
  const showReschedule = !isTerminal && !isReadOnly && !hasResponse;
  const showUnavailable =
    !isTerminal &&
    appointment.tenantConfirmationStatus !== TenantConfirmationStatus.UNAVAILABLE &&
    (isReadOnly || (!hasResponse && appointment.tenantConfirmationStatus !== TenantConfirmationStatus.CONFIRMED));

  return (
    <PortalLayout>
      <div className="space-y-4">
        {isReadOnly && (
          <InfoBanner>
            This portal is in restricted mode because the confirmation deadline has passed.
            You can still report an urgent unavailability until the visit starts.
          </InfoBanner>
        )}

        {isTerminal && (
          <InfoBanner>
            This appointment is{' '}
            <strong>{appointment.status.toLowerCase().replace('_', ' ')}</strong>.
            No further actions are available.
          </InfoBanner>
        )}

        {hasResponse && !isReadOnly && !isTerminal && (
          <InfoBanner>
            Your response has been recorded. If you need to make further changes, please contact the agency directly.
          </InfoBanner>
        )}

        <AppointmentInfoCard appointment={appointment} deadline={data.deadline} onDeadlineExpire={handleDeadlineExpire} />

        {data.existingResponse && (
          <ResponseConfirmationCard
            response={data.existingResponse}
            isExpired={isReadOnly}
          />
        )}

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

        <ContactForm contact={contact} token={token} isReadOnly={isReadOnly || isTerminal} />

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
