import type { Marker as MapboxMarker } from 'mapbox-gl';
import { resolveCoincidentMarkerOffsets } from '@properfy/shared';
import { isPlottablePoint } from '@/lib/map-bounds';

/**
 * Pure DOM-marker helpers for the offers map — no React, no mapbox-gl runtime
 * import (only a type). Keeping these out of the component lets them be unit
 * tested directly and shared between the pin-placement hook and its tests.
 */

// Design token, resolved by the browser: every usage below is an inline CSS
// style string on a DOM marker element (never a Mapbox GL paint property), so
// `hsl(var(--primary))` cascades from :root exactly like a hardcoded hex would.
// `--primary` holds HSL channels, so it must be wrapped in `hsl(...)` here.
export const PRIMARY_COLOR = 'hsl(var(--primary))';

/**
 * Outer size of a pin. `box-sizing: border-box` (Tailwind preflight) means the
 * 2.5px ring is inside this, so it is also the exact centre-to-centre distance
 * at which two pins stop overlapping — which is why the collision pass reads
 * the same constant the style does.
 */
export const PIN_DIAMETER_PX = 36;

export const PIN_BASE_STYLE = [
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
export function makeMarkerEl(count: number): HTMLButtonElement {
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
export function makeAppointmentMarkerEl(index: number): HTMLButtonElement {
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
export function isValidCoordinate(coordinates: { lat: number; lng: number } | null): coordinates is {
  lat: number;
  lng: number;
} {
  if (!coordinates) return false;
  return isPlottablePoint({ latitude: coordinates.lat, longitude: coordinates.lng });
}

/**
 * A marker plus the coordinate it stands for, so offsets can be recomputed.
 *
 * `id` is the group or appointment the pin belongs to: it orders the pins in a
 * coincident row, so the periodic offers refetch handing back the same pins in
 * a different order cannot swap two of them around.
 */
export interface PlacedMarker {
  id: string;
  marker: MapboxMarker;
  lng: number;
  lat: number;
}

/**
 * Nudge pins that share a coordinate into a touching row, so none of them is
 * drawn invisibly under another.
 *
 * Only exactly-coincident pins move — pins that are merely close keep their
 * true position, because zooming in separates those and a pin that wanders is
 * a pin that lies about where the job is.
 *
 * The true coordinate of every marker is left alone — only `setOffset` moves,
 * which mapbox folds into its own positioning transform. (Writing to the
 * element's `style.transform` instead would fight that transform; see the note
 * on makeMarkerEl.)
 *
 * Coincidence does not depend on the camera, so this runs once per pin render
 * rather than on every `moveend`.
 */
export function applyCollisionOffsets(placed: PlacedMarker[]): void {
  if (placed.length === 0) return;
  // Sorted by id so the row does not depend on the order the API happened to
  // return the offers in — otherwise a refetch could swap two pins that share
  // a centroid and make them jump past each other for no reason.
  const ordered = [...placed].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const offsets = resolveCoincidentMarkerOffsets(
    ordered.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    PIN_DIAMETER_PX,
  );
  // offsets is 1:1 with ordered (resolveCoincidentMarkerOffsets maps each point).
  ordered.forEach((p, index) => p.marker.setOffset(offsets[index]!));
}
