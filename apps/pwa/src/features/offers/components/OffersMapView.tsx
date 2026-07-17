import { useEffect, useRef, useState } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import { env } from '@/config/env';
import { computeBounds, isSinglePointBounds } from '@/lib/map-bounds';
import type { MarketplaceOffer } from '../types';

export interface ExpandedGroupAppointment {
  /** Marker identity only — never rendered in the UI. */
  id: string;
  street: string;
  suburb: string;
  timeSlotStart: string;
  timeSlotEnd: string;
  coordinates: { lat: number; lng: number } | null;
}

export interface ExpandedGroup {
  groupId: string;
  appointments: ExpandedGroupAppointment[];
}

interface OffersMapViewProps {
  offers: MarketplaceOffer[];
  onSelectOffer: (groupId: string) => void;
  /** When set, the map shows only this group's appointment pins (drill-down mode). */
  expandedGroup?: ExpandedGroup | null;
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

const PIN_BASE_STYLE = [
  'width:36px',
  'height:36px',
  'padding:0',
  'border-radius:50%',
  'box-shadow:0 2px 10px rgba(0,0,0,0.35)',
  'display:flex',
  'align-items:center',
  'justify-content:center',
  'cursor:pointer',
  'font-size:13px',
  'font-weight:700',
  'font-family:inherit',
  'user-select:none',
];

// NOTE: never set `style.transform` on the marker element (e.g. hover scale
// effects) — mapbox-gl positions Markers via an inline translate() transform
// on this same element, so overwriting it snaps the pin to the map origin.
function makeMarkerEl(count: number): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('data-testid', 'map-pin');
  el.setAttribute('aria-label', `Group with ${count} ${count === 1 ? 'inspection' : 'inspections'}`);
  el.style.cssText = [
    ...PIN_BASE_STYLE,
    `background-color:${PRIMARY_COLOR}`,
    'border:2.5px solid white',
    'color:white',
  ].join(';');
  el.textContent = String(count);
  return el;
}

/** Appointment pin inside an expanded group — labeled with a 1-based position, not an id/code. */
function makeAppointmentMarkerEl(index: number): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('data-testid', 'map-appointment-pin');
  el.setAttribute('aria-label', `Inspection ${index + 1} details`);
  el.style.cssText = [
    ...PIN_BASE_STYLE,
    'background-color:white',
    `border:2.5px solid ${PRIMARY_COLOR}`,
    `color:${PRIMARY_COLOR}`,
  ].join(';');
  el.textContent = String(index + 1);
  return el;
}

/** Same validity rule as computeBounds — finite values within geographic ranges. */
function isValidCoordinate(coordinates: { lat: number; lng: number } | null): coordinates is {
  lat: number;
  lng: number;
} {
  if (!coordinates) return false;
  const { lat, lng } = coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function OffersMapView({ offers, onSelectOffer, expandedGroup = null }: OffersMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const mapLoadedRef = useRef(false);
  const prevExpandedIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

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
        renderMode(map, mapboxgl);
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
      prevExpandedIdRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  // Re-render pins when offers change or the drill-down mode toggles. The
  // dependency on expandedGroup keeps the periodic offers refetch from
  // clobbering the expanded pin set.
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) return;
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (!mapRef.current || !mapLoadedRef.current) return;
      renderMode(mapRef.current, mapboxgl);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers, onSelectOffer, expandedGroup]);

  // Close the info chip whenever the drill-down target changes or is cleared.
  useEffect(() => {
    setSelectedAppointmentId(null);
  }, [expandedGroup?.groupId]);

  function renderMode(map: any, mapboxgl: any) {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (expandedGroup) {
      placeAppointmentMarkers(map, mapboxgl, expandedGroup);
    } else {
      placeOfferMarkers(map, mapboxgl, offers, onSelectOffer);
    }
    moveCameraOnModeChange(map);
  }

  function placeOfferMarkers(
    map: any,
    mapboxgl: any,
    currentOffers: MarketplaceOffer[],
    onSelect: (id: string) => void,
  ) {
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

  function placeAppointmentMarkers(map: any, mapboxgl: any, group: ExpandedGroup) {
    group.appointments.forEach((appointment, index) => {
      if (!isValidCoordinate(appointment.coordinates)) return;
      const el = makeAppointmentMarkerEl(index);
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        setSelectedAppointmentId((prev) => (prev === appointment.id ? null : appointment.id));
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([appointment.coordinates.lng, appointment.coordinates.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }

  /** fitBounds/flyTo only when entering or leaving the drill-down, not on every refetch. */
  function moveCameraOnModeChange(map: any) {
    const currentId = expandedGroup?.groupId ?? null;
    if (prevExpandedIdRef.current === currentId) return;
    prevExpandedIdRef.current = currentId;

    const points = expandedGroup
      ? expandedGroup.appointments.map((a) => ({
          latitude: a.coordinates?.lat ?? null,
          longitude: a.coordinates?.lng ?? null,
        }))
      : offers.map((o) => ({ latitude: o.centroid?.lat ?? null, longitude: o.centroid?.lng ?? null }));
    const singlePointZoom = expandedGroup ? 15 : 12;

    const bounds = computeBounds(points);
    if (!bounds) return;
    if (isSinglePointBounds(bounds)) {
      const [[lng, lat]] = bounds as [[number, number], [number, number]];
      map.flyTo({ center: [lng, lat], zoom: singlePointZoom, duration: 700 });
    } else {
      map.fitBounds(bounds, { padding: 48, maxZoom: singlePointZoom, duration: 700 });
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

  const hasAnyOfferPin = offers.some((o) => o.centroid !== null);
  const expandedHasPin = expandedGroup
    ? expandedGroup.appointments.some((a) => isValidCoordinate(a.coordinates))
    : false;
  const showNoPinsOverlay = expandedGroup ? !expandedHasPin : !hasAnyOfferPin;
  const selectedAppointment =
    expandedGroup && selectedAppointmentId
      ? expandedGroup.appointments.find((a) => a.id === selectedAppointmentId) ?? null
      : null;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        data-testid="map-container"
        className="h-[60vh] w-full overflow-hidden rounded-2xl"
      />
      {showNoPinsOverlay && (
        <div
          data-testid="map-no-pins"
          className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/20"
        >
          <p className="text-sm font-medium text-white">
            {expandedGroup ? 'No location data for this group' : 'No offers with location data'}
          </p>
        </div>
      )}
      {selectedAppointment && (
        <div
          data-testid="map-appointment-chip"
          className="absolute inset-x-3 bottom-3 flex items-start justify-between gap-2 rounded-2xl bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-text-primary">
              {selectedAppointment.street || 'Address unavailable'}
            </p>
            <p className="truncate text-xs text-text-secondary">{selectedAppointment.suburb}</p>
            <p className="mt-0.5 text-xs font-semibold text-primary">
              {selectedAppointment.timeSlotStart}–{selectedAppointment.timeSlotEnd}
            </p>
          </div>
          <button
            data-testid="map-appointment-chip-close"
            aria-label="Close appointment info"
            onClick={() => setSelectedAppointmentId(null)}
            className="min-h-touch min-w-touch -mr-2 -mt-1 inline-flex items-center justify-center rounded-full text-[rgba(0,0,0,0.54)] active:bg-black/10"
          >
            <i className="mdi mdi-close text-lg" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
