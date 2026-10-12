import { Navigation } from 'lucide-react';
import { PROPERTY_TYPE_LABELS, type PropertyType } from '@properfy/shared';
import { Card } from '@/components/ui/Card';

interface PropertyAddressSectionProps {
  address: string;
  addressLine2?: string | null;
  suburb?: string;
  latitude: number | null;
  longitude: number | null;
  propertyType?: PropertyType | null;
  privateAreaM2?: number | null;
  totalAreaM2?: number | null;
  furnished?: boolean | null;
  linenProvided?: boolean | null;
}

export function PropertyAddressSection({
  address,
  addressLine2,
  suburb,
  latitude,
  longitude,
  propertyType,
  privateAreaM2,
  totalAreaM2,
  furnished,
  linenProvided,
}: PropertyAddressSectionProps) {
  const hasCoordinates = latitude !== null && longitude !== null;
  const fullAddress = [address, suburb].filter(Boolean).join(', ');
  const mapsUrl = hasCoordinates
    ? `https://maps.google.com/?q=${latitude},${longitude}`
    : `https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`;

  const detailChips: string[] = [];
  if (propertyType) detailChips.push(PROPERTY_TYPE_LABELS[propertyType] ?? propertyType);
  if (privateAreaM2 != null) detailChips.push(`Private ${privateAreaM2} m²`);
  if (totalAreaM2 != null) detailChips.push(`Total ${totalAreaM2} m²`);
  if (furnished != null) detailChips.push(furnished ? 'Furnished' : 'Unfurnished');
  if (linenProvided != null) detailChips.push(linenProvided ? 'Linen provided' : 'No linen');

  return (
    <Card className="overflow-hidden p-0" data-testid="property-address-section">
      <div className="px-4 pt-4 pb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Property</p>
        <p className="mt-1 text-sm font-semibold leading-5 text-foreground">{address}</p>
        {addressLine2 && <p className="text-xs text-muted-foreground">{addressLine2}</p>}
        {suburb && <p className="text-xs text-muted-foreground">{suburb}</p>}
        {detailChips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" data-testid="property-detail-chips">
            {detailChips.map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
              >
                {chip}
              </span>
            ))}
          </div>
        )}
      </div>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 border-t border-border bg-primary/5 px-4 py-3 text-sm font-bold text-primary"
        data-testid="open-maps-link"
      >
        <Navigation className="h-4 w-4" aria-hidden="true" />
        Navigate to property
      </a>
    </Card>
  );
}
