import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { formatDateTime } from '@/lib/format-date';
import { formatArea, formatRent, formatYesNo } from '@/lib/format-property';
import { PropertyTypeChip } from './PropertyTypeChip';
import { GeocodingStatusBadge } from './GeocodingStatusBadge';
import type { PropertyDetail } from '../types';

interface PropertyDetailSectionsProps {
  property: PropertyDetail;
}


export function PropertyDetailSections({ property }: PropertyDetailSectionsProps) {
  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Identification">
        <DetailRow label="Code" value={property.propertyCode} />
        <DetailRow label="Type" value={<PropertyTypeChip type={property.type} />} />
        {property.type === 'APARTMENT' && (
          <DetailRow label="Apartment" value={property.apartmentNumber} />
        )}
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

      <FormSection title="Details">
        <DetailRow label="Private Area" value={formatArea(property.privateAreaM2)} />
        <DetailRow label="Total Area" value={formatArea(property.totalAreaM2)} />
        <DetailRow label="Furnished" value={formatYesNo(property.furnished)} />
        <DetailRow label="Linen Provided" value={formatYesNo(property.linenProvided)} />
        <DetailRow label="Rent Amount" value={formatRent(property.rentAmount)} />
      </FormSection>

      <FormSection title="Geocoding">
        <DetailRow
          label="Status"
          value={<GeocodingStatusBadge status={property.geocodingStatus} size="sm" />}
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
        <DetailRow label="Created At" value={formatDateTime(property.createdAt)} />
        <DetailRow label="Updated At" value={formatDateTime(property.updatedAt)} />
      </FormSection>
    </div>
  );
}
