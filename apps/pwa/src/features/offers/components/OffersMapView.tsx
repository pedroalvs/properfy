import { useEffect, useRef, useState } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import { env } from '@/config/env';
import { computeBounds, isPlottablePoint, isSinglePointBounds } from '@/lib/map-bounds';
import { resolveMarkerCollisions } from '@properfy/shared';
import type { MarketplaceOffer } from '../types';
import { formatWallTimeRange } from '@/lib/format-date';

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

/** One group on screen: zoom out enough to show the surrounding suburbs. */
const SINGLE_OFFER_ZOOM = 12;
/** One address on screen: street level, so the inspector can see the approach. */
const SINGLE_APPOINTMENT_ZOOM = 15;
/**
 * Upper bound for fitBounds, and what keeps two nearby group pins apart.
 * At Sydney's latitude zoom 12 is ~32 m/px, so two centroids 500 m apart land
 * ~16px from each other — closer than the 36px markers are wide, and one pin
 * hides the other. Zoom 15 (~4 m/px) puts that same pair ~125px apart.
 * fitBounds only reaches this cap when the pins really are close together, so
 * offers spread across a city are framed exactly as before.
 */
const MAX_FIT_ZOOM = 15;

function computeCenter(offers: MarketplaceOffer[]): [number, number] {
  const withCentroid = offers.filter((o) => isValidCoordinate(o.centroid));
  if (withCentroid.length === 0) return AU_CENTRE;
  const lat = withCentroid.reduce((s, o) => s + o.centroid!.lat, 0) / withCentroid.length;
  const lng = withCentroid.reduce((s, o) => s + o.centroid!.lng, 0) / withCentroid.length;
  return [lng, lat];
}

/**
 * Outer size of a pin. `box-sizing: border-box` (Tailwind preflight) means the
 * 2.5px ring is inside this, so it is also the exact centre-to-centre distance
 * at which two pins stop overlapping — which is why the collision pass reads
 * the same constant the style does.
 */
const PIN_DIAMETER_PX = 36;

