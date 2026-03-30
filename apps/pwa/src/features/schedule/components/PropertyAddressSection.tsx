interface PropertyAddressSectionProps {
  address: string;
  suburb?: string;
  latitude: number | null;
  longitude: number | null;
}

export function PropertyAddressSection({ address, suburb, latitude, longitude }: PropertyAddressSectionProps) {
  const hasCoordinates = latitude !== null && longitude !== null;
  const fullAddress = [address, suburb].filter(Boolean).join(', ');
  const mapsUrl = hasCoordinates
    ? `https://maps.google.com/?q=${latitude},${longitude}`
    : `https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`;

  return (
    <section
      className="overflow-hidden rounded-[20px] border border-black/[0.06] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.07)]"
      data-testid="property-address-section"
    >
      <div className="px-4 pt-4 pb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Property</p>
        <p className="mt-1 text-sm font-semibold leading-5 text-text-primary">{address}</p>
        {suburb && <p className="text-xs text-text-secondary">{suburb}</p>}
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
