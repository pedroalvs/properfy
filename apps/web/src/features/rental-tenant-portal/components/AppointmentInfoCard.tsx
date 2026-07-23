import { AppointmentStatusChip } from '@/features/appointments/components/AppointmentStatusChip';
import { buildAddressLabel } from '@/lib/address';
import { formatDate } from '@/lib/format-date';
import { RENTAL_TENANT_CONFIRMATION_STATUS_MAP } from '@/lib/status-colors';
import { useCountdown } from '../hooks/useCountdown';
import type { PortalAppointment } from '../types';

interface AppointmentInfoCardProps {
  appointment: PortalAppointment;
  deadline?: string;
  onDeadlineExpire?: () => void;
  /** Agency (tenant) display name. */
  agencyName?: string | null;
  /** PROPERTY_MANAGER contact display name. */
  propertyManager?: string | null;
  /** All RENTAL_TENANT contact names (primary first). */
  rentalTenantNames?: string[];
}

export function AppointmentInfoCard({
  appointment,
  deadline,
  onDeadlineExpire,
  agencyName,
  propertyManager,
  rentalTenantNames,
}: AppointmentInfoCardProps) {
  const confirmationStyle =
    RENTAL_TENANT_CONFIRMATION_STATUS_MAP[appointment.rentalTenantConfirmationStatus];
  const countdown = useCountdown(deadline, onDeadlineExpire);
  const names = rentalTenantNames?.length ? rentalTenantNames.join(' & ') : null;

  return (
    <section aria-label="Details">
      <h2 className="mb-4 text-base font-extrabold text-text-primary">Details</h2>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
        {agencyName && <DetailItem label="Agency">{agencyName}</DetailItem>}
        {propertyManager && <DetailItem label="Property manager">{propertyManager}</DetailItem>}
        {appointment.property?.propertyCode && (
          <DetailItem label="Code">{appointment.property.propertyCode}</DetailItem>
        )}
        {names && <DetailItem label="Name">{names}</DetailItem>}

        {appointment.property && (
          <DetailItem label="Property address">
            {buildAddressLabel({
              street: appointment.property.street,
              suburb: appointment.property.suburb,
              state: appointment.property.state,
              postcode: appointment.property.postcode,
            })}
          </DetailItem>
        )}

        {appointment.serviceType?.name && (
          <DetailItem label="Service type">{appointment.serviceType.name}</DetailItem>
        )}

        <DetailItem label="Scheduled date">{formatDate(appointment.scheduledDate)}</DetailItem>

        <DetailItem label="Time slot">
          {`${appointment.timeSlotStart} – ${appointment.timeSlotEnd}`}
        </DetailItem>

        <DetailItem label="Status">
          <AppointmentStatusChip status={appointment.status} />
        </DetailItem>

        <DetailItem label="Confirmation">
          <span
            className="inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5"
            style={{
              backgroundColor: confirmationStyle.bg,
              color: confirmationStyle.text,
            }}
          >
            {confirmationStyle.label}
          </span>
        </DetailItem>

        {appointment.keyRequired && (
          <DetailItem label="Key required">
            <span className="inline-flex items-center gap-1 text-warning">
              <i className="mdi mdi-key text-base" />
              Yes
            </span>
          </DetailItem>
        )}

        {appointment.meetingLocation && (
          <DetailItem label="Meeting location">{appointment.meetingLocation}</DetailItem>
        )}

        {appointment.notes && <DetailItem label="Notes">{appointment.notes}</DetailItem>}
      </dl>

      {deadline && countdown.isUrgent && !countdown.isExpired && (
        <div
          className={`mt-4 flex items-center gap-2 rounded px-3 py-2 text-sm font-semibold ${
            countdown.isCritical ? 'bg-error/10 text-error' : 'bg-warning/10 text-warning'
          }`}
          role="status"
          aria-label="Countdown timer"
        >
          <i className="mdi mdi-clock-alert-outline text-base" />
          {countdown.label}
        </div>
      )}
    </section>
  );
}

function DetailItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-text-primary">{children}</dd>
    </div>
  );
}
