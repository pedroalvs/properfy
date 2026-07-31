import { Link } from 'react-router-dom';
import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { BooleanIcon } from '@/components/ui/BooleanIcon';
import { AppointmentStatus, OVERDUE_AGE_DAYS } from '@properfy/shared';
import { RENTAL_TENANT_CONFIRMATION_STATUS_MAP } from '@/lib/status-colors';
import {
  formatCivilDate,
  formatInstantDate,
  formatInstantDateTime,
  formatWallTimeRange,
} from '@/lib/format-date';
import { formatArea, formatPropertyType, formatRent } from '@/lib/format-property';
import type { AppointmentDetail } from '../types';
import { formatAuPhone } from '@/lib/phone-mask';
import { TenantAvailabilitySlots } from './TenantAvailabilitySlots';

interface AppointmentDetailSectionsProps {
  appointment: AppointmentDetail;
}

export function AppointmentDetailSections({ appointment }: AppointmentDetailSectionsProps) {
  const confirmationStyle = RENTAL_TENANT_CONFIRMATION_STATUS_MAP[appointment.rentalTenantConfirmationStatus];
  const isPendingOperationalCrossCheck =
    appointment.status === AppointmentStatus.DONE && !appointment.doneCheckedByUserId;
  // Defensive: every writer currently replaces all restrictions with a single row, so
  // index 0 would do. Search by content anyway, so a future multi-row model surfaces the
  // availability instead of whichever row happens to come first.
  const availableSlots = appointment.restrictions?.find(
    (r) => r.availableSlotsJson?.length,
  )?.availableSlotsJson;

  return (
    <div className="flex flex-col gap-6">
      {appointment.isOverdue && (
        <div
          className="flex items-start gap-3 rounded bg-error/10 px-4 py-3 text-sm text-error"
          role="alert"
        >
          <i className="mdi mdi-alert-circle mt-0.5 text-lg" aria-hidden="true" />
          <div>
            <span className="font-semibold">This appointment is overdue.</span>
            {' '}It was created on {formatInstantDate(appointment.createdAt)} and has been open for
            more than {OVERDUE_AGE_DAYS} days without being completed.
            Consider rescheduling, cancelling, or marking as done.
          </div>
        </div>
      )}
      <FormSection title="Inspection Details">
        <DetailRow label="Service Type" value={appointment.serviceTypeName} />
        <DetailRow label="Branch" value={appointment.branchName} />
        <DetailRow label="Scheduled Date" value={formatCivilDate(appointment.scheduledDate)} />
        <DetailRow label="Time Slot" value={formatWallTimeRange(appointment.timeSlotStart, appointment.timeSlotEnd)} />
        <DetailRow label="Inspector" value={appointment.inspectorName} />
        <DetailRow
          label="Service Group"
          value={
            appointment.serviceGroupCode ? (
              <span className="font-mono">Group {appointment.serviceGroupCode}</span>
            ) : null
          }
        />
      </FormSection>

      <FormSection title="Property">
        <DetailRow label="Address" value={appointment.propertyAddress} />
        <DetailRow label="Address Line 2" value={appointment.propertyAddressLine2} />
        <DetailRow label="Type" value={formatPropertyType(appointment.propertyType)} />
        <DetailRow label="Private Area" value={formatArea(appointment.propertyPrivateAreaM2)} />
        <DetailRow label="Total Area" value={formatArea(appointment.propertyTotalAreaM2)} />
        <DetailRow
          label="Furnished"
          value={
            appointment.propertyFurnished != null ? (
              <BooleanIcon value={appointment.propertyFurnished} />
            ) : null
          }
        />
        <DetailRow
          label="Linen Provided"
          value={
            appointment.propertyLinenProvided != null ? (
              <BooleanIcon value={appointment.propertyLinenProvided} />
            ) : null
          }
        />
        <DetailRow label="Rent Amount" value={formatRent(appointment.propertyRentAmount)} />
        <Link
          to={`/properties/${appointment.propertyId}`}
          className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-primary hover:underline"
          data-testid="appointment-property-link"
        >
          <i className="mdi mdi-arrow-right text-base" aria-hidden="true" />
          View property
        </Link>
      </FormSection>

      <FormSection title="Contact">
        <DetailRow label="Name" value={appointment.contactName} />
        <DetailRow label="Phone" value={appointment.contactPhone ? formatAuPhone(appointment.contactPhone) : appointment.contactPhone} />
        <DetailRow label="Email" value={appointment.contactEmail} />
      </FormSection>

      <FormSection title="Access">
        <DetailRow
          label="Key Required"
          value={<BooleanIcon value={appointment.keyRequired} />}
        />
        <DetailRow label="Meeting Point" value={appointment.meetingLocation} />
        <DetailRow label="Key Location" value={appointment.keyLocation} />
      </FormSection>

      {appointment.customFields && appointment.customFields.length > 0 && (
        <FormSection title="Custom Fields">
          {appointment.customFields.map((field, idx) => (
            <DetailRow key={idx} label={field.label} value={field.value} />
          ))}
        </FormSection>
      )}

      <FormSection title="Tenant Confirmation">
        <DetailRow
          label="Status"
          value={
            <span
              className="inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5"
              style={{ backgroundColor: confirmationStyle.bg, color: confirmationStyle.text }}
            >
              {confirmationStyle.label}
            </span>
          }
        />
        {!!availableSlots?.length && (
          <DetailRow
            label="Availability"
            value={<TenantAvailabilitySlots slots={availableSlots} />}
          />
        )}
      </FormSection>

      {(appointment.status === AppointmentStatus.DONE || appointment.doneCheckedByUserId || appointment.doneCheckedAt) && (
        <FormSection title="Operational Validation">
          <DetailRow
            label="Cross-check"
            value={
              isPendingOperationalCrossCheck
                ? (
                  <span className="inline-block rounded bg-warning/10 px-2 py-0.5 text-xs font-semibold leading-5 text-warning">
                    Pending operator cross-check
                  </span>
                )
                : 'Validated'
            }
          />
          <DetailRow
            label="Validated At"
            value={appointment.doneCheckedAt ? formatInstantDateTime(appointment.doneCheckedAt) : null}
          />
        </FormSection>
      )}

      {appointment.rentalTenantNote && (
        <div className="rounded border border-info/30 bg-info/5 p-4">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-text-secondary">
            Tenant Note
          </h3>
          <p className="whitespace-pre-wrap text-sm text-text-primary">
            {appointment.rentalTenantNote}
          </p>
        </div>
      )}

      {appointment.notes && (
        <FormSection title="Notes">
          <DetailRow label="Notes" value={appointment.notes} />
        </FormSection>
      )}

      {appointment.observation && (
        <FormSection title="Observation">
          <DetailRow label="Observation" value={appointment.observation} />
        </FormSection>
      )}

      <FormSection title="Record">
        <DetailRow label="Created At" value={formatInstantDateTime(appointment.createdAt)} />
        <DetailRow label="Updated At" value={formatInstantDateTime(appointment.updatedAt)} />
        {appointment.cancellationReason && (
          <DetailRow label="Cancellation/Rejection Reason" value={appointment.cancellationReason} />
        )}
      </FormSection>
    </div>
  );
}
