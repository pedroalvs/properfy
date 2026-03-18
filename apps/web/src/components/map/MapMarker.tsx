interface MapMarkerProps {
  longitude: number;
  latitude: number;
  color?: string;
  label?: string;
  onClick?: () => void;
  active?: boolean;
  clustered?: boolean;
  clusterCount?: number;
}

export function MapMarker({
  longitude,
  latitude,
  color = 'var(--color-primary)',
  label,
  onClick,
  active = false,
  clustered = false,
  clusterCount,
}: MapMarkerProps) {
  const size = clustered ? 'h-10 w-10 text-sm' : 'h-7 w-7 text-xs';
  const ringClass = active ? 'ring-2 ring-secondary ring-offset-2' : '';

  return (
    <div
      className="absolute"
      style={{
        // Position would be calculated by mapbox-gl projection
        // Using data attributes for testing
        transform: 'translate(-50%, -100%)',
      }}
      data-testid="map-marker"
      data-longitude={longitude}
      data-latitude={latitude}
      data-color={color}
    >
      <button
        type="button"
        className={`flex items-center justify-center rounded-full shadow-md transition-transform hover:scale-110 ${size} ${ringClass}`}
        style={{ backgroundColor: color }}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        aria-label={label ?? `Map marker at ${latitude}, ${longitude}`}
      >
        {clustered && clusterCount ? (
          <span className="font-bold text-white">{clusterCount}</span>
        ) : (
          <i className="mdi mdi-map-marker text-white text-base" aria-hidden="true" />
        )}
      </button>
      {label && !clustered && (
        <div className="mt-1 whitespace-nowrap text-center text-xs font-medium text-text-primary">
          {label}
        </div>
      )}
    </div>
  );
}
