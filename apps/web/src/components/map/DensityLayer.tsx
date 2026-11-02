import { useEffect, useRef } from 'react';
import type mapboxgl from 'mapbox-gl';

/** One ~100 m grid cell: its centre and the number of check-ins inside it. */
export interface DensityCell {
  lat: number;
  lng: number;
  count: number;
}

export interface DensityLayerProps {
  /** `null` while the map is not ready (missing token, mode switch). */
  map: mapboxgl.Map | null;
  /** Cell centres to render. Memoise upstream to keep a stable identity. */
  cells: DensityCell[];
  /** `false` removes the layer + source; `true` ensures them (empty is allowed). */
  visible: boolean;
}

export const DENSITY_SOURCE_ID = 'execution-density';
export const DENSITY_LAYER_ID = 'execution-density-layer';

/**
 * Heatmap colour ramp, single hue (`rgb(33,86,110)` = `hsl(199,54%,28%)`, the
 * same tone the `/analytics` dashboard uses) in **comma-form HSL**. Space-form
 * HSL in a Mapbox paint value breaks the whole map (PR #1302), so the ramp is
 * declared here literally rather than pulled from a Tailwind token.
 */
export const DENSITY_HEATMAP_RAMP: (string | number)[] = [
  0, 'hsla(199, 54%, 28%, 0)',
  0.2, 'hsla(199, 54%, 28%, 0.25)',
  0.4, 'hsla(199, 54%, 28%, 0.45)',
  0.6, 'hsla(199, 54%, 28%, 0.65)',
  0.8, 'hsla(199, 54%, 28%, 0.82)',
  1, 'hsla(199, 54%, 28%, 0.95)',
];

const DRAW_LAYER_PREFIX = 'gl-draw-';

type HeatmapWeight = mapboxgl.Expression;

function maxCountOf(cells: DensityCell[]): number {
  return Math.max(1, ...cells.map((c) => c.count));
}

function toGeoJson(cells: DensityCell[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: cells.map((cell) => ({
      type: 'Feature',
      properties: { count: cell.count },
      geometry: { type: 'Point', coordinates: [cell.lng, cell.lat] },
    })),
  };
}

function weightExpression(maxCount: number): HeatmapWeight {
  // Relative scale: 0 → 0, the busiest cell → 1, so colour is comparable only
  // within the current view (the control's legend says so).
  return ['interpolate', ['linear'], ['get', 'count'], 0, 0, maxCount, 1];
}

/** First (bottom-most) `gl-draw-*` layer id, or undefined when the lasso is idle. */
function firstDrawLayerId(map: mapboxgl.Map): string | undefined {
  const layers = map.getStyle()?.layers ?? [];
  return layers.find((l) => l.id.startsWith(DRAW_LAYER_PREFIX))?.id;
}

/**
 * Side-effecting map layer: a GeoJSON heatmap of check-in density. Renders no
 * DOM — the map already exists on the page. Keeps the layer below the lasso
 * (`gl-draw-*`) and survives style reloads. Does **not** move the camera.
 */
export function DensityLayer({ map, cells, visible }: DensityLayerProps) {
  // Latest props, read by the style.load / styledata handlers (registered once).
  const cellsRef = useRef(cells);
  const visibleRef = useRef(visible);
  cellsRef.current = cells;
  visibleRef.current = visible;

  // Apply source + layer (or remove) for the current props.
  const apply = (m: mapboxgl.Map, list: DensityCell[], show: boolean): void => {
    if (!show) {
      if (m.getLayer(DENSITY_LAYER_ID)) m.removeLayer(DENSITY_LAYER_ID);
      if (m.getSource(DENSITY_SOURCE_ID)) m.removeSource(DENSITY_SOURCE_ID);
      return;
    }
    const data = toGeoJson(list);
    const existing = m.getSource(DENSITY_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(data);
      m.setPaintProperty(DENSITY_LAYER_ID, 'heatmap-weight', weightExpression(maxCountOf(list)));
      return;
    }
    m.addSource(DENSITY_SOURCE_ID, { type: 'geojson', data });
    m.addLayer(
      {
        id: DENSITY_LAYER_ID,
        type: 'heatmap',
        source: DENSITY_SOURCE_ID,
        paint: {
          'heatmap-weight': weightExpression(maxCountOf(list)),
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            ...DENSITY_HEATMAP_RAMP,
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 10, 12, 24, 15, 40],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 1, 15, 3],
          'heatmap-opacity': 0.8,
        },
      },
      firstDrawLayerId(m),
    );
  };

  // Keep the density layer below every gl-draw-* layer. After a style reload the
  // draw control re-adds its layers on top of ours, so a beforeId computed once
  // is not enough — this runs on every styledata and is idempotent (it skips
  // when density already sits below the first draw layer, avoiding the
  // moveLayer → styledata loop).
  const ensureBelowDraw = (m: mapboxgl.Map): void => {
    if (!m.getLayer(DENSITY_LAYER_ID)) return;
    const layers = m.getStyle()?.layers ?? [];
    const firstDrawId = layers.find((l) => l.id.startsWith(DRAW_LAYER_PREFIX))?.id;
    if (!firstDrawId) return;
    const firstDrawIdx = layers.findIndex((l) => l.id === firstDrawId);
    const densityIdx = layers.findIndex((l) => l.id === DENSITY_LAYER_ID);
    if (densityIdx > firstDrawIdx) {
      m.moveLayer(DENSITY_LAYER_ID, firstDrawId);
    }
  };

  // Register style.load / styledata handlers once per map.
  useEffect(() => {
    if (!map) return undefined;
    const onStyleLoad = () => {
      try {
        apply(map, cellsRef.current, visibleRef.current);
      } catch {
        /* map may be gone */
      }
    };
    const onStyleData = () => {
      try {
        ensureBelowDraw(map);
      } catch {
        /* map may be gone */
      }
    };
    map.on('style.load', onStyleLoad);
    map.on('styledata', onStyleData);
    return () => {
      map.off('style.load', onStyleLoad);
      map.off('styledata', onStyleData);
      try {
        if (map.getLayer(DENSITY_LAYER_ID)) map.removeLayer(DENSITY_LAYER_ID);
        if (map.getSource(DENSITY_SOURCE_ID)) map.removeSource(DENSITY_SOURCE_ID);
      } catch {
        /* map already removed */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Apply when the data or visibility changes (once the style is ready).
  useEffect(() => {
    if (!map) return;
    try {
      if (map.isStyleLoaded()) apply(map, cells, visible);
    } catch {
      /* map may be gone */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, cells, visible]);

  return null;
}
