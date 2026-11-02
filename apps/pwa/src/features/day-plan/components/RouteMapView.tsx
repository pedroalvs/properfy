import { useEffect, useRef, useState } from 'react';
import { Crosshair } from 'lucide-react';
import type { DayPlanResponse } from '@properfy/shared';
import {
  applyCollisionOffsets,
  computeCenter,
  makeNumberedMarkerEl,
  MapStatusOverlay,
  useGeoJsonLineLayer,
  useMapboxInstance,
  useMapCamera,
  type PlacedMarker,
} from '@/lib/map';
import { useRoutePins, type RoutePin } from '../hooks/useRoutePins';
import { RouteMapChip } from './RouteMapChip';

const ROUTE_SOURCE_ID = 'day-plan-route';

interface RouteMapViewProps {
  plan: DayPlanResponse;
  /** The current display order (plan order, or the local draft order while reordering). */
  displayOrder: string[];
  /** While a reorder draft is dirty the plan line is stale, so it is hidden. */
  isDirty: boolean;
}

/**
 * The route map: numbered pins in the current order, an origin marker, and the
 * real Directions line (solid for real legs, dashed for approximate). Lazy so
 * `mapbox-gl` is only fetched when the inspector opens the Map tab. All the
 * information here also exists on the List tab — the map is complementary.
 */
export default function RouteMapView({ plan, displayOrder, isDirty }: RouteMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<PlacedMarker[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

  const pins = useRoutePins(plan, displayOrder, isDirty);
  const camera = useMapCamera({ points: pins.cameraPoints, framingKey: null });

  const { mapRef, mapLoadedRef, mapReady, error, retry } = useMapboxInstance({
    containerRef,
    getInitialView: () => ({
      center: computeCenter(pins.cameraPoints),
      zoom: pins.stopPins.length > 0 ? 11 : 4,
    }),
    onUserGesture: camera.markUserMoved,
    onTeardown: camera.resetFraming,
  });

  // Place the stop + origin markers whenever the map becomes ready or the pins change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) {
      markersRef.current.forEach((m) => m.marker.remove());
      markersRef.current = [];
      return;
    }
    let cancelled = false;
    void import('mapbox-gl').then(({ default: mapboxgl }) => {
      const current = mapRef.current;
      if (cancelled || !current || !mapLoadedRef.current) return;
      markersRef.current.forEach((m) => m.marker.remove());
      markersRef.current = [];

      if (pins.origin) {
        const el = makeNumberedMarkerEl({
          label: '',
          variant: 'origin',
          ariaLabel: pins.origin.ariaLabel,
          testId: 'route-map-origin-pin',
        });
        const marker = new mapboxgl.Marker({ element: el }).setLngLat([pins.origin.lng, pins.origin.lat]).addTo(current);
        markersRef.current.push({ id: 'origin', marker, lng: pins.origin.lng, lat: pins.origin.lat });
      }

      for (const pin of pins.stopPins) {
        const el = makeNumberedMarkerEl({
          label: pin.label,
          variant: pin.variant,
          ariaLabel: pin.ariaLabel,
          testId: 'route-map-pin',
        });
        el.addEventListener('click', () => setSelectedPinId(pin.appointmentId));
        const marker = new mapboxgl.Marker({ element: el }).setLngLat([pin.lng, pin.lat]).addTo(current);
        markersRef.current.push({ id: pin.appointmentId, marker, lng: pin.lng, lat: pin.lat });
      }

      applyCollisionOffsets(markersRef.current);
      camera.syncCamera(current);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, pins]);

  // Clean up markers on unmount.
  useEffect(() => () => markersRef.current.forEach((m) => m.marker.remove()), []);

  // The real line — hidden (empty) while a draft is dirty, since its ETAs are stale.
  useGeoJsonLineLayer({
    mapRef,
    mapLoadedRef,
    mapReady,
    sourceId: ROUTE_SOURCE_ID,
    data: isDirty ? null : (plan.geometry as unknown as GeoJSON.FeatureCollection | null),
  });

  // Drop the chip if its pin left the map.
  const selectedPin: RoutePin | null = selectedPinId
    ? pins.stopPins.find((p) => p.appointmentId === selectedPinId) ?? null
    : null;
  useEffect(() => {
    if (selectedPinId && !pins.stopPins.some((p) => p.appointmentId === selectedPinId)) setSelectedPinId(null);
  }, [pins, selectedPinId]);

  const showNoPins = pins.stopPins.length === 0 && !pins.origin;

  const fitRoute = () => {
    camera.refit();
    if (mapRef.current) camera.syncCamera(mapRef.current);
  };

  return (
    <div className="relative">
      <div
        ref={containerRef}
        data-testid="map-container"
        aria-label="Route map"
        className="h-[calc(100dvh-16rem)] min-h-[320px] w-full overflow-hidden rounded-2xl md:h-[calc(100dvh-12rem)]"
      />

      {!error && !showNoPins && (
        <button
          type="button"
          aria-label="Fit route"
          onClick={fitRoute}
          className="min-h-touch min-w-touch absolute right-3 top-3 inline-flex items-center justify-center rounded-full bg-card/95 text-foreground shadow-md active:bg-muted"
        >
          <Crosshair size={18} aria-hidden="true" />
        </button>
      )}

      <MapStatusOverlay
        error={error}
        onRetry={retry}
        showNoPins={showNoPins}
        noPinsMessage="None of today's stops have a location on the map."
      />

      {!error && !showNoPins && pins.offMapCount > 0 && (
        <p data-testid="route-map-offmap-note" className="mt-2 text-xs text-muted-foreground">
          {pins.offMapCount} {pins.offMapCount === 1 ? 'stop' : 'stops'} aren&apos;t on the map: location not found
        </p>
      )}

      {!error && isDirty && (
        <div
          data-testid="route-map-dirty-chip"
          className="absolute inset-x-3 top-3 rounded-2xl bg-card/95 px-4 py-2 text-center text-xs font-medium text-foreground shadow"
        >
          Save to update the route line
        </div>
      )}

      {selectedPin && <RouteMapChip pin={selectedPin} onClose={() => setSelectedPinId(null)} />}
    </div>
  );
}
