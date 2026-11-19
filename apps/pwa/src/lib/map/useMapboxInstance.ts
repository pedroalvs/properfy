import { type RefObject, type MutableRefObject, useEffect, useRef, useState } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { env } from '@/config/env';

interface InitialView {
  center: [number, number];
  zoom: number;
}

interface UseMapboxInstanceArgs {
  containerRef: RefObject<HTMLDivElement>;
  /** Computed lazily at init/retry time so it reflects the latest offers. */
  getInitialView: () => InitialView;
  /** Called on a real pan/zoom gesture (not our own flyTo/fitBounds). */
  onUserGesture: () => void;
  /** Called when the map is torn down (retry or unmount) to reset dependent state. */
  onTeardown: () => void;
}

export interface MapboxInstance {
  mapRef: MutableRefObject<MapboxMap | null>;
  mapLoadedRef: MutableRefObject<boolean>;
  mapReady: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Owns the mapbox-gl map lifecycle: the dynamic import, the token guard, map
 * creation + NavigationControl, the load/error handlers, and teardown. Pin
 * placement (useOfferPins) and camera framing (useMapCamera) layer on top via
 * the returned `mapRef` / `mapReady`.
 */
export function useMapboxInstance({
  containerRef,
  getInitialView,
  onUserGesture,
  onTeardown,
}: UseMapboxInstanceArgs): MapboxInstance {
  const mapRef = useRef<MapboxMap | null>(null);
  const mapLoadedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  /** Drives the render effect once mapbox is ready — see the 'load' handler. */
  const [mapReady, setMapReady] = useState(false);

  // The init effect runs only on mount/retry; read the latest collaborators
  // through refs so it never needs them in its dependency list.
  const getInitialViewRef = useRef(getInitialView);
  getInitialViewRef.current = getInitialView;
  const onUserGestureRef = useRef(onUserGesture);
  onUserGestureRef.current = onUserGesture;
  const onTeardownRef = useRef(onTeardown);
  onTeardownRef.current = onTeardown;

  // Initialize the map once (or on retry).
  useEffect(() => {
    if (!containerRef.current) return;

    if (!env.mapboxToken) {
      // User-facing copy only — never leak the env-var name into the UI.
      setError('Map is temporarily unavailable.');
      return;
    }

    let cancelled = false;
    setError(null);

    import('mapbox-gl')
      .then(({ default: mapboxgl }) => {
        if (cancelled || !containerRef.current) return;

        mapboxgl.accessToken = env.mapboxToken;
        const { center, zoom } = getInitialViewRef.current();

        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center,
          zoom,
        });

        map.addControl(new mapboxgl.NavigationControl(), 'top-right');

        // `originalEvent` is present only for real gestures — our own flyTo and
        // fitBounds raise these same events without one, and treating those as
        // user intent would disable the auto-fit on the very first frame.
        // Typed as `unknown` and narrowed here because mapbox-gl's `zoomstart`
        // listener type omits `originalEvent` even though a pinch/wheel zoom
        // carries one at runtime.
        const markUserMoved = (event: unknown) => {
          if ((event as { originalEvent?: unknown } | undefined)?.originalEvent) {
            onUserGestureRef.current();
          }
        };
        map.on('dragstart', markUserMoved);
        map.on('zoomstart', markUserMoved);

        mapRef.current = map;

        // Flip state rather than rendering straight from here: this callback
        // closes over the offers of the render that created the map, and offers
        // routinely resolve while mapbox is still loading behind its dynamic
        // import. Letting the render effect do the work — by depending on
        // `mapReady` — is what guarantees it draws the *current* offers.
        map.on('load', () => {
          if (cancelled) return;
          mapLoadedRef.current = true;
          setMapReady(true);
        });

        map.on('error', () => {
          if (!cancelled) setError('Map failed to load. Check your connection.');
        });
      })
      .catch(() => {
        if (!cancelled) setError('Map library failed to load.');
      });

    return () => {
      cancelled = true;
      mapLoadedRef.current = false;
      setMapReady(false);
      mapRef.current?.remove();
      mapRef.current = null;
      onTeardownRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  return {
    mapRef,
    mapLoadedRef,
    mapReady,
    error,
    retry: () => setRetryKey((k) => k + 1),
  };
}
