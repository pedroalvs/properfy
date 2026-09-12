import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { formatCivilDate, formatInstantDateTime, toLocalISODate } from '@/lib/format-date';
import { usePaginatedQuery, useAllPagesQuery } from '@/hooks/useApiQuery';
import { useInspectorDocumentDownload } from '../hooks/useInspectorDocumentDownload';
import type { InspectorDetail } from '../types';
import { formatAuPhone } from '@/lib/phone-mask';
import { StarRating } from '@/components/ui/StarRating';

interface InspectorDetailSectionsProps {
  inspector: InspectorDetail;
}

/** Neutral label for a genuine lookup miss — never render the raw id. */
const UNKNOWN_LABEL = 'Unknown';

function formatList(items: string[] | undefined | null): string | null {
  return items && items.length > 0 ? items.join(', ') : null;
}

/** A document is "on file" once a storage key exists, whether or not the
 * upload metadata carries a human-readable file name. */
function documentLabel(
  meta: { fileName?: string | null } | null | undefined,
  fileKey: string | null | undefined,
  genericLabel: string,
): string | null {
  if (meta?.fileName) return meta.fileName;
  if (fileKey) return genericLabel;
  return null;
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

  const insuranceMeta = inspector.insuranceMetaJson;
  const policeMeta = inspector.policeCheckMetaJson;
  // Unbounded (all-pages) fetches: the inspector's own service types, regions
  // or blocked agencies can reference a record beyond the backend's 100-row
  // page cap. A raw `?? id` fallback there would leak the UUID into the UI.
  // Only resolve the catalogs the inspector actually references, and keep them
  // briefly fresh — otherwise every drawer open pays up to 50 sequential page
  // fetches even to resolve zero ids.
  const { data: serviceTypesData } = useAllPagesQuery<{ id: string; name: string }>(
    ['service-types', 'inspector-detail'],
    '/v1/service-types',
    undefined,
    { enabled: inspector.serviceTypes.length > 0, staleTime: 5 * 60 * 1000 },
  );
  const serviceTypeNameMap = new Map((serviceTypesData?.data ?? []).map((item) => [item.id, item.name]));
  const serviceTypeLabels = inspector.serviceTypes.map((entry) => {
    const id = typeof entry === 'string' ? entry : entry.serviceTypeId;
    return serviceTypeNameMap.get(id) ?? UNKNOWN_LABEL;
  });

  const { data: regionsData } = useAllPagesQuery<{ id: string; name: string }>(
    ['service-regions', 'inspector-detail'],
    '/v1/service-regions',
    undefined,
    { enabled: (inspector.regionIds ?? []).length > 0, staleTime: 5 * 60 * 1000 },
  );
  const regionNameMap = new Map((regionsData?.data ?? []).map((item) => [item.id, item.name]));
  const regionLabels = (inspector.regionIds ?? []).map(
    (regionId) => regionNameMap.get(regionId) ?? UNKNOWN_LABEL,
  );

  const { data: tenantsData } = useAllPagesQuery<{ id: string; name: string }>(
    ['tenants', 'inspector-detail'],
    '/v1/tenants',
    undefined,
    { enabled: (inspector.blockedClients ?? []).length > 0, staleTime: 5 * 60 * 1000 },
  );
  const tenantNameMap = new Map((tenantsData?.data ?? []).map((item) => [item.id, item.name]));
  const blockedClientLabels = (inspector.blockedClients ?? []).map(
    (id) => tenantNameMap.get(id) ?? UNKNOWN_LABEL,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Compact summary here as well as the Ratings tab: it rides on the detail
          payload already fetched, so it costs no extra request and answers the
          common question without a tab switch. */}
      <FormSection title="Rating">
        <DetailRow
          label="Rating"
          value={<StarRating value={inspector.ratingAvg} count={inspector.ratingCount} size="md" showValue />}
        />
        <DetailRow label="Completed" value={`${inspector.completedCount} inspections`} />
      </FormSection>

      <FormSection title="Personal Details">
        <DetailRow label="Name" value={inspector.name} />
        <DetailRow label="Full Name" value={inspector.fullName} />
        <DetailRow label="Email" value={inspector.email} />
        <DetailRow label="Phone" value={inspector.phone ? formatAuPhone(inspector.phone) : inspector.phone} />
        <DetailRow label="ABN" value={inspector.abn} />
        <DetailRow label="Date of Birth" value={inspector.dateOfBirth ? formatCivilDate(inspector.dateOfBirth) : null} />
      </FormSection>

      <FormSection title="Insurance &amp; Police Check">
        <DetailRow
          label="Insurance File"
          value={documentLabel(insuranceMeta, inspector.insuranceFileKey, 'Insurance document')}
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
          value={inspector.insuranceExpiresAt ? formatCivilDate(inspector.insuranceExpiresAt) : null}
        />
        <DetailRow
          label="Police Check File"
          value={documentLabel(policeMeta, inspector.policeCheckFileKey, 'Police check document')}
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
          value={inspector.policeCheckExpiresAt ? formatCivilDate(inspector.policeCheckExpiresAt) : null}
        />
      </FormSection>

      <FormSection title="Coverage">
        <DetailRow label="Regions" value={formatList(regionLabels)} />
        <DetailRow label="Service Types" value={formatList(serviceTypeLabels)} />
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
        <DetailRow label="Created At" value={formatInstantDateTime(inspector.createdAt)} />
        <DetailRow label="Updated At" value={formatInstantDateTime(inspector.updatedAt)} />
      </FormSection>
    </div>
  );
}
