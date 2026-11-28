import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { formatCivilDate, formatInstantDateTime, formatWallTimeRange , formatWallTimeWindow } from '@/lib/format-date';
import { AppointmentStatusChip } from '@/features/appointments/components/AppointmentStatusChip';
import { RentalTenantConfirmationChip } from '@/features/appointments/components/RentalTenantConfirmationChip';
import { MoveToGroupModal, type MoveToGroupAppointment } from '@/features/appointments/components/MoveToGroupModal';
import { usePermissions } from '@/hooks/usePermissions';
import { ServiceGroupStatusChip } from './ServiceGroupStatusChip';
import type { AppointmentStatus, RentalTenantConfirmationStatus } from '@properfy/shared';
import type { ServiceGroupDetail } from '../types';

interface ServiceGroupDetailSectionsProps {
  serviceGroup: ServiceGroupDetail;
  /** Called after a member is moved out of this group, so the page can refetch. */
  onMoved?: () => void;
}

const ACTIVE_GROUP_STATUSES = new Set(['DRAFT', 'PUBLISHED', 'ACCEPTED']);
const MOVABLE_MEMBER_STATUSES = new Set(['DRAFT', 'AWAITING_INSPECTOR', 'SCHEDULED']);

export function ServiceGroupDetailSections({ serviceGroup, onMoved }: ServiceGroupDetailSectionsProps) {
  const navigate = useNavigate();
  const { canPerform } = usePermissions();
  const appointments = serviceGroup.appointments ?? [];
  const [moveAppt, setMoveAppt] = useState<MoveToGroupAppointment | null>(null);

  // A member can be moved only out of an active group, by an operator, when it is in
  // a movable status.
  const groupIsActive = ACTIVE_GROUP_STATUSES.has(serviceGroup.status);
  const canMoveMembers = canPerform('appointment.move_to_group') && groupIsActive;

  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Information">
        <DetailRow
          label="Code"
          value={serviceGroup.code ? <span className="font-mono">{serviceGroup.code}</span> : '—'}
        />
        <DetailRow
          label={serviceGroup.agencies && serviceGroup.agencies.length > 1 ? 'Agencies' : 'Agency'}
          value={
            serviceGroup.agencies && serviceGroup.agencies.length > 0
              ? serviceGroup.agencies.map((a) => a.name).join(', ')
              : '—'
          }
        />
        <DetailRow label="Region" value={serviceGroup.regionName} />
        <DetailRow
          label="Scheduled Date"
          value={serviceGroup.scheduledDate ? formatCivilDate(serviceGroup.scheduledDate.slice(0, 10)) : null}
        />
        <DetailRow
          label="Time Window"
          value={serviceGroup.timeWindow ? formatWallTimeWindow(serviceGroup.timeWindow) : null}
        />
        <DetailRow label="Status" value={<ServiceGroupStatusChip status={serviceGroup.status} />} />
      </FormSection>

      <FormSection title="Inspector">
        <DetailRow label="Inspector Name" value={serviceGroup.inspectorName} />
      </FormSection>

      <FormSection title={`Appointments (${appointments.length})`}>
        {appointments.length === 0 ? (
          <p className="py-3 text-sm text-text-muted">No appointments in this group.</p>
        ) : (
          <div className="divide-y divide-black/5">
            {appointments.map((apt) => (
              <div key={apt.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => navigate(`/appointments/${apt.id}`)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 px-2 py-2.5 text-left transition-colors hover:bg-black/[0.03] rounded"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-semibold text-secondary whitespace-nowrap">
                      #{apt.appointmentNumber}
                    </span>
                    <span className="truncate text-sm text-text-secondary">
                      {apt.propertyAddress ?? apt.propertyCode ?? '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {apt.scheduledDate && (
                      <span className="text-xs text-text-muted hidden sm:inline">
                        {formatCivilDate(apt.scheduledDate)}
                      </span>
                    )}
                    {apt.timeSlotStart && apt.timeSlotEnd && (
                      <span className="text-xs text-text-muted hidden sm:inline">
                        {formatWallTimeRange(apt.timeSlotStart, apt.timeSlotEnd)}
                      </span>
                    )}
                    {apt.rentalTenantConfirmationStatus && (
                      <RentalTenantConfirmationChip
                        status={apt.rentalTenantConfirmationStatus as RentalTenantConfirmationStatus}
                      />
                    )}
                    <AppointmentStatusChip status={apt.status as AppointmentStatus} />
                    <i className="mdi mdi-chevron-right text-lg text-text-muted" aria-hidden="true" />
                  </div>
                </button>
                {canMoveMembers && MOVABLE_MEMBER_STATUSES.has(apt.status) && (
                  <button
                    type="button"
                    onClick={() => setMoveAppt({
                      id: apt.id,
                      code: String(apt.appointmentNumber),
                      scheduledDate: apt.scheduledDate ?? undefined,
                    })}
                    className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-real-estate hover:bg-black/[0.03]"
                    aria-label={`Move appointment #${apt.appointmentNumber} to another group`}
                    data-testid="service-group-member-move"
                  >
                    Move
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </FormSection>

      {serviceGroup.description && (
        <FormSection title="Notes">
          <DetailRow label="Description" value={serviceGroup.description} />
        </FormSection>
      )}

      <FormSection title="Record">
        <DetailRow label="Created At" value={formatInstantDateTime(serviceGroup.createdAt)} />
        <DetailRow label="Updated At" value={formatInstantDateTime(serviceGroup.updatedAt)} />
      </FormSection>

      {moveAppt && (
        <MoveToGroupModal
          open
          onClose={() => setMoveAppt(null)}
          appointments={[moveAppt]}
          onSuccess={() => {
            setMoveAppt(null);
            onMoved?.();
          }}
        />
      )}
    </div>
  );
}
