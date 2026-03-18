interface PropertyAddressSectionProps {
  address: string;
  latitude: number | null;
  longitude: number | null;
}

export function PropertyAddressSection({ address, latitude, longitude }: PropertyAddressSectionProps) {
  const mapsUrl = latitude && longitude
    ? `https://maps.google.com/?q=${latitude},${longitude}`
    : `https://maps.google.com/?q=${encodeURIComponent(address)}`;

  return (
    <section className="rounded-lg bg-card-bg p-4" data-testid="property-address-section">
      <h3 className="text-xs font-bold uppercase text-text-secondary">Property</h3>
      <p className="mt-1 text-sm text-text-primary">{address}</p>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary"
      >
        <i className="mdi mdi-map-marker text-base" aria-hidden="true" />
        Open in Maps
      </a>
    </section>
  );
}
