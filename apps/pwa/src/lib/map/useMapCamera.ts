import { useCallback, useRef } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { computeBounds, isPlottablePoint, isSinglePointBounds } from './bounds';

export const AU_CENTRE: [number, number] = [133.7751, -25.2744];

/** One address on screen: street level, so the inspector can see the approach. */
export const SINGLE_APPOINTMENT_ZOOM = 15;
/**
 * Upper bound for fitBounds, and what keeps two nearby pins apart. At Sydney's
 * latitude zoom 15 is ~4 m/px, so a close pair lands ~125px apart rather than
 * overlapping. fitBounds only reaches this cap when the pins really are close,
 * so points spread across a city are framed to fit.
 */
export const MAX_FIT_ZOOM = 15;

/** A point the camera can frame; `id` tracks it across refetches/reorders. */
export interface MapCameraPoint {
  id: string;
  lat: number | null;
  lng: number | null;
}

/** Mean of the plottable points, or the centre of Australia when there are none. */
export function computeCenter(points: Array<{ lat: number | null; lng: number | null }>): [number, number] {
  const plottable = points.filter((p) => isPlottablePoint({ latitude: p.lat, longitude: p.lng }));
  if (plottable.length === 0) return AU_CENTRE;
  const lat = plottable.reduce((s, p) => s + (p.lat as number), 0) / plottable.length;
  const lng = plottable.reduce((s, p) => s + (p.lng as number), 0) / plottable.length;
  return [lng, lat];
}

interface UseMapCameraArgs {
  points: MapCameraPoint[];
  /** Zoom used when a single point is framed (flyTo). Defaults to street level. */
  singlePointZoom?: number;
  /** Upper bound for fitBounds. Defaults to {@link MAX_FIT_ZOOM}. */
  maxFitZoom?: number;
  /**
   * Changing this forces a re-frame and hands control back to the auto-fit — an
   * explicit navigation (e.g. the offers drill-down toggling). `null` means a
   * single stable context (e.g. the day-plan route).
   */
  framingKey?: string | null;
}

export interface MapCamera {
  /** Frame whatever points are currently on the map. Call after placing markers. */
  syncCamera: (map: MapboxMap) => void;
  /** Record a real pan/zoom gesture so the auto-fit stops fighting the inspector. */
  markUserMoved: () => void;
  /** Clear all framing state so a freshly (re)created map re-frames from scratch. */
  resetFraming: () => void;
  /** Force the next `syncCamera` to re-frame, overriding the gesture guard ("Fit route"). */
  refit: () => void;
}

/**
 * Owns camera framing for any map: frames the given points, refits when they
 * change, and stops once the inspector pans/zooms by hand (until a `framingKey`
 * change, a lost framing target, or `refit()` hands control back). Point
 * derivation lives in the caller, so the same hook serves the offers map and
 * the day-plan route.
 */
export function useMapCamera({
  points,
  singlePointZoom = SINGLE_APPOINTMENT_ZOOM,
  maxFitZoom = MAX_FIT_ZOOM,
  framingKey = null,
}: UseMapCameraArgs): MapCamera {
  const prevFramingKeyRef = useRef<string | null>(null);
  /** Signature of the points the camera was last framed to — see syncCamera. */
  const fittedSignatureRef = useRef<string | null>(null);
  /** Ids of the pins the camera last framed — see syncCamera. */
  const fittedIdsRef = useRef<Set<string> | null>(null);
  /** Set once the inspector pans/zooms by hand; stops the auto-fit fighting them. */
  const userMovedRef = useRef(false);

  const markUserMoved = useCallback(() => {
    userMovedRef.current = true;
  }, []);

  const resetFraming = useCallback(() => {
    prevFramingKeyRef.current = null;
    fittedSignatureRef.current = null;
    fittedIdsRef.current = null;
    userMovedRef.current = false;
  }, []);

  const refit = useCallback(() => {
    // Hand control back to the auto-fit without discarding which points were framed.
    userMovedRef.current = false;
    fittedSignatureRef.current = null;
  }, []);

  const syncCamera = useCallback(
    (map: MapboxMap) => {
      const currentKey = framingKey;
      const keyChanged = prevFramingKeyRef.current !== currentKey;
      prevFramingKeyRef.current = currentKey;

      // A framing-key change is an explicit navigation, so it always re-frames
      // and hands control back to the auto-fit.
      if (keyChanged) userMovedRef.current = false;

      // Two questions, two keys, both taken from exactly the points computeBounds
      // will frame. Coordinates answer "would the camera frame anything
      // differently?" — order-independent, so it changes when and only when the
      // framing would. Ids answer "are the pins the camera framed still here?".
      const plottable = points.filter((p) => isPlottablePoint({ latitude: p.lat, longitude: p.lng }));
      const signature = plottable
        .map((p) => `${p.lat},${p.lng}`)
        .sort()
        .join('|');
      const ids = plottable.map((p) => p.id);

      // A pan means "I want to look here", normally respected for good. But if
      // none of the pins the camera framed is still on the map, that intent has
      // nothing to refer to — keeping the old view would show empty space. A null
      // `framed` means the camera never fitted anything, so a pan then cannot
      // count as choosing a view.
      const framed = fittedIdsRef.current;
      if (ids.length > 0 && (!framed || !ids.some((id) => framed.has(id)))) {
        userMovedRef.current = false;
      }

      if (!keyChanged && (userMovedRef.current || fittedSignatureRef.current === signature)) return;

      const bounds = computeBounds(points.map((p) => ({ latitude: p.lat, longitude: p.lng })));
      if (!bounds) return;
      fittedSignatureRef.current = signature;
      fittedIdsRef.current = new Set(ids);

      if (isSinglePointBounds(bounds)) {
        const [[lng, lat]] = bounds as [[number, number], [number, number]];
        map.flyTo({ center: [lng, lat], zoom: singlePointZoom, duration: 700 });
      } else {
        map.fitBounds(bounds, { padding: 48, maxZoom: maxFitZoom, duration: 700 });
      }
    },
    [points, framingKey, singlePointZoom, maxFitZoom],
  );

  return { syncCamera, markUserMoved, resetFraming, refit };
}