const PIN_BASE_STYLE = [
  `width:${PIN_DIAMETER_PX}px`,
  `height:${PIN_DIAMETER_PX}px`,
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

/**
 * The shared plottability rule, in the `{ lat, lng }` shape the marketplace API
 * speaks. Delegating rather than restating it is what keeps pin visibility and
 * camera framing from drifting apart — a producer and a consumer disagreeing on
 * which coordinates count is the bug `isPlottablePoint` exists to prevent.
 */
function isValidCoordinate(coordinates: { lat: number; lng: number } | null): coordinates is {
  lat: number;
  lng: number;
} {
  if (!coordinates) return false;
  return isPlottablePoint({ latitude: coordinates.lat, longitude: coordinates.lng });
}

/** A marker plus the coordinate it stands for, so offsets can be recomputed. */
interface PlacedMarker {
  marker: any;
  lng: number;
  lat: number;
}

/**
 * Nudge any pins that would be drawn on top of each other into a touching row.
 *
 * The true coordinate of every marker is left alone — only `setOffset` moves,
 * which mapbox folds into its own positioning transform. (Writing to the
 * element's `style.transform` instead would fight that transform; see the note
 * on makeMarkerEl.)
 *
 * Must re-run whenever the camera settles: the offsets are in pixels and
 * whether two pins collide at all depends on the current zoom.
 */
function applyCollisionOffsets(map: any, placed: PlacedMarker[]): void {
  if (placed.length === 0) return;
  const screen = placed.map((p) => {
    const point = map.project([p.lng, p.lat]);
    return { x: point.x, y: point.y };
  });
  const offsets = resolveMarkerCollisions(screen, PIN_DIAMETER_PX);
  placed.forEach((p, index) => p.marker.setOffset(offsets[index]));
}

export function OffersMapView({ offers, onSelectOffer, expandedGroup = null }: OffersMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<PlacedMarker[]>([]);
  const mapLoadedRef = useRef(false);
  const prevExpandedIdRef = useRef<string | null>(null);
  /** Points the camera was last framed to — see syncCamera. */
  const fittedSignatureRef = useRef<string | null>(null);
  /** Ids of the pins the camera last framed — see syncCamera. */
  const fittedIdsRef = useRef<Set<string> | null>(null);
  /** Set once the inspector pans/zooms by hand; stops the auto-fit fighting them. */
  const userMovedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  /** Drives the render effect once mapbox is ready — see the 'load' handler. */
  const [mapReady, setMapReady] = useState(false);
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
        zoom: offers.some((o) => isValidCoordinate(o.centroid)) ? 11 : 4,
      });

      map.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // `originalEvent` is present only for real gestures — our own flyTo and
      // fitBounds raise these same events without one, and treating those as
      // user intent would disable the auto-fit on the very first frame.
      // Typed as `unknown` and narrowed here because mapbox-gl's `zoomstart`
      // listener type omits `originalEvent` even though a pinch/wheel zoom
      // carries one at runtime.
      const markUserMoved = (event: unknown) => {
        if ((event as { originalEvent?: unknown } | undefined)?.originalEvent) {
          userMovedRef.current = true;
        }
      };
      map.on('dragstart', markUserMoved);
      map.on('zoomstart', markUserMoved);

      // Collision offsets are in pixels, and which pins collide depends on the
      // zoom — so they have to be recomputed every time the camera settles,
      // whether the inspector moved it or one of our own fits did.
      map.on('moveend', () => {
        if (cancelled) return;
        applyCollisionOffsets(map, markersRef.current);
      });

      mapRef.current = map;

      // Flip state rather than rendering straight from here: this callback
      // closes over the offers of the render that created the map, and offers
      // routinely resolve while mapbox is still loading behind its dynamic
      // import. Letting the render effect do the work — by depending on
      // `mapReady` — is what guarantees it draws the *current* offers.
      map.on('load', () => {
        if (cancelled) return;
        mapLoadedRef.current = true;
        setMapReady(true);
      });

      map.on('error', () => {
        if (!cancelled) setError('Map failed to load. Check your connection.');
      });
    }).catch(() => {
      if (!cancelled) setError('Map library failed to load.');
    });

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.marker.remove());
      markersRef.current = [];
      mapLoadedRef.current = false;
      setMapReady(false);
      mapRef.current?.remove();
      mapRef.current = null;
      prevExpandedIdRef.current = null;
      fittedSignatureRef.current = null;
      fittedIdsRef.current = null;
      userMovedRef.current = false;
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
  }, [mapReady, offers, onSelectOffer, expandedGroup]);

  // Close the info chip whenever the drill-down target changes or is cleared.
  useEffect(() => {
    setSelectedAppointmentId(null);
  }, [expandedGroup?.groupId]);

  function renderMode(map: any, mapboxgl: any) {
    markersRef.current.forEach((m) => m.marker.remove());
    markersRef.current = [];

    if (expandedGroup) {
      placeAppointmentMarkers(map, mapboxgl, expandedGroup);
    } else {
      placeOfferMarkers(map, mapboxgl, offers, onSelectOffer);
    }
    applyCollisionOffsets(map, markersRef.current);
    syncCamera(map);
  }

  function placeOfferMarkers(
    map: any,
    mapboxgl: any,
    currentOffers: MarketplaceOffer[],
    onSelect: (id: string) => void,
  ) {
    for (const offer of currentOffers) {
      // Same validity rule as the appointment pins below: a NaN or out-of-range
      // centroid handed to setLngLat is a silently misplaced pin, which is
      // harder to notice than a missing one.
      if (!isValidCoordinate(offer.centroid)) continue;
      const el = makeMarkerEl(offer.appointmentCount);
      el.setAttribute('data-group-id', offer.groupId);
      el.addEventListener('click', () => onSelect(offer.groupId));

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([offer.centroid.lng, offer.centroid.lat])
        .addTo(map);
      markersRef.current.push({ marker, lng: offer.centroid.lng, lat: offer.centroid.lat });
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
      markersRef.current.push({
        marker,
        lng: appointment.coordinates.lng,
        lat: appointment.coordinates.lat,
      });
    });
  }

  /**
   * Frame whatever pins are currently on the map.
   *
   * Two requirements pull in opposite directions here. The camera must follow
   * pins that appear after mount — map mode has no scroll to drive pagination,
   * so MarketplacePage drains the remaining offer pages and the pins arrive in
   * waves; a fit-once camera leaves every later page off-screen. But it must
   * also never yank itself out from under an inspector who has started panning,
   * which is what the old "only on mode change" guard was protecting against.
   *
   * So: refit whenever the plotted points actually change, and stop for good
   * once a real gesture is seen. Comparing the points rather than the array
   * identity is what keeps the periodic refetch from re-framing the map when
   * nothing moved.
   *
   * (The previous guard compared `prevExpandedIdRef` against the current id;
   * both are null outside the drill-down, so it early-returned every time and
   * the offers view was never framed at all.)
   */
  function syncCamera(map: any) {
    const currentId = expandedGroup?.groupId ?? null;
    const modeChanged = prevExpandedIdRef.current !== currentId;
    prevExpandedIdRef.current = currentId;

    // Entering or leaving the drill-down is an explicit navigation, so it always
    // re-frames — and hands control back to the auto-fit.
    if (modeChanged) userMovedRef.current = false;

    const points = expandedGroup
      ? expandedGroup.appointments.map((a) => ({
          id: a.id,
          latitude: a.coordinates?.lat ?? null,
          longitude: a.coordinates?.lng ?? null,
        }))
      : offers.map((o) => ({
          id: o.groupId,
          latitude: o.centroid?.lat ?? null,
          longitude: o.centroid?.lng ?? null,
        }));
    const singlePointZoom = expandedGroup ? SINGLE_APPOINTMENT_ZOOM : SINGLE_OFFER_ZOOM;

    // Two questions, two keys, both taken from exactly the points computeBounds
    // will frame. Coordinates answer "would the camera frame anything
    // differently?" — order-independent, so it changes when and only when the
    // framing would. Ids answer "are the pins the inspector framed still here?",
    // and that one has to be about the entities rather than their positions: a
    // group's centroid is the mean of its appointments, so adding one shifts it,
    // and judging by coordinates made that micro-shift look like the whole offer
    // set had turned over — yanking the camera back on a single-offer map.
    const plottable = points.filter(isPlottablePoint);
    const signature = plottable
      .map((p) => `${p.latitude},${p.longitude}`)
      .sort()
      .join('|');
    const ids = plottable.map((p) => p.id);

    // A pan means "I want to look here", and is normally respected for good.
    // But if not one of the pins the camera was framing is still on the map,
    // that intent has nothing left to refer to — keeping the old view would
    // just show empty space with every new pin off screen.
    // A null `framed` means the camera has never successfully fitted anything —
    // panning a map that had no pins on it cannot count as choosing a view, and
    // treating it as one left the very first batch of pins off screen for good.
    const framed = fittedIdsRef.current;
    if (ids.length > 0 && (!framed || !ids.some((id) => framed.has(id)))) {
      userMovedRef.current = false;
    }

    if (!modeChanged && (userMovedRef.current || fittedSignatureRef.current === signature)) return;

    const bounds = computeBounds(points);
    if (!bounds) return;
    fittedSignatureRef.current = signature;
    fittedIdsRef.current = new Set(ids);

    if (isSinglePointBounds(bounds)) {
      const [[lng, lat]] = bounds as [[number, number], [number, number]];
      map.flyTo({ center: [lng, lat], zoom: singlePointZoom, duration: 700 });
    } else {
      map.fitBounds(bounds, { padding: 48, maxZoom: MAX_FIT_ZOOM, duration: 700 });
    }
  }

  // Mirrors what placeOfferMarkers actually plots, so an offer with a malformed
  // centroid can't suppress the overlay while contributing no pin.
  const hasAnyOfferPin = offers.some((o) => isValidCoordinate(o.centroid));
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
      {/*
        The error is an overlay, never a replacement: the init effect bails out
        on a missing container before it reaches setError(null), so unmounting
        the container to show this made Retry a dead button — the map could
        never come back.
      */}
      {error && (
        <div
          data-testid="map-error"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-gray-100 px-6 text-center"
        >
          <p className="text-sm text-gray-500">{error}</p>
          <button
            onClick={() => setRetryKey((k) => k + 1)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      )}
      {!error && showNoPinsOverlay && (
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
              {formatWallTimeRange(selectedAppointment.timeSlotStart, selectedAppointment.timeSlotEnd)}
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
