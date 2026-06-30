import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { formatDate, formatDateTime, toLocalISODate } from '@/lib/format-date';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { useInspectorDocumentDownload } from '../hooks/useInspectorDocumentDownload';
import type { InspectorDetail } from '../types';

interface InspectorDetailSectionsProps {
  inspector: InspectorDetail;
}

function formatList(items: string[] | undefined | null): string | null {
  return items && items.length > 0 ? items.join(', ') : null;
}

function useInspectorWorkload(inspectorId: string) {
  const today = toLocalISODate(new Date());
  const weekEnd = toLocalISODate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

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
  const { download, isDownloading } = useInspectorDocumentDownload();

  const insuranceMeta = inspector.insuranceMetaJson as { fileName?: string | null; uploadedAt?: string | null } | null | undefined;
  const policeMeta = inspector.policeCheckMetaJson as { fileName?: string | null; uploadedAt?: string | null } | null | undefined;
  const { data: serviceTypesData } = usePaginatedQuery<{ id: string; name: string }>(
    ['service-types', 'inspector-detail'],
    '/v1/service-types',
    { pageSize: 100 },
  );
  const serviceTypeNameMap = new Map((serviceTypesData?.data ?? []).map((item) => [item.id, item.name]));
  const serviceTypeLabels = inspector.serviceTypes.map((entry) => {
    const id = typeof entry === 'string' ? entry : entry.serviceTypeId;
    return serviceTypeNameMap.get(id) ?? id;
  });

  const { data: regionsData } = usePaginatedQuery<{ id: string; name: string }>(
    ['service-regions', 'inspector-detail'],
    '/v1/service-regions',
    { pageSize: 100 },
  );
  const regionNameMap = new Map((regionsData?.data ?? []).map((item) => [item.id, item.name]));
  const regionLabels = (inspector.regionIds ?? []).map(
    (regionId) => regionNameMap.get(regionId) ?? regionId,
  );

  const { data: tenantsData } = usePaginatedQuery<{ id: string; name: string }>(
    ['tenants', 'inspector-detail'],
    '/v1/tenants',
    { pageSize: 100 },
  );
  const tenantNameMap = new Map((tenantsData?.data ?? []).map((item) => [item.id, item.name]));
  const clientEligibilityLabels = (inspector.clientEligibility ?? []).map((entry) => {
    const id = typeof entry === 'string' ? entry : entry.tenantId;
    return tenantNameMap.get(id) ?? id;
  });

  const blockedClientLabels = (inspector.blockedClients ?? []).map(
    (id) => tenantNameMap.get(id) ?? id,
  );

  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Personal Details">
        <DetailRow label="Name" value={inspector.name} />
        <DetailRow label="Full Name" value={inspector.fullName} />
        <DetailRow label="Email" value={inspector.email} />
        <DetailRow label="Phone" value={inspector.phone} />
        <DetailRow label="ABN" value={inspector.abn} />
        <DetailRow label="Date of Birth" value={inspector.dateOfBirth ? formatDate(inspector.dateOfBirth) : null} />
      </FormSection>

      <FormSection title="Insurance &amp; Police Check">
        <DetailRow
          label="Insurance File"
          value={insuranceMeta?.fileName ?? inspector.insuranceFileKey ?? null}
          action={
            insuranceMeta?.fileName || inspector.insuranceFileKey ? (
              <button
                onClick={() => download(inspector.id, 'INSURANCE')}
                disabled={isDownloading}
                className="text-xs text-primary hover:underline disabled:opacity-50"
                aria-label="Download insurance document"
              >
                Download
              </button>
            ) : undefined
          }
        />
        <DetailRow
          label="Insurance Expiry"
          value={inspector.insuranceExpiresAt ? formatDate(inspector.insuranceExpiresAt) : null}
        />
        <DetailRow
          label="Police Check File"
          value={policeMeta?.fileName ?? inspector.policeCheckFileKey ?? null}
          action={
            policeMeta?.fileName || inspector.policeCheckFileKey ? (
              <button
                onClick={() => download(inspector.id, 'POLICE_CHECK')}
                disabled={isDownloading}
                className="text-xs text-primary hover:underline disabled:opacity-50"
                aria-label="Download police check document"
              >
                Download
              </button>
            ) : undefined
          }
        />
        <DetailRow
          label="Police Check Expiry"
          value={inspector.policeCheckExpiresAt ? formatDate(inspector.policeCheckExpiresAt) : null}
        />
      </FormSection>

      <FormSection title="Coverage">
        <DetailRow label="Regions" value={formatList(regionLabels)} />
        <DetailRow label="Service Types" value={formatList(serviceTypeLabels)} />
        <DetailRow label="Agency Eligibility" value={formatList(clientEligibilityLabels)} />
        <DetailRow label="Blocked Agencies" value={formatList(blockedClientLabels)} />
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
