import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { formatDateTime } from '@/lib/format-date';
import type { InspectorDetail } from '../types';

interface InspectorDetailSectionsProps {
  inspector: InspectorDetail;
}

function formatList(items: string[]): string | null {
  return items.length > 0 ? items.join(', ') : null;
}

function formatRating(rating: number | null): string | null {
  return rating !== null ? `${rating.toFixed(1)} / 5.0` : null;
}

export function InspectorDetailSections({ inspector }: InspectorDetailSectionsProps) {
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

      <FormSection title="Record">
        <DetailRow label="Created At" value={formatDateTime(inspector.createdAt)} />
        <DetailRow label="Updated At" value={formatDateTime(inspector.updatedAt)} />
      </FormSection>
    </div>
  );
}
