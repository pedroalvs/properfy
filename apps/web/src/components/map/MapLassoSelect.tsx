import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import type mapboxgl from 'mapbox-gl';

/**
 * 025 §FR-401 — Lasso state machine.
 * - `idle`     polygon removed; draw control absent; map fully interactive.
 * - `drawing`  draw control mounted in `draw_polygon` mode; pan disabled
 *              so the user can sketch without accidentally panning.
 * - `review`   polygon persists; map fully interactive again so the user
 *              can zoom around while the bulk-action modal is open.
 * - `applying` polygon still visible (locked); identical to `review` but
 *              page-level UI is in "applying" state. The lasso layer doesn't
 *              need to distinguish, but the prop is forwarded so the page
 *              can drive button states centrally.
 */
export type LassoState = 'idle' | 'drawing' | 'review' | 'applying';

function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const [xi, yi] = pi;
    const [xj, yj] = pj;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export interface LassoPoint {
  id: string;
  longitude: number;
  latitude: number;
}

/**
 * 025 cycle 2/2 — imperative API exposed to the page so it can drive the
 * close gesture from a UI affordance (banner Finish / Cancel buttons,
 * keyboard shortcuts). Without these, the operator could only close the
 * polygon via mapbox-gl-draw's default gestures (click-first-vertex on
 * a ~5px target, double-click, or Enter), which the user smoke flagged
 * as undiscoverable.
 */
export interface MapLassoSelectHandle {
  /** Finish the polygon if it has 3+ vertices; otherwise no-op. */
  finishDrawing(): void;
  /** Discard any in-progress polygon and return to idle. */
  cancelDrawing(): void;
}

interface MapLassoSelectProps {
  map: mapboxgl.Map | null;
  points: LassoPoint[];
  lassoState: LassoState;
  onSelectionChange: (selectedIds: string[]) => void;
  /** Fires when the polygon is cleared for any reason (escape, trash button,
   *  external state reset). Lets the page-level lassoState transition back to 'idle'. */
  onPolygonCleared?: () => void;
}

/**
 * 025 — peach/orange polygon styling. Mockup uses a soft peach fill so the
 * markers underneath stay readable, plus a solid orange outline so the
 * lasso boundary is obvious during review.
 */
const LASSO_STYLES = [
  {
    id: 'gl-draw-polygon-fill-properfy',
    type: 'fill',
    filter: ['all', ['==', '$type', 'Polygon']],
    paint: {
      'fill-color': '#FFB266',
      'fill-opacity': 0.18,
    },
  },
  {
    id: 'gl-draw-polygon-stroke-properfy',
    type: 'line',
    filter: ['all', ['==', '$type', 'Polygon']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#FF8A33',
      'line-width': 2,
    },
  },
  {
    id: 'gl-draw-polygon-and-line-vertex-properfy',
    type: 'circle',
    filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
    paint: {
      'circle-radius': 5,
      'circle-color': '#FFFFFF',
      'circle-stroke-color': '#FF8A33',
      'circle-stroke-width': 2,
    },
  },
];

