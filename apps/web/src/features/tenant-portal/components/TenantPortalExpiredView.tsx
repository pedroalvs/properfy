import { AppointmentInfoCard } from './AppointmentInfoCard';
import type { PortalAppointment } from '../types';

interface ExistingResponse {
  type: string;
  createdAt: string;
  summary?: string;
}

interface TenantPortalExpiredViewProps {
  appointment: PortalAppointment;
  existingResponse?: ExistingResponse;
  agencyPhone?: string;
}

export function TenantPortalExpiredView({
  appointment,
  existingResponse,
  agencyPhone,
}: TenantPortalExpiredViewProps) {
  return (
    <div className="space-y-4">
      <div
        className="flex items-start gap-3 rounded bg-warning/10 px-4 py-3 text-sm text-warning"
        role="status"
      >
        <i className="mdi mdi-clock-alert-outline mt-0.5 text-lg" />
        <span>The confirmation deadline has passed.</span>
      </div>

      <AppointmentInfoCard appointment={appointment} />

      {existingResponse && (
        <div className="rounded bg-card-bg p-6 shadow-sm">
          <h3 className="mb-2 text-base font-bold text-secondary">
            Your Response
          </h3>
          <p className="text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">
              {existingResponse.type}
            </span>
            {' '}on{' '}
            {formatResponseDate(existingResponse.createdAt)}
          </p>
          {existingResponse.summary && (
            <p className="mt-1 text-sm text-text-secondary">
              {existingResponse.summary}
            </p>
          )}
        </div>
      )}

      {agencyPhone && (
        <div className="rounded bg-card-bg p-4 shadow-sm">
          <p className="text-sm text-text-secondary">
            <i className="mdi mdi-phone mr-1 text-base text-secondary" />
            Need help? Contact the agency at{' '}
            <a
              href={`tel:${agencyPhone}`}
              className="font-semibold text-primary hover:underline"
            >
              {agencyPhone}
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

function formatResponseDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-AU');
  } catch {
    return iso;
  }
}
