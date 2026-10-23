import { type MutableRefObject, useEffect } from 'react';
import type { GeoJSONSource, Map as MapboxMap } from 'mapbox-gl';
import type { ExpandedGroup } from '../lib/offers-map/types';
import { isValidCoordinate } from '../lib/offers-map/markers';

const ROUTE_SOURCE_ID = 'offer-route';
const ROUTE_LAYER_ID = 'offer-route-line';
const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * shadcn stores `--primary` as a space-separated HSL triplet ("221 83% 53%").
 * Mapbox's paint color parser rejects the CSS Color 4 space syntax
 * (`hsl(221 83% 53%)` → "color expected") and needs the legacy comma form
 * (`hsl(221, 83%, 53%)`), so convert the triplet rather than wrapping it as-is.
 * Falls back to the brand hex when the token is absent (SSR / jsdom).
 */
export function hslTripletToMapboxColor(raw: string): string {
  const triplet = raw.trim();
  if (!triplet) return '#2563EB';
  return `hsl(${triplet.replace(/\s+/g, ', ')})`;
}

/** The route line is a Mapbox paint property and needs a concrete colour. */
function resolvePrimaryColor(): string {
  if (typeof document === 'undefined') return '#2563EB';
  return hslTripletToMapboxColor(getComputedStyle(document.documentElement).getPropertyValue('--primary'));
}

interface UseOfferRouteArgs {
  mapRef: MutableRefObject<MapboxMap | null>;
  mapLoadedRef: MutableRefObject<boolean>;
  mapReady: boolean;
  expandedGroup: ExpandedGroup | null;
}

/**
 * Draws (or clears) a polyline threading the expanded group's appointment pins
 * in order, so the inspector reads the route at a glance. The line is a canvas
 * layer beneath the DOM markers, so it never covers a pin. A line needs two
 * plottable points; with fewer, the source is emptied and nothing is drawn.
 */
export function useOfferRoute({ mapRef, mapLoadedRef, mapReady, expandedGroup }: UseOfferRouteArgs): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    // Add the source + layer once (idempotent across refetches); after a
    // teardown/retry the map is new, so re-add on the next ready render.
    if (!map.getSource(ROUTE_SOURCE_ID)) {
      map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: EMPTY_FEATURE_COLLECTION });
      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': resolvePrimaryColor(),
          'line-width': 3,
          'line-opacity': 0.85,
          'line-dasharray': [0.5, 2],
        },
      });
    }

    const coordinates = expandedGroup
      ? expandedGroup.appointments
          .filter((a) => isValidCoordinate(a.coordinates))
          .map((a) => [a.coordinates!.lng, a.coordinates!.lat] as [number, number])
      : [];

    const source = map.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(
      coordinates.length < 2
        ? EMPTY_FEATURE_COLLECTION
        : ({ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: {} } as GeoJSON.Feature),
    );
  }, [mapRef, mapLoadedRef, mapReady, expandedGroup]);
}
