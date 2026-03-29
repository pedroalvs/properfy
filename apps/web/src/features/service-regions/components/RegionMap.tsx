import { useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { env } from '@/config/env';

interface ExistingRegion {
  id: string;
  geojson: object;
  color: string;
  name: string;
}

interface RegionMapProps {
  /** Existing polygon to display/edit (edit mode) */
  geojson?: object;
  /** Called when admin draws or edits a polygon */
  onDraw?: (geojson: object) => void;
  /** Existing regions to show as background layers */
  existingRegions?: ExistingRegion[];
  /** If true, enables draw tools. If false, display only */
  editable?: boolean;
  /** Map height */
  height?: string;
}

const DEFAULT_CENTER: [number, number] = [151.21, -33.87]; // Sydney
const DEFAULT_ZOOM = 11;

export function RegionMap({
  geojson,
  onDraw,
  existingRegions = [],
  editable = false,
  height = '400px',
}: RegionMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const onDrawRef = useRef(onDraw);
  onDrawRef.current = onDraw;

  const deriveCenter = useCallback((): [number, number] => {
    // Try to center from existing regions
    const allRegions = [...existingRegions];
    if (geojson) {
      allRegions.push({ id: '_current', geojson, color: '', name: '' });
    }

    if (allRegions.length === 0) return DEFAULT_CENTER;

    let sumLng = 0;
    let sumLat = 0;
    let count = 0;
    for (const region of allRegions) {
      const geo = region.geojson as { type?: string; coordinates?: number[][][] };
      if (geo?.type === 'Polygon' && geo.coordinates?.[0]) {
        for (const coord of geo.coordinates[0]!) {
          sumLng += coord[0]!;
          sumLat += coord[1]!;
          count++;
        }
      }
    }

    if (count === 0) return DEFAULT_CENTER;
    return [sumLng / count, sumLat / count];
  }, [existingRegions, geojson]);

  useEffect(() => {
    if (!containerRef.current) return;

    mapboxgl.accessToken = env.mapboxToken;

    const center = deriveCenter();
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center,
      zoom: DEFAULT_ZOOM,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    let draw: MapboxDraw | null = null;

    map.on('load', () => {
      // Add existing regions as background layers
      for (const region of existingRegions) {
        const geo = region.geojson as { type?: string; coordinates?: number[][][] };
        if (geo?.type !== 'Polygon' || !geo.coordinates) continue;

        const sourceId = `region-${region.id}`;
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: { name: region.name },
            geometry: geo as GeoJSON.Polygon,
          },
        });

        map.addLayer({
          id: `${sourceId}-fill`,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': region.color,
            'fill-opacity': 0.3,
          },
        });

        map.addLayer({
          id: `${sourceId}-outline`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': region.color,
            'line-width': 2,
          },
        });

        // Show region name on hover
        map.addLayer({
          id: `${sourceId}-label`,
          type: 'symbol',
          source: sourceId,
          layout: {
            'text-field': region.name,
            'text-size': 12,
            'text-anchor': 'center',
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#000000',
            'text-halo-width': 1,
          },
        });
      }

      // If editable, add draw control
      if (editable) {
        draw = new MapboxDraw({
          displayControlsDefault: false,
          controls: {
            polygon: true,
            trash: true,
          },
        });
        drawRef.current = draw;
        map.addControl(draw as unknown as mapboxgl.IControl);

        // Pre-load existing polygon in edit mode
        if (geojson) {
          const geo = geojson as { type?: string; coordinates?: number[][][] };
          if (geo?.type === 'Polygon' && geo.coordinates) {
            draw.add({
              type: 'Feature',
              properties: {},
              geometry: geo as GeoJSON.Polygon,
            });
          }
        }

        const handleDrawChange = () => {
          const data = draw?.getAll();
          if (data && data.features.length > 0) {
            const lastFeature = data.features[data.features.length - 1]!;
            if (lastFeature.geometry && lastFeature.geometry.type === 'Polygon') {
              onDrawRef.current?.(lastFeature.geometry);
            }
          } else {
            // All features deleted, reset
            onDrawRef.current?.({ type: 'Polygon', coordinates: [] });
          }
        };

        map.on('draw.create', handleDrawChange);
        map.on('draw.update', handleDrawChange);
        map.on('draw.delete', handleDrawChange);
      }

      // Fit bounds to all visible polygons
      const bounds = new mapboxgl.LngLatBounds();
      let hasBounds = false;

      const allGeojsons = existingRegions.map((r) => r.geojson);
      if (geojson) allGeojsons.push(geojson);

      for (const gj of allGeojsons) {
        const geo = gj as { type?: string; coordinates?: number[][][] };
        if (geo?.type === 'Polygon' && geo.coordinates?.[0]) {
          for (const coord of geo.coordinates[0]!) {
            bounds.extend([coord[0] as number, coord[1] as number]);
            hasBounds = true;
          }
        }
      }

      if (hasBounds) {
        map.fitBounds(bounds, { padding: 50, maxZoom: 14 });
      }
    });

    return () => {
      drawRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line -- map initialization must run once

  return (
    <div
      ref={containerRef}
      style={{ height, width: '100%' }}
      className="rounded border border-black/10"
    />
  );
}
