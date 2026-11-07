import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import type { DayPlanGeometry } from '@properfy/shared';

/** Visual weight of a route relative to the others on screen. */
export type RouteEmphasis = 'normal' | 'selected' | 'muted';

export interface RouteLayerProps {
  /** `null` while the map is not ready (missing token, not loaded). */
  map: mapboxgl.Map | null;
  /** Unique per inspector, e.g. `live-route-<inspectorId>`. Drives all layer ids. */
  id: string;
  /** FeatureCollection (dayPlanGeometrySchema). `null` → an empty line. */
  geometry: DayPlanGeometry | null;
  /** Comma-form HSL only (`inspectorRouteColor(id).mapbox`). Space-form breaks Mapbox (#1302). */
  color: string;
  /** Line width/opacity preset. Defaults to `normal`. */
  emphasis?: RouteEmphasis;
  /** Optional small dots at the stop coordinates (used by "Show all routes"). */
  stops?: { variant: 'dots'; points: Array<[number, number]> };
  /** Called when the drawn line is clicked. */
  onClick?: () => void;
  /** Inspector name — shown in a light hover popup, the colour-blind-safe way to tell routes apart (L-F05-12). */
  label?: string;
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Mapbox paint only accepts comma-form HSL; a space-form string breaks the whole style (#1302). */
const COMMA_HSL = /^hsl\(\d+, \d+%, \d+%\)$/;

function lineWidth(emphasis: RouteEmphasis): number {
  return emphasis === 'selected' ? 5 : 3;
}

function lineOpacity(emphasis: RouteEmphasis): number {
  return emphasis === 'muted' ? 0.35 : 0.9;
}

/** First (bottom-most) `type: 'symbol'` layer, so the route sits under street labels. */
function firstSymbolLayerId(map: mapboxgl.Map): string | undefined {
  const layers = map.getStyle()?.layers ?? [];
  return layers.find((l) => l.type === 'symbol')?.id;
}

function pointsToFc(points: Array<[number, number]>): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: p },
    })),
  };
}

/**
 * Side-effecting Mapbox line layer for one inspector's planned route — the web's
 * first line layer. Renders no DOM. Draws two line layers off one source, split
 * by each feature's `approximate` flag: `-solid` for the real road geometry and
 * `-dashed` for straight-line fallbacks (F04 currently serves only the latter,
 * so every feature is approximate today). Idempotent: `setData` on update,
 * `setPaintProperty` on emphasis change, re-add on `style.load`, full cleanup on
 * unmount. Never calls the Mapbox Directions API — the geometry comes pre-built.
 */
