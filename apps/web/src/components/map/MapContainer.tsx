import { useRef, useEffect, useState, type ReactNode } from 'react';

export interface MapViewState {
  longitude: number;
  latitude: number;
  zoom: number;
}

interface MapContainerProps {
  initialViewState?: MapViewState;
  children?: ReactNode;
  className?: string;
  onMapClick?: (lng: number, lat: number) => void;
}

const DEFAULT_VIEW_STATE: MapViewState = {
  longitude: 133.7751,
  latitude: -25.2744,
  zoom: 4,
};

export function MapContainer({
  initialViewState = DEFAULT_VIEW_STATE,
  children,
  className = '',
  onMapClick,
}: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    // Map initialization would happen here with mapbox-gl
    // For now, render a placeholder that will be replaced when mapbox-gl is configured
    setMapReady(true);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full bg-gray-100 ${className}`}
      data-testid="map-container"
      data-longitude={initialViewState.longitude}
      data-latitude={initialViewState.latitude}
      data-zoom={initialViewState.zoom}
      onClick={(_e) => {
        if (onMapClick) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            // Simplified click coordinates — real implementation uses mapbox-gl projection
            onMapClick(initialViewState.longitude, initialViewState.latitude);
          }
        }
      }}
      role="application"
      aria-label="Map"
    >
      {!mapReady && (
        <div className="flex h-full items-center justify-center">
          <div className="text-text-secondary">Loading map...</div>
        </div>
      )}
      {mapReady && (
        <div className="relative h-full w-full" data-testid="map-canvas">
          {/* Map canvas rendered by mapbox-gl */}
          <div className="flex h-full items-center justify-center text-text-muted">
            <i className="mdi mdi-map-outline mr-2 text-2xl" aria-hidden="true" />
            Map View
          </div>
          {/* Overlay children (markers, popups, etc.) */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="pointer-events-auto">{children}</div>
          </div>
        </div>
      )}
    </div>
  );
}
