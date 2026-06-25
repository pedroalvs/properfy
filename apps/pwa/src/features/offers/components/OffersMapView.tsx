import { useEffect, useRef, useState } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import { env } from '@/config/env';
import type { MarketplaceOffer } from '../types';

interface OffersMapViewProps {
  offers: MarketplaceOffer[];
  onSelectOffer: (groupId: string) => void;
}

const AU_CENTRE: [number, number] = [133.7751, -25.2744];
const PRIMARY_COLOR = '#009DD9';

function computeCenter(offers: MarketplaceOffer[]): [number, number] {
  const withCentroid = offers.filter((o) => o.centroid !== null);
  if (withCentroid.length === 0) return AU_CENTRE;
  const lat = withCentroid.reduce((s, o) => s + o.centroid!.lat, 0) / withCentroid.length;
  const lng = withCentroid.reduce((s, o) => s + o.centroid!.lng, 0) / withCentroid.length;
  return [lng, lat];
}

function makeMarkerEl(count: number): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('data-testid', 'map-pin');
  el.style.cssText = [
    'width:36px',
    'height:36px',
    `background-color:${PRIMARY_COLOR}`,
    'border-radius:50%',
    'border:2.5px solid white',
    'box-shadow:0 2px 10px rgba(0,0,0,0.35)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'cursor:pointer',
    'font-size:13px',
    'font-weight:700',
    'color:white',
    'font-family:inherit',
    'user-select:none',
    'transition:transform 0.15s ease',
  ].join(';');
  el.textContent = String(count);
  el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.15)'; });
  el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });
  return el;
}

export function OffersMapView({ offers, onSelectOffer }: OffersMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const mapLoadedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Initialize the map once (or on retry).
  useEffect(() => {
    if (!containerRef.current) return;

    if (!env.mapboxToken) {
      setError('Map unavailable — VITE_MAPBOX_TOKEN not configured.');
      return;
    }

    let cancelled = false;
    setError(null);

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = env.mapboxToken;
      const center = computeCenter(offers);

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center,
        zoom: offers.some((o) => o.centroid) ? 11 : 4,
      });

      map.addControl(new mapboxgl.NavigationControl(), 'top-right');

      mapRef.current = map;

      map.on('load', () => {
        if (cancelled) return;
        mapLoadedRef.current = true;
        placeMarkers(map, mapboxgl, offers, onSelectOffer);
      });

      map.on('error', () => {
        if (!cancelled) setError('Map failed to load. Check your connection.');
      });
    }).catch(() => {
      if (!cancelled) setError('Map library failed to load.');
    });

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapLoadedRef.current = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [retryKey]);

  // Update markers when offers change after map is already loaded.
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return;
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      placeMarkers(mapRef.current, mapboxgl, offers, onSelectOffer);
    });
  }, [offers, onSelectOffer]);

  function placeMarkers(
    map: any,
    mapboxgl: any,
    currentOffers: MarketplaceOffer[],
    onSelect: (id: string) => void,
  ) {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const offer of currentOffers) {
      if (!offer.centroid) continue;
      const el = makeMarkerEl(offer.appointmentCount);
      el.setAttribute('data-group-id', offer.groupId);
      el.addEventListener('click', () => onSelect(offer.groupId));

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([offer.centroid.lng, offer.centroid.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }

  if (error) {
    return (
      <div
        data-testid="map-error"
        className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl bg-gray-100 px-6 text-center"
      >
        <p className="text-sm text-gray-500">{error}</p>
        <button
          onClick={() => setRetryKey((k) => k + 1)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  const hasAnyPin = offers.some((o) => o.centroid !== null);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        data-testid="map-container"
        className="h-[60vh] w-full overflow-hidden rounded-2xl"
      />
      {!hasAnyPin && (
        <div
          data-testid="map-no-pins"
          className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/20"
        >
          <p className="text-sm font-medium text-white">No offers with location data</p>
        </div>
      )}
    </div>
  );
}
