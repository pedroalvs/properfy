interface PropertyAddressSectionProps {
  address: string;
  suburb?: string;
  latitude: number | null;
  longitude: number | null;
  propertyType?: string | null;
  privateAreaM2?: number | null;
  totalAreaM2?: number | null;
  furnished?: boolean | null;
  linenProvided?: boolean | null;
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  APARTMENT: 'Apartment',
  HOUSE: 'House',
  COMMERCIAL: 'Commercial',
  INDUSTRIAL: 'Industrial',
  RURAL: 'Rural',
};

export function PropertyAddressSection({
  address,
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
    <section
      className="overflow-hidden rounded-[20px] border border-black/[0.06] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.07)]"
      data-testid="property-address-section"
    >
      <div className="px-4 pt-4 pb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Property</p>
        <p className="mt-1 text-sm font-semibold leading-5 text-text-primary">{address}</p>
        {suburb && <p className="text-xs text-text-secondary">{suburb}</p>}
        {detailChips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" data-testid="property-detail-chips">
            {detailChips.map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] font-semibold text-text-secondary"
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
        className="flex items-center justify-center gap-2 border-t border-black/[0.06] bg-primary/5 px-4 py-3 text-sm font-bold text-primary"
        data-testid="open-maps-link"
      >
        <i className="mdi mdi-navigation text-base" aria-hidden="true" />
        Navigate to property
      </a>
    </section>
  );
}