export function RouteLayer({ map, id, geometry, color, emphasis = 'normal', stops, onClick, label }: RouteLayerProps) {
  const SOLID = `${id}-solid`;
  const DASHED = `${id}-dashed`;
  const STOPS = `${id}-stops`;

  // Latest props read by the once-registered event handlers + style.load re-apply.
  const geometryRef = useRef(geometry);
  const colorRef = useRef(color);
  const emphasisRef = useRef(emphasis);
  const stopsRef = useRef(stops);
  const onClickRef = useRef(onClick);
  const labelRef = useRef(label);
  geometryRef.current = geometry;
  colorRef.current = color;
  emphasisRef.current = emphasis;
  stopsRef.current = stops;
  onClickRef.current = onClick;
  labelRef.current = label;

  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const apply = (m: mapboxgl.Map): void => {
    const col = colorRef.current;
    if (!COMMA_HSL.test(col)) {
      // Guard against the #1302 bug: a space-form HSL would break the entire map.
      // eslint-disable-next-line no-console
      console.error(`RouteLayer: line colour must be comma-form HSL, got "${col}"`);
      return;
    }
    const data = geometryRef.current ?? EMPTY_FC;
    const width = lineWidth(emphasisRef.current);
    const opacity = lineOpacity(emphasisRef.current);

    const existing = m.getSource(id) as mapboxgl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(data as GeoJSON.FeatureCollection);
      m.setPaintProperty(SOLID, 'line-width', width);
      m.setPaintProperty(SOLID, 'line-opacity', opacity);
      m.setPaintProperty(DASHED, 'line-width', width);
      m.setPaintProperty(DASHED, 'line-opacity', opacity);
    } else {
      const before = firstSymbolLayerId(m);
      m.addSource(id, { type: 'geojson', data: data as GeoJSON.FeatureCollection });
      m.addLayer(
        {
          id: SOLID,
          type: 'line',
          source: id,
          filter: ['!=', ['get', 'approximate'], true],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': col, 'line-width': width, 'line-opacity': opacity },
        },
        before,
      );
      m.addLayer(
        {
          id: DASHED,
          type: 'line',
          source: id,
          filter: ['==', ['get', 'approximate'], true],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': col,
            'line-width': width,
            'line-opacity': opacity,
            'line-dasharray': [1.5, 1.5],
          },
        },
        before,
      );
    }

    // Optional stop dots (used by "Show all routes").
    const stopsNow = stopsRef.current;
    if (stopsNow && stopsNow.variant === 'dots') {
      const stopData = pointsToFc(stopsNow.points);
      const existingStops = m.getSource(STOPS) as mapboxgl.GeoJSONSource | undefined;
      if (existingStops) {
        existingStops.setData(stopData);
      } else {
        // Source first — addLayer against an unknown source throws.
        m.addSource(STOPS, { type: 'geojson', data: stopData });
        m.addLayer({
          id: STOPS,
          type: 'circle',
          source: STOPS,
          paint: {
            'circle-radius': 4,
            'circle-color': col,
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-width': 1.5,
          },
        });
      }
    } else if (m.getLayer(STOPS)) {
      m.removeLayer(STOPS);
      if (m.getSource(STOPS)) m.removeSource(STOPS);
    }
  };

  const removeAll = (m: mapboxgl.Map): void => {
    for (const layerId of [SOLID, DASHED, STOPS]) {
      if (m.getLayer(layerId)) m.removeLayer(layerId);
    }
    for (const srcId of [id, STOPS]) {
      if (m.getSource(srcId)) m.removeSource(srcId);
    }
  };

  // Register handlers + style.load re-apply once per (map, id). Cleanup removes them + the layers.
  useEffect(() => {
    if (!map) return undefined;

    const onStyleLoad = () => {
      try {
        apply(map);
      } catch {
        /* map may be gone */
      }
    };
    const handleClick = () => onClickRef.current?.();
    const handleEnter = (e: mapboxgl.MapLayerMouseEvent) => {
      try {
        map.getCanvas().style.cursor = 'pointer';
      } catch {
        /* no canvas in test map */
      }
      const name = labelRef.current;
      if (name && !popupRef.current) {
        popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false })
          .setLngLat(e.lngLat)
          .setText(name)
          .addTo(map);
      }
    };
    const handleLeave = () => {
      try {
        map.getCanvas().style.cursor = '';
      } catch {
        /* no canvas in test map */
      }
      popupRef.current?.remove();
      popupRef.current = null;
    };

    map.on('style.load', onStyleLoad);
    for (const layerId of [SOLID, DASHED]) {
      map.on('click', layerId, handleClick);
      map.on('mouseenter', layerId, handleEnter);
      map.on('mouseleave', layerId, handleLeave);
    }

    return () => {
      map.off('style.load', onStyleLoad);
      for (const layerId of [SOLID, DASHED]) {
        map.off('click', layerId, handleClick);
        map.off('mouseenter', layerId, handleEnter);
        map.off('mouseleave', layerId, handleLeave);
      }
      popupRef.current?.remove();
      popupRef.current = null;
      try {
        removeAll(map);
      } catch {
        /* map already removed */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, id]);

  // Apply when the data/color/emphasis/stops change (once the style is ready).
  useEffect(() => {
    if (!map) return;
    try {
      if (map.isStyleLoaded()) apply(map);
    } catch {
      /* map may be gone */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, id, geometry, color, emphasis, stops]);

  return null;
}
