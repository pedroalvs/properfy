import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { GEOCODING_STATUS_MAP } from '@/lib/status-colors';
import { PropertyTypeChip } from './PropertyTypeChip';
import type { PropertyDetail } from '../types';

interface PropertyDetailSectionsProps {
  property: PropertyDetail;
}

function formatDateTimeBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

export function PropertyDetailSections({ property }: PropertyDetailSectionsProps) {
  const geocodingStyle = GEOCODING_STATUS_MAP[property.geocodingStatus];

  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Identification">
        <DetailRow label="Code" value={property.propertyCode} />
        <DetailRow label="Type" value={<PropertyTypeChip type={property.type} />} />
        <DetailRow label="Branch" value={property.branchName} />
      </FormSection>

      <FormSection title="Address">
        <DetailRow label="Street" value={property.street} />
        <DetailRow label="Address Line 2" value={property.addressLine2} />
        <DetailRow label="Suburb" value={property.suburb} />
        <DetailRow label="Postcode" value={property.postcode} />
        <DetailRow label="State" value={property.state} />
        <DetailRow label="Country" value={property.country} />
      </FormSection>

      <FormSection title="Geocoding">
        <DetailRow
          label="Status"
          value={
            <span
              className="inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5"
              style={{ backgroundColor: geocodingStyle.bg, color: geocodingStyle.text }}
            >
              {geocodingStyle.label}
            </span>
          }
        />
        <DetailRow label="Latitude" value={property.latitude?.toString()} />
        <DetailRow label="Longitude" value={property.longitude?.toString()} />
      </FormSection>

      {property.notes && (
        <FormSection title="Observations">
          <DetailRow label="Notes" value={property.notes} />
        </FormSection>
      )}

      <FormSection title="Record">
        <DetailRow label="Created At" value={formatDateTimeBR(property.createdAt)} />
        <DetailRow label="Updated At" value={formatDateTimeBR(property.updatedAt)} />
      </FormSection>
    </div>
  );
}
