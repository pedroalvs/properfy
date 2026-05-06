import { useEffect, useRef } from 'react';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import type mapboxgl from 'mapbox-gl';

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
  active: boolean;
  onSelectionChange: (selectedIds: string[]) => void;
  onDeactivate: () => void;
}

export function MapLassoSelect({
  map,
  points,
  active,
  onSelectionChange,
  onDeactivate: _onDeactivate,
}: MapLassoSelectProps) {
  const drawRef = useRef<MapboxDraw | null>(null);

  useEffect(() => {
    if (!map || !active) {
      if (drawRef.current && map) {
        try { map.removeControl(drawRef.current); } catch { /* mapbox may throw if control already removed */ }
        drawRef.current = null;
      }
      return;
    }

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
      defaultMode: 'draw_polygon',
    });

    drawRef.current = draw;
    map.addControl(draw);

    const handleCreate = () => {
      const features = draw.getAll();
      const firstFeature = features.features[0];
      if (!firstFeature) return;

      if (firstFeature.geometry.type !== 'Polygon') return;

      const coords = firstFeature.geometry.coordinates[0] as [number, number][];
      const selected = points.filter((p) =>
        pointInPolygon([p.longitude, p.latitude], coords),
      );
      onSelectionChange(selected.map((p) => p.id));
    };

    const handleUpdate = handleCreate;

    map.on('draw.create', handleCreate);
    map.on('draw.update', handleUpdate);

    return () => {
      map.off('draw.create', handleCreate);
      map.off('draw.update', handleUpdate);
      if (drawRef.current) {
        try { map.removeControl(drawRef.current); } catch { /* mapbox may throw if control already removed */ }
        drawRef.current = null;
      }
    };
  }, [map, active, points, onSelectionChange]);

  return null;
}
