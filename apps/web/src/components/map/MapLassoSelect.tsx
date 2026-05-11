import { useEffect, useRef } from 'react';
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

export function MapLassoSelect({
  map,
  points,
  lassoState,
  onSelectionChange,
  onPolygonCleared,
}: MapLassoSelectProps) {
  const drawRef = useRef<MapboxDraw | null>(null);
  // Latest `points` accessible inside long-lived event handlers without
  // re-mounting the draw control on every parent re-render.
  const pointsRef = useRef(points);
  pointsRef.current = points;

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
        draw.changeMode('simple_select');
        const coords = firstFeature.geometry.coordinates[0] as [number, number][];
        const selected = pointsRef.current.filter((p) =>
          pointInPolygon([p.longitude, p.latitude], coords),
        );
        onSelectionChange(selected.map((p) => p.id));
      };

      const handleDelete = () => {
        // Trash button (or programmatic deleteAll). Tell the page so it
        // can drop back to 'idle'.
        onPolygonCleared?.();
      };

      map.on('draw.create', handleCreate);
      map.on('draw.update', handleCreate);
      map.on('draw.delete', handleDelete);

      // Cleanup runs only when the effect re-fires; we DON'T tear down on
      // every state transition because the polygon must persist through
      // drawing → review → applying.
      return () => {
        map.off('draw.create', handleCreate);
        map.off('draw.update', handleCreate);
        map.off('draw.delete', handleDelete);
      };
    }
    return;
  }, [map, lassoState, onSelectionChange, onPolygonCleared]);

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

  return null;
}
