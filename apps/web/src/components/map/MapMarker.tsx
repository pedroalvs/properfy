import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import mapboxgl from 'mapbox-gl';
import { useMapInstance } from './MapContainer';

interface MapMarkerProps {
  longitude: number;
  latitude: number;
  color?: string;
  label?: string;
  onClick?: () => void;
  active?: boolean;
  clustered?: boolean;
  clusterCount?: number;
}

/**
 * Renders a marker at the given geographic coordinates on the enclosing
 * `MapContainer`. The component creates a detached DOM node that
 * `mapboxgl.Marker` owns, then renders the React UI INTO that node via
 * `createPortal`. This is a deliberate workaround for the React+Mapbox
 * reconciliation bug (https://github.com/mapbox/mapbox-gl-js/issues/12352
 * style — surfaced here as "The object can not be found here." crashes
 * on filter clicks): when Mapbox reparents a React-rendered element
 * inside its own canvas DOM, React loses track of where the node lives
 * and `removeChild` later throws on unmount.
 *
 * The portal pattern keeps React fully in charge of the marker's *content*
 * but leaves the *position in the DOM tree* to Mapbox. React's commit
 * phase only walks the portal target's children — never the canvas where
 * Mapbox parked the node — so the unmount path is safe.
 *
 * When rendered outside a `MapContainer` (unit tests, design-system
 * snapshots), `useMapInstance` resolves to a no-op map, so the effect
 * skips Mapbox entirely and the UI renders inline within the wrapper —
 * this preserves the public DOM contract (`data-testid="map-marker"` +
 * data attributes) so existing assertions still work.
 */
export function MapMarker({
  longitude,
  latitude,
  color = 'var(--color-primary)',
  label,
  onClick,
  active = false,
  clustered = false,
  clusterCount,
}: MapMarkerProps) {
  const { getMap } = useMapInstance();
  // Portal target is the detached DOM node owned by mapboxgl.Marker.
  // `null` when no map context (tests) or when the map has not finished
  // loading yet — in those cases we render the UI inline below.
  const [portalNode, setPortalNode] = useState<HTMLDivElement | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    const map = getMap();
    if (!map) {
      // No map available (typically a unit-test environment). Skip the
      // Mapbox handoff entirely — the JSX is rendered inline below.
      return;
    }

    // Create a fresh detached node FOR Mapbox to own. We never insert
    // it into the React tree directly — only the portal renders into
    // it. When `marker.remove()` runs in cleanup, Mapbox detaches the
    // node from the canvas; React's portal cleanup then takes care of
    // unmounting the React subtree it owned, and there is no
    // parent-to-child mismatch to crash on.
    const node = document.createElement('div');
    node.className = 'inline-block';

    const marker = new mapboxgl.Marker({ element: node, anchor: 'bottom' })
      .setLngLat([longitude, latitude])
      .addTo(map);
    markerRef.current = marker;
    setPortalNode(node);

    return () => {
      marker.remove();
      markerRef.current = null;
      setPortalNode(null);
    };
    // Intentionally only depend on `getMap` so the marker is created
    // exactly once per mount; coordinate updates flow through the
    // separate effect below via `marker.setLngLat`.
  }, [getMap]);

  // Update marker position when coordinates change without re-creating it.
  useEffect(() => {
    markerRef.current?.setLngLat([longitude, latitude]);
  }, [longitude, latitude]);

  const size = clustered ? 'h-10 w-10 text-sm' : 'h-7 w-7 text-xs';
  const ringClass = active ? 'ring-2 ring-secondary ring-offset-2' : '';

  // Inner UI rendered both inline (no map / tests) and via portal (with map).
  // Identical markup either way so `data-testid`/role assertions hold.
  const inner = (
    <>
      <button
        type="button"
        className={`flex items-center justify-center rounded-full shadow-md transition-transform hover:scale-110 ${size} ${ringClass}`}
        style={{ backgroundColor: color }}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        aria-label={label ?? `Map marker at ${latitude}, ${longitude}`}
      >
        {clustered && clusterCount ? (
          <span className="font-bold text-white">{clusterCount}</span>
        ) : (
          <i className="mdi mdi-map-marker text-white text-base" aria-hidden="true" />
        )}
      </button>
      {label && !clustered && (
        <div className="mt-1 whitespace-nowrap text-center text-xs font-medium text-text-primary">
          {label}
        </div>
      )}
    </>
  );

  if (portalNode) {
    // Production / map-attached path. The wrapper carries the public
    // data attributes for any downstream test or DOM query while React
    // commits the actual UI into the Mapbox-owned node.
    return (
      <>
        <div
          className="hidden"
          data-testid="map-marker"
          data-longitude={longitude}
          data-latitude={latitude}
          data-color={color}
        />
        {createPortal(inner, portalNode)}
      </>
    );
  }

  // No-map fallback (unit tests / pre-load). React owns the entire tree
  // — no Mapbox interference, no detached-node hazard.
  return (
    <div
      className="inline-block"
      data-testid="map-marker"
      data-longitude={longitude}
      data-latitude={latitude}
      data-color={color}
    >
      {inner}
    </div>
  );
}
