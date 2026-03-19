import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { formatDateTime } from '@/lib/format-date';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import type { InspectorDetail } from '../types';

interface InspectorDetailSectionsProps {
  inspector: InspectorDetail;
}

function formatList(items: string[] | undefined | null): string | null {
  return items && items.length > 0 ? items.join(', ') : null;
}

function formatRating(rating: number | null | undefined): string | null {
  return rating != null ? `${rating.toFixed(1)} / 5.0` : null;
}

function useInspectorWorkload(inspectorId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: scheduledData, isLoading: scheduledLoading } = usePaginatedQuery<{ id: string }>(
    ['appointments', 'inspector-workload-scheduled', inspectorId],
    '/v1/appointments',
    { inspectorId, status: 'SCHEDULED', pageSize: 1 },
    { enabled: !!inspectorId },
  );

  const { data: weekData, isLoading: weekLoading } = usePaginatedQuery<{ id: string }>(
    ['appointments', 'inspector-workload-week', inspectorId],
    '/v1/appointments',
    { inspectorId, status: 'SCHEDULED', fromDate: today, toDate: weekEnd, pageSize: 1 },
    { enabled: !!inspectorId },
  );

  return {
    scheduledCount: scheduledData?.pagination?.total ?? 0,
    weekCount: weekData?.pagination?.total ?? 0,
    isLoading: scheduledLoading || weekLoading,
  };
}

export function InspectorDetailSections({ inspector }: InspectorDetailSectionsProps) {
  const { scheduledCount, weekCount, isLoading: workloadLoading } = useInspectorWorkload(inspector.id);

  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Personal Details">
        <DetailRow label="Name" value={inspector.name} />
        <DetailRow label="Email" value={inspector.email} />
        <DetailRow label="Phone" value={inspector.phone} />
        <DetailRow label="CPF" value={inspector.document} />
      </FormSection>

      <FormSection title="Coverage">
        <DetailRow label="Regions" value={formatList(inspector.regions)} />
        <DetailRow label="Service Types" value={formatList(inspector.serviceTypes)} />
        <DetailRow label="Rating" value={formatRating(inspector.rating)} />
      </FormSection>

      <FormSection title="Workload">
        <DetailRow
          label="Scheduled"
          value={workloadLoading ? 'Loading...' : `${scheduledCount} upcoming`}
        />
        <DetailRow
          label="This Week"
          value={workloadLoading ? 'Loading...' : `${weekCount} appointments`}
        />
      </FormSection>

      <FormSection title="Record">
        <DetailRow label="Created At" value={formatDateTime(inspector.createdAt)} />
        <DetailRow label="Updated At" value={formatDateTime(inspector.updatedAt)} />
      </FormSection>
    </div>
  );
}
