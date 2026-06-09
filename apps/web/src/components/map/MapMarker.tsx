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
  /**
   * When set, renders a black teardrop pin with this MDI icon class
   * (e.g. `mdi-check-bold`) overlaid on the pin head, instead of the
   * default colored circle. Used by the appointments status map, where the
   * inner icon — not the color — encodes the appointment status.
   */
  icon?: string;
  /**
   * Disables pointer interaction with the marker. Used by the appointments
   * map flow while a lasso polygon is being drawn — without this, clicking
   * near a marker to close the polygon lands on the marker's button and is
   * swallowed by `stopPropagation`, leaving the lasso unclosed.
   */
  disabled?: boolean;
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
  disabled = false,
  icon,
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

  // The black teardrop variant (appointments status map) is opt-in via `icon`
  // and never applies to cluster bubbles, which keep the count circle.
  const isIconPin = Boolean(icon) && !clustered;

  // Status-pin button: a solid near-black teardrop built from a circular head
  // (icon flex-centered inside — no hole/"white ball") plus a triangular tail
  // tucked under it. The tail tip lands on the Mapbox `anchor: 'bottom'`
  // coordinate, so no rotate/clip hacks are needed.
  const iconPinButton = (
    <button
      type="button"
      disabled={disabled}
      className={`inline-flex flex-col items-center transition-transform hover:scale-110 ${
        active ? 'scale-110 drop-shadow-[0_0_4px_rgba(0,157,217,0.95)]' : 'drop-shadow-md'
      } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      onClick={(e) => {
        if (disabled) return;
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={label ?? `Appointment marker at ${latitude}, ${longitude}`}
    >
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full"
        style={{ backgroundColor: '#1A1A1A' }}
      >
        <i className={`mdi ${icon} text-base leading-none text-white`} aria-hidden="true" />
      </span>
      <span
        className="-mt-1 h-0 w-0 border-x-[6px] border-t-[10px] border-x-transparent"
        style={{ borderTopColor: '#1A1A1A' }}
        aria-hidden="true"
      />
    </button>
  );

  // Default circle button — unchanged behaviour for the property, service-group
  // and marketplace maps, plus the cluster count bubble.
  const circleButton = (
    <button
      type="button"
      disabled={disabled}
      className={`flex items-center justify-center rounded-full shadow-md transition-transform hover:scale-110 ${size} ${ringClass} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      style={{ backgroundColor: color }}
      onClick={(e) => {
        if (disabled) return;
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
  );

  // Inner UI rendered both inline (no map / tests) and via portal (with map).
  // Identical markup either way so `data-testid`/role assertions hold.
  // `pointer-events: none` on the wrapper while disabled propagates to the
  // button + label, so the canvas underneath receives the click (used by the
  // lasso-draw close-polygon gesture). `cursor: pointer` on the label fixes
  // the "cursor turns into text-cursor over the label" flicker.
  const inner = (
    <div
      className={`inline-flex flex-col items-center ${disabled ? 'pointer-events-none' : 'cursor-pointer'}`}
      style={disabled ? { pointerEvents: 'none' } : undefined}
    >
      {isIconPin ? iconPinButton : circleButton}
      {label && !clustered && (
        <div className="mt-1 whitespace-nowrap text-center text-xs font-medium text-text-primary select-none">
          {label}
        </div>
      )}
    </div>
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
          data-icon={icon}
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
      data-icon={icon}
      data-disabled={disabled ? 'true' : undefined}
    >
      {inner}
    </div>
  );
}
