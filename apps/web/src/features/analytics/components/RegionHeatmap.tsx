import { useCallback, useEffect, useMemo, useRef } from 'react';
import type mapboxgl from 'mapbox-gl';
import type { AnalyticsHeatmapResponse } from '@properfy/shared';
import { MapContainer } from '@/components/map/MapContainer';
import { computeBounds, isSinglePointBounds } from '@/lib/map-bounds';
import { HEATMAP_RAMP, SEQUENTIAL_HUE } from './charts/theme';

interface RegionHeatmapProps {
  heatmap: AnalyticsHeatmapResponse | null;
  isLoading: boolean;
}

const SOURCE_ID = 'analytics-heatmap';
const LAYER_ID = 'analytics-heatmap-layer';

function toGeoJson(points: AnalyticsHeatmapResponse['points']): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      properties: { suburb: point.suburb, count: point.count },
      geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
    })),
  };
}

/**
 * Suburb density as a Mapbox GL heatmap layer.
 *
 * The appointment map plots DOM `mapboxgl.Marker` pins; that is the wrong tool
 * here — a marker per suburb would encode presence, not concentration. This
 * follows `service-regions/RegionMap.tsx` instead: add a GeoJSON source inside
 * `map.on('load')`, then a layer over it.
 *
 * `heatmap-weight` is interpolated on each point's `count` so a busy suburb
 * outweighs a quiet one, and the colour ramp is a single hue — a rainbow would
 * imply categories where there is only magnitude.
 */
export function RegionHeatmap({ heatmap, isLoading }: RegionHeatmapProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  // Memoised because it feeds the deps of `handleMapReady` and the sync effect
  // below: while `heatmap` is undefined, `?? []` would mint a fresh array
  // identity every render (apps/web/CLAUDE.md §13.11).
  const points = useMemo(() => heatmap?.points ?? [], [heatmap]);

  const render = useCallback((map: mapboxgl.Map, data: AnalyticsHeatmapResponse['points']) => {
    const geojson = toGeoJson(data);
    const existing = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;

    if (existing) {
      existing.setData(geojson);
    } else {
      map.addSource(SOURCE_ID, { type: 'geojson', data: geojson });
      map.addLayer({
        id: LAYER_ID,
        type: 'heatmap',
        source: SOURCE_ID,
        paint: {
          // Weight by count, capped at the busiest suburb so one outlier does
          // not flatten every other suburb to invisible.
          'heatmap-weight': [
            'interpolate',
            ['linear'],
            ['get', 'count'],
            0,
            0,
            Math.max(...data.map((p) => p.count), 1),
            1,
          ],
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], ...HEATMAP_RAMP],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 16, 12, 48],
          'heatmap-opacity': 0.85,
        },
      });
    }

    const bounds = computeBounds(
      data.map((point) => ({ latitude: point.lat, longitude: point.lng })),
    );
    if (!bounds) return;
    // A single suburb yields degenerate bounds (sw === ne), which `fitBounds`
    // treats as a hint rather than a box — `map-bounds.ts` says to fly there
    // instead, and `AppointmentMapPage` already branches this way.
    if (isSinglePointBounds(bounds)) {
      const [[lng, lat]] = bounds as [[number, number], [number, number]];
      map.flyTo({ center: [lng, lat], zoom: 11, duration: 0 });
    } else {
      map.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 0 });
    }
  }, []);

  const handleMapReady = useCallback(
    (map: mapboxgl.Map) => {
      mapRef.current = map;
      if (points.length > 0) render(map, points);
    },
    [render, points],
  );

  // Re-render the layer when the period changes under an already-loaded map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;
    render(map, points);
  }, [points, render]);

  const maxCount = Math.max(...points.map((p) => p.count), 0);

  return (
    <div className="rounded bg-card-bg p-4 shadow-sm" data-testid="region-heatmap">
      <div className="mb-3">
        <h2 className="text-base font-bold text-secondary">Where the work is</h2>
        <p className="mt-0.5 text-xs text-text-muted">
          Service concentration by suburb
          {heatmap && heatmap.totalWithoutCoordinates > 0 && (
            <>
              {' · '}
              <span className="text-warning">
                {heatmap.totalWithoutCoordinates} not mapped (property not geocoded)
              </span>
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="h-[380px] overflow-hidden rounded lg:col-span-3">
          {isLoading ? (
            <div className="flex h-full items-center justify-center bg-app-bg text-sm text-text-secondary">
              <i className="mdi mdi-loading mdi-spin mr-2 text-xl" aria-hidden="true" />
              Loading map…
            </div>
          ) : points.length === 0 ? (
            <div className="flex h-full items-center justify-center bg-app-bg text-sm text-text-muted">
              No geocoded services in this period.
            </div>
          ) : (
            <MapContainer onMapReady={handleMapReady} className="rounded" />
          )}
        </div>

        {/* The ranking makes the same data readable without colour — and gives
            the exact numbers the density blur cannot. */}
        <div className="lg:col-span-1">
          <h3 className="text-xs font-bold uppercase tracking-wide text-text-muted">Busiest suburbs</h3>
          {points.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">—</p>
          ) : (
            <ol className="mt-2 space-y-1.5">
              {points.slice(0, 8).map((point) => (
                <li key={point.suburb} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-text-primary">{point.suburb}</span>
                  <span className="shrink-0 tabular-nums text-text-secondary">{point.count}</span>
                </li>
              ))}
            </ol>
          )}
          {maxCount > 0 && (
            <div className="mt-4">
              <div
                className="h-2 w-full rounded-full"
                style={{ background: `linear-gradient(to right, ${SEQUENTIAL_HUE}1F, ${SEQUENTIAL_HUE})` }}
                aria-hidden="true"
              />
              <div className="mt-1 flex justify-between text-xs text-text-muted">
                <span>Fewer</span>
                <span>More</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
