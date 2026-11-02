import type { Marker as MapboxMarker } from 'mapbox-gl';
import { resolveCoincidentMarkerOffsets } from '@properfy/shared';
import { isPlottablePoint } from './bounds';

/**
 * Pure DOM-marker helpers for every map in the app (offers and the day-plan
 * route) — no React, no mapbox-gl runtime import (only a type). Keeping these
 * out of the component lets them be unit tested directly and shared between the
 * pin-placement hooks and their tests.
 */

// Design token, resolved by the browser: every usage below is an inline CSS
// style string on a DOM marker element (never a Mapbox GL paint property), so
// `hsl(var(--primary))` cascades from :root exactly like a hardcoded hex would.
// `--primary` holds HSL channels, so it must be wrapped in `hsl(...)` here.
export const PRIMARY_COLOR = 'hsl(var(--primary))';
/** Muted grey for completed/executed stops. */
export const DONE_COLOR = 'hsl(var(--muted-foreground))';

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

/**
 * The four marker appearances the app draws:
 * - `group`  filled primary circle, white ring, white label (offer group count, in-progress stop)
 * - `stop`   white circle, primary ring, primary label (a numbered, not-yet-started stop)
 * - `done`   grey circle, white ring, white check (a completed/executed stop)
 * - `origin` white circle, primary ring, a home glyph (the day's starting point)
 */
export type MarkerVariant = 'group' | 'stop' | 'done' | 'origin';

const HOME_GLYPH =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>';

interface NumberedMarkerArgs {
  /** The text shown in the pin (e.g. "3"); ignored for `origin` (home glyph) and `done` (check). */
  label: string;
  variant: MarkerVariant;
  ariaLabel: string;
  /** Overrides the default per-variant `data-testid`. */
  testId?: string;
}

function variantStyle(variant: MarkerVariant): string[] {
  switch (variant) {
    case 'group':
      return ['background-color:' + PRIMARY_COLOR, 'border:2.5px solid white', 'color:white'];
    case 'done':
      return ['background-color:' + DONE_COLOR, 'border:2.5px solid white', 'color:white'];
    case 'origin':
    case 'stop':
      return ['background-color:white', 'border:2.5px solid ' + PRIMARY_COLOR, 'color:' + PRIMARY_COLOR];
  }
}

const DEFAULT_TEST_ID: Record<MarkerVariant, string> = {
  group: 'map-pin',
  stop: 'map-pin',
  done: 'map-pin',
  origin: 'map-origin-pin',
};

/**
 * Build a circular `<button>` marker element with a number, check, or home
 * glyph, styled per `variant`. The colours come from the `--primary` /
 * `--muted-foreground` design tokens via inline `hsl(var(...))` strings — never
 * a Mapbox paint property.
 *
 * NOTE: never set `style.transform` on the marker element (e.g. a hover scale)
 * — mapbox-gl positions Markers via an inline translate() transform on this same
 * element, so overwriting it snaps the pin to the map origin.
 */
export function makeNumberedMarkerEl({ label, variant, ariaLabel, testId }: NumberedMarkerArgs): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('data-testid', testId ?? DEFAULT_TEST_ID[variant]);
  el.setAttribute('aria-label', ariaLabel);
  el.style.cssText = [...PIN_BASE_STYLE, ...variantStyle(variant)].join(';');
  if (variant === 'origin') {
    el.innerHTML = HOME_GLYPH;
  } else if (variant === 'done') {
    el.textContent = '✓';
  } else {
    el.textContent = label;
  }
  return el;
}

/** Offer group pin — filled primary circle labelled with the group's count. */
export function makeMarkerEl(count: number): HTMLButtonElement {
  return makeNumberedMarkerEl({
    label: String(count),
    variant: 'group',
    ariaLabel: `Group with ${count} ${count === 1 ? 'inspection' : 'inspections'}`,
    testId: 'map-pin',
  });
}

/** Appointment pin inside an expanded group — labeled with a 1-based position, not an id/code. */
export function makeAppointmentMarkerEl(index: number): HTMLButtonElement {
  return makeNumberedMarkerEl({
    label: String(index + 1),
    variant: 'stop',
    ariaLabel: `Inspection ${index + 1} details`,
    testId: 'map-appointment-pin',
  });
}

/**
 * The shared plottability rule, in the `{ lat, lng }` shape the APIs speak.
 * Delegating rather than restating it is what keeps pin visibility and camera
 * framing from drifting apart — a producer and a consumer disagreeing on which
 * coordinates count is the bug `isPlottablePoint` exists to prevent.
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
 * `id` is the group, appointment, or stop the pin belongs to: it orders the
 * pins in a coincident row, so a refetch handing back the same pins in a
 * different order cannot swap two of them around.
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
 * on makeNumberedMarkerEl.)
 *
 * Coincidence does not depend on the camera, so this runs once per pin render
 * rather than on every `moveend`.
 */
export function applyCollisionOffsets(placed: PlacedMarker[]): void {
  if (placed.length === 0) return;
  // Sorted by id so the row does not depend on the order the API happened to
  // return the points in — otherwise a refetch could swap two pins that share
  // a centroid and make them jump past each other for no reason.
  const ordered = [...placed].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const offsets = resolveCoincidentMarkerOffsets(
    ordered.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    PIN_DIAMETER_PX,
  );
  // offsets is 1:1 with ordered (resolveCoincidentMarkerOffsets maps each point).
  ordered.forEach((p, index) => p.marker.setOffset(offsets[index]!));
}