export const MapLassoSelect = forwardRef<MapLassoSelectHandle, MapLassoSelectProps>(function MapLassoSelect({
  map,
  points,
  lassoState,
  onSelectionChange,
  onPolygonCleared,
}, ref) {
  const drawRef = useRef<MapboxDraw | null>(null);
  // Latest `points` accessible inside long-lived event handlers without
  // re-mounting the draw control on every parent re-render.
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onPolygonClearedRef = useRef(onPolygonCleared);
  onPolygonClearedRef.current = onPolygonCleared;

  /**
   * Manually completes the polygon and emits the selection. Used by the
   * imperative API (Finish button, Enter key, double-click handler) so
   * the operator has affordances beyond mapbox-gl-draw's default
   * click-first-vertex gesture.
   *
   * Why we duplicate the `draw.create` payload here: when we call
   * `draw.changeMode('simple_select')` programmatically, mapbox-gl-draw
   * commits the in-progress polygon but doesn't always fire
   * `draw.create` (it depends on whether the mode transition was via a
   * gesture or an API call). Pulling the payload + running the
   * `onSelectionChange` callback ourselves makes the flow deterministic.
   */
  const completePolygonNow = (): boolean => {
    const draw = drawRef.current;
    if (!draw) return false;
    const all = draw.getAll();
    const firstFeature = all.features[0];
    if (!firstFeature || firstFeature.geometry.type !== 'Polygon') return false;
    const ring = firstFeature.geometry.coordinates[0] as [number, number][];
    // Polygon must have at least 3 distinct vertices (plus the closing
    // duplicate that mapbox-gl-draw appends to the ring).
    if (ring.length < 4) return false;
    try { draw.changeMode('simple_select'); } catch { /* noop */ }
    const selected = pointsRef.current.filter((p) => pointInPolygon([p.longitude, p.latitude], ring));
    onSelectionChangeRef.current(selected.map((p) => p.id));
    return true;
  };

  const cancelPolygonNow = () => {
    const draw = drawRef.current;
    if (draw) {
      try { draw.deleteAll(); } catch { /* noop */ }
      try { draw.changeMode('simple_select'); } catch { /* noop */ }
    }
    onPolygonClearedRef.current?.();
  };

  useImperativeHandle(ref, () => ({
    finishDrawing: () => { completePolygonNow(); },
    cancelDrawing: () => { cancelPolygonNow(); },
  }), []);

  // Mount / unmount the draw control on lassoState transitions. The control
  // is added when entering 'drawing' and removed only when returning to
  // 'idle' — so the polygon survives the 'drawing' → 'review' transition.
  useEffect(() => {
    if (!map) return;

    if (lassoState === 'idle') {
      if (drawRef.current) {
        try {
          drawRef.current.deleteAll();
          map.removeControl(drawRef.current);
        } catch { /* mapbox may throw if the control was already removed */ }
        drawRef.current = null;
        try { map.dragPan.enable(); } catch { /* noop */ }
      }
      return;
    }

    if (!drawRef.current) {
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: { polygon: true, trash: true },
        defaultMode: 'draw_polygon',
        styles: LASSO_STYLES,
      });
      drawRef.current = draw;
      map.addControl(draw);

      const handleCreate = () => {
        const features = draw.getAll();
        const firstFeature = features.features[0];
        if (!firstFeature || firstFeature.geometry.type !== 'Polygon') return;
        // Switch to simple_select so the polygon persists across the
        // 'drawing' → 'review' transition (otherwise the next click would
        // restart drawing per draw_polygon's default behaviour).
        try { draw.changeMode('simple_select'); } catch { /* noop */ }
        const coords = firstFeature.geometry.coordinates[0] as [number, number][];
        const selected = pointsRef.current.filter((p) =>
          pointInPolygon([p.longitude, p.latitude], coords),
        );
        onSelectionChangeRef.current(selected.map((p) => p.id));
      };

      const handleDelete = () => {
        // Trash button (or programmatic deleteAll). Tell the page so it
        // can drop back to 'idle'.
        onPolygonClearedRef.current?.();
      };

      // 025 cycle 2/2 — explicit close gestures. mapbox-gl-draw's default
      // close gesture (click the ~5px first vertex) is undiscoverable;
      // double-click anywhere should reliably finish the polygon. The
      // library already fires `draw.create` on dblclick natively, but
      // some keyboard layouts and trackpads suppress it — listening on
      // the raw `dblclick` event is a belt-and-braces fallback that
      // forces the completion even if mapbox-gl-draw's internal handler
      // didn't pick it up.
      const handleDblClick = () => {
        if (draw.getMode() === 'draw_polygon') {
          completePolygonNow();
        }
      };

      map.on('draw.create', handleCreate);
      map.on('draw.update', handleCreate);
      map.on('draw.delete', handleDelete);
      map.on('dblclick', handleDblClick);

      // Cleanup runs only when the effect re-fires; we DON'T tear down on
      // every state transition because the polygon must persist through
      // drawing → review → applying.
      return () => {
        map.off('draw.create', handleCreate);
        map.off('draw.update', handleCreate);
        map.off('draw.delete', handleDelete);
        map.off('dblclick', handleDblClick);
      };
    }
    return;
  }, [map, lassoState]);

  // Pan toggle — disable only while actively drawing so the user can sketch
  // a polygon without inadvertently moving the camera. Re-enable on every
  // other state.
  useEffect(() => {
    if (!map) return;
    if (lassoState === 'drawing') {
      try { map.dragPan.disable(); } catch { /* noop */ }
    } else {
      try { map.dragPan.enable(); } catch { /* noop */ }
    }
  }, [map, lassoState]);

  // Keyboard gestures during drawing: Enter finishes the polygon,
  // ESC cancels it. Both are conventional map-drawing affordances; pre-fix
  // the user had no keyboard escape from draw mode.
  useEffect(() => {
    if (lassoState !== 'drawing') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        completePolygonNow();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelPolygonNow();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lassoState]);

  return null;
});
