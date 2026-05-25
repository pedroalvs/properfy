import { useEffect, useRef, useState } from 'react';
import { env } from '@/config/env';
import type { MarketplaceOffer } from '../types';

interface OffersMapViewProps {
  offers: MarketplaceOffer[];
  onSelectOffer: (groupId: string) => void;
}

function computeCenter(offers: MarketplaceOffer[]): [number, number] {
  const withCentroid = offers.filter((o) => o.centroid !== null);
  if (withCentroid.length === 0) return [133.7751, -25.2744]; // AU centre
  const lat = withCentroid.reduce((s, o) => s + o.centroid!.lat, 0) / withCentroid.length;
  const lng = withCentroid.reduce((s, o) => s + o.centroid!.lng, 0) / withCentroid.length;
  return [lng, lat];
}

export function OffersMapView({ offers, onSelectOffer }: OffersMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!env.mapboxToken) {
      setError('Map unavailable — no access token configured.');
      return;
    }

    let cancelled = false;

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = env.mapboxToken;
      const center = computeCenter(offers);

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center,
        zoom: 10,
      });

      mapRef.current = map;

      map.on('load', () => {
        if (cancelled) return;
        // Remove old markers
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];

        for (const offer of offers) {
          if (!offer.centroid) continue;
          const el = document.createElement('div');
          el.className = 'w-8 h-8 bg-primary rounded-full border-2 border-white shadow-md flex items-center justify-center cursor-pointer';
          el.setAttribute('data-testid', 'map-pin');
          el.setAttribute('data-group-id', offer.groupId);
          el.textContent = String(offer.appointmentCount);
          el.addEventListener('click', () => onSelectOffer(offer.groupId));

          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([offer.centroid.lng, offer.centroid.lat])
            .addTo(map);
          markersRef.current.push(marker);
        }
      });

      map.on('error', () => {
        setError('Map failed to load. Please check your connection.');
      });
    }).catch(() => {
      if (!cancelled) setError('Map library failed to load.');
    });

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [offers, onSelectOffer]);

  if (error) {
    return (
      <div
        data-testid="map-error"
        className="flex h-64 items-center justify-center rounded-2xl bg-gray-100 px-6 text-center text-sm text-gray-500"
      >
        {error}
      </div>
    );
  }

  const hasAnyPin = offers.some((o) => o.centroid !== null);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        data-testid="map-container"
        className="h-[60vh] w-full rounded-2xl overflow-hidden"
      />
      {!hasAnyPin && (
        <div
          data-testid="map-no-pins"
          className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-2xl"
        >
          <p className="text-sm text-white font-medium">No offers with location data</p>
        </div>
      )}
    </div>
  );
}
