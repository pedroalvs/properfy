import { useNavigate } from 'react-router-dom';
import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { formatDate, formatDateTime } from '@/lib/format-date';
import { AppointmentStatusChip } from '@/features/appointments/components/AppointmentStatusChip';
import { ServiceGroupStatusChip } from './ServiceGroupStatusChip';
import type { AppointmentStatus } from '@properfy/shared';
import type { ServiceGroupDetail } from '../types';

interface ServiceGroupDetailSectionsProps {
  serviceGroup: ServiceGroupDetail;
}

export function ServiceGroupDetailSections({ serviceGroup }: ServiceGroupDetailSectionsProps) {
  const navigate = useNavigate();
  const appointments = serviceGroup.appointments ?? [];

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
              <button
                key={apt.id}
                type="button"
                onClick={() => navigate(`/appointments/${apt.id}`)}
                className="flex w-full items-center justify-between gap-3 px-2 py-2.5 text-left transition-colors hover:bg-black/[0.03] rounded"
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
                      {formatDate(apt.scheduledDate)}
                    </span>
                  )}
                  <AppointmentStatusChip status={apt.status as AppointmentStatus} />
                  <i className="mdi mdi-chevron-right text-lg text-text-muted" aria-hidden="true" />
                </div>
              </button>
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
        <DetailRow label="Created At" value={formatDateTime(serviceGroup.createdAt)} />
        <DetailRow label="Updated At" value={formatDateTime(serviceGroup.updatedAt)} />
      </FormSection>
    </div>
  );
}
