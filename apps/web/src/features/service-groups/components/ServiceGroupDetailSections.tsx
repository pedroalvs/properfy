import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { PRIORITY_MODE_MAP } from '@/lib/status-colors';
import { formatDateTime } from '@/lib/format-date';
import { ServiceGroupStatusChip } from './ServiceGroupStatusChip';
import type { ServiceGroupDetail } from '../types';

interface ServiceGroupDetailSectionsProps {
  serviceGroup: ServiceGroupDetail;
}

export function ServiceGroupDetailSections({ serviceGroup }: ServiceGroupDetailSectionsProps) {
  const priorityStyle = PRIORITY_MODE_MAP[serviceGroup.priorityMode];

  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Information">
        <DetailRow label="Name" value={serviceGroup.name} />
        <DetailRow label="Region" value={serviceGroup.regionName} />
        <DetailRow label="Status" value={<ServiceGroupStatusChip status={serviceGroup.status} />} />
        <DetailRow
          label="Priority"
          value={
            <span
              className="inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5"
              style={{ backgroundColor: priorityStyle.bg, color: priorityStyle.text }}
            >
              {priorityStyle.label}
            </span>
          }
        />
      </FormSection>

      <FormSection title="Inspector">
        <DetailRow label="Inspector Name" value={serviceGroup.inspectorName} />
      </FormSection>

      <FormSection title="Appointments">
        <DetailRow label="Count" value={serviceGroup.appointmentsCount.toString()} />
        <DetailRow label="Codes" value={serviceGroup.appointmentCodes.length > 0 ? serviceGroup.appointmentCodes.join(', ') : null} />
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
