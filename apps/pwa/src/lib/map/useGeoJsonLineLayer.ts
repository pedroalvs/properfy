import { type MutableRefObject, useEffect } from 'react';
import type { GeoJSONSource, Map as MapboxMap } from 'mapbox-gl';
import { resolvePrimaryColor } from './colors';

const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

interface UseGeoJsonLineLayerArgs {
  mapRef: MutableRefObject<MapboxMap | null>;
  mapLoadedRef: MutableRefObject<boolean>;
  mapReady: boolean;
  /** Base id for the source; the two layers are `${sourceId}-solid` / `-dashed`. */
  sourceId: string;
  /** The lines to draw; `null` clears them. Features flagged `approximate` render dashed. */
  data: GeoJSON.FeatureCollection | null;
}

/**
 * Draw a GeoJSON line layer on the map: real legs solid, `approximate` legs
 * dashed. Two statically-filtered layers (rather than one data-driven dash,
 * which mapbox-gl does not support for `line-dasharray`) are added once per
 * map; after a teardown/retry the map is new, so the effect re-adds them on the
 * next ready render. The line sits on the canvas beneath the DOM markers.
 *
 * The colour comes from the `--primary` token via `resolvePrimaryColor`, which
 * emits the comma-form `hsl(...)` Mapbox's paint parser accepts — a
 * space-separated triplet in a paint property errors and blanks the whole map.
 */
export function useGeoJsonLineLayer({ mapRef, mapLoadedRef, mapReady, sourceId, data }: UseGeoJsonLineLayerArgs): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    const solidLayerId = `${sourceId}-solid`;
    const dashedLayerId = `${sourceId}-dashed`;

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: 'geojson', data: EMPTY_FEATURE_COLLECTION });
      const color = resolvePrimaryColor();
      const layout = { 'line-cap': 'round', 'line-join': 'round' } as const;
      map.addLayer({
        id: solidLayerId,
        type: 'line',
        source: sourceId,
        layout,
        paint: { 'line-color': color, 'line-width': 4, 'line-opacity': 0.9 },
        filter: ['!=', ['get', 'approximate'], true],
      });
      map.addLayer({
        id: dashedLayerId,
        type: 'line',
        source: sourceId,
        layout,
        paint: { 'line-color': color, 'line-width': 4, 'line-opacity': 0.9, 'line-dasharray': [0.5, 2] },
        filter: ['==', ['get', 'approximate'], true],
      });
    }

    const source = map.getSource(sourceId) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(data ?? EMPTY_FEATURE_COLLECTION);
  }, [mapRef, mapLoadedRef, mapReady, sourceId, data]);
}
