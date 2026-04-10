import { useRef, useEffect, useState, useCallback, type ReactNode } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { env } from '@/config/env';

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
  onMapReady?: (map: mapboxgl.Map) => void;
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
  onMapReady,
}: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;

  const [mapReady, setMapReady] = useState(false);
  const [tokenMissing, setTokenMissing] = useState(false);

  const initialViewRef = useRef(initialViewState);

  useEffect(() => {
    if (!containerRef.current) return;

    const token = env.mapboxToken;
    if (!token) {
      setTokenMissing(true);
      return;
    }

    mapboxgl.accessToken = token;

    const { longitude, latitude, zoom } = initialViewRef.current;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [longitude, latitude],
      zoom,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('load', () => {
      setMapReady(true);
      onMapReadyRef.current?.(map);
    });

    map.on('click', (e: mapboxgl.MapMouseEvent) => {
      onMapClickRef.current?.(e.lngLat.lng, e.lngLat.lat);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []); // eslint-disable-line -- map initialization must run once

  const getMap = useCallback(() => mapRef.current, []);

  if (tokenMissing) {
    return (
      <div
        className={`relative flex h-full w-full items-center justify-center bg-gray-100 ${className}`}
        data-testid="map-container"
        role="application"
        aria-label="Map"
      >
        <div className="flex flex-col items-center gap-2 text-center" data-testid="map-token-error">
          <i className="mdi mdi-map-marker-off text-3xl text-error" aria-hidden="true" />
          <p className="text-sm font-semibold text-text-primary">Mapbox token not configured</p>
          <p className="text-xs text-text-muted">
            Set <code className="rounded bg-gray-200 px-1">VITE_MAPBOX_TOKEN</code> in your environment to enable maps.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full ${className}`}
      data-testid="map-container"
      role="application"
      aria-label="Map"
    >
      {!mapReady && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100">
          <div className="flex items-center gap-2 text-text-secondary">
            <i className="mdi mdi-loading mdi-spin text-xl" aria-hidden="true" />
            Loading map...
          </div>
        </div>
      )}
      {mapReady && children && (
        <MapContext.Provider value={{ getMap }}>
          {/* Children (MapMarker, etc.) register themselves with the map via effects.
              They return DOM elements that mapboxgl.Marker mounts into the map canvas. */}
          <div className="hidden">{children}</div>
        </MapContext.Provider>
      )}
    </div>
  );
}

import { createContext, useContext } from 'react';

interface MapContextValue {
  getMap: () => mapboxgl.Map | null;
}

const MapContext = createContext<MapContextValue>({ getMap: () => null });

export function useMapInstance() {
  return useContext(MapContext);
}
