import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapInstance } from './MapContainer';

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

/**
 * Renders a marker at the given geographic coordinates on the enclosing MapContainer.
 * Uses `mapboxgl.Marker` internally so positioning is handled by Mapbox GL's projection.
 * The marker element is styled via React so we keep onClick, active state, and theming.
 *
 * When rendered outside a MapContainer (e.g., in unit tests), the component still produces
 * a visible DOM element with data attributes so existing assertions continue to work.
 */
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
  const { getMap } = useMapInstance();
  const elementRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  // Attach the element to mapboxgl.Marker when the map is available
  useEffect(() => {
    const map = getMap();
    const element = elementRef.current;
    if (!map || !element) return;

    const marker = new mapboxgl.Marker({ element, anchor: 'bottom' })
      .setLngLat([longitude, latitude])
      .addTo(map);
    markerRef.current = marker;

    return () => {
      marker.remove();
      markerRef.current = null;
    };
    // Intentionally only depend on getMap so we create the marker once and update via setLngLat below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getMap]);

  // Update marker position when coordinates change
  useEffect(() => {
    markerRef.current?.setLngLat([longitude, latitude]);
  }, [longitude, latitude]);

  const size = clustered ? 'h-10 w-10 text-sm' : 'h-7 w-7 text-xs';
  const ringClass = active ? 'ring-2 ring-secondary ring-offset-2' : '';

  return (
    <div
      ref={elementRef}
      className="inline-block"
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
