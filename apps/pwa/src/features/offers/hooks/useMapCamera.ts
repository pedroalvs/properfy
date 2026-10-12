import { useCallback, useRef } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { computeBounds, isPlottablePoint, isSinglePointBounds } from '@/lib/map-bounds';
import type { MarketplaceOffer } from '../types';
import { isValidCoordinate } from '../lib/offers-map/markers';
import type { ExpandedGroup } from '../lib/offers-map/types';

const AU_CENTRE: [number, number] = [133.7751, -25.2744];

/** One group on screen: zoom out enough to show the surrounding suburbs. */
const SINGLE_OFFER_ZOOM = 12;
/** One address on screen: street level, so the inspector can see the approach. */
const SINGLE_APPOINTMENT_ZOOM = 15;
/**
 * Upper bound for fitBounds, and what keeps two nearby group pins apart.
 * At Sydney's latitude zoom 12 is ~32 m/px, so two centroids 500 m apart land
 * ~16px from each other — closer than the 36px markers are wide, and one pin
 * hides the other. Zoom 15 (~4 m/px) puts that same pair ~125px apart.
 * fitBounds only reaches this cap when the pins really are close together, so
 * offers spread across a city are framed exactly as before.
 */
const MAX_FIT_ZOOM = 15;

export function computeCenter(offers: MarketplaceOffer[]): [number, number] {
  const withCentroid = offers.filter((o) => isValidCoordinate(o.centroid));
  if (withCentroid.length === 0) return AU_CENTRE;
  const lat = withCentroid.reduce((s, o) => s + o.centroid!.lat, 0) / withCentroid.length;
  const lng = withCentroid.reduce((s, o) => s + o.centroid!.lng, 0) / withCentroid.length;
  return [lng, lat];
}

interface UseMapCameraArgs {
  offers: MarketplaceOffer[];
  expandedGroup: ExpandedGroup | null;
}

export interface MapCamera {
  /** Frame whatever pins are currently on the map. Call after placing markers. */
  syncCamera: (map: MapboxMap) => void;
  /** Record a real pan/zoom gesture so the auto-fit stops fighting the inspector. */
  markUserMoved: () => void;
  /** Clear all framing state so a freshly (re)created map re-frames from scratch. */
  resetFraming: () => void;
}

export function useMapCamera({ offers, expandedGroup }: UseMapCameraArgs): MapCamera {
  const prevExpandedIdRef = useRef<string | null>(null);
  /** Points the camera was last framed to — see syncCamera. */
  const fittedSignatureRef = useRef<string | null>(null);
  /** Ids of the pins the camera last framed — see syncCamera. */
  const fittedIdsRef = useRef<Set<string> | null>(null);
  /** Set once the inspector pans/zooms by hand; stops the auto-fit fighting them. */
  const userMovedRef = useRef(false);

  const markUserMoved = useCallback(() => {
    userMovedRef.current = true;
  }, []);

  const resetFraming = useCallback(() => {
    prevExpandedIdRef.current = null;
    fittedSignatureRef.current = null;
    fittedIdsRef.current = null;
    userMovedRef.current = false;
  }, []);

  /**
   * Frame whatever pins are currently on the map.
   *
   * Two requirements pull in opposite directions here. The camera must follow
   * pins that appear after mount — map mode has no scroll to drive pagination,
   * so MarketplacePage drains the remaining offer pages and the pins arrive in
   * waves; a fit-once camera leaves every later page off-screen. But it must
   * also never yank itself out from under an inspector who has started panning,
   * which is what the old "only on mode change" guard was protecting against.
   *
   * So: refit whenever the plotted points actually change, and stop for good
   * once a real gesture is seen. Comparing the points rather than the array
   * identity is what keeps the periodic refetch from re-framing the map when
   * nothing moved.
   *
   * (The previous guard compared `prevExpandedIdRef` against the current id;
   * both are null outside the drill-down, so it early-returned every time and
   * the offers view was never framed at all.)
   */
  const syncCamera = useCallback(
    (map: MapboxMap) => {
      const currentId = expandedGroup?.groupId ?? null;
      const modeChanged = prevExpandedIdRef.current !== currentId;
      prevExpandedIdRef.current = currentId;

      // Entering or leaving the drill-down is an explicit navigation, so it always
      // re-frames — and hands control back to the auto-fit.
      if (modeChanged) userMovedRef.current = false;

      const points = expandedGroup
        ? expandedGroup.appointments.map((a) => ({
            id: a.id,
            latitude: a.coordinates?.lat ?? null,
            longitude: a.coordinates?.lng ?? null,
          }))
        : offers.map((o) => ({
            id: o.groupId,
            latitude: o.centroid?.lat ?? null,
            longitude: o.centroid?.lng ?? null,
          }));
      const singlePointZoom = expandedGroup ? SINGLE_APPOINTMENT_ZOOM : SINGLE_OFFER_ZOOM;

      // Two questions, two keys, both taken from exactly the points computeBounds
      // will frame. Coordinates answer "would the camera frame anything
      // differently?" — order-independent, so it changes when and only when the
      // framing would. Ids answer "are the pins the inspector framed still here?",
      // and that one has to be about the entities rather than their positions: a
      // group's centroid is the mean of its appointments, so adding one shifts it,
      // and judging by coordinates made that micro-shift look like the whole offer
      // set had turned over — yanking the camera back on a single-offer map.
      const plottable = points.filter(isPlottablePoint);
      const signature = plottable
        .map((p) => `${p.latitude},${p.longitude}`)
        .sort()
        .join('|');
      const ids = plottable.map((p) => p.id);

      // A pan means "I want to look here", and is normally respected for good.
      // But if not one of the pins the camera was framing is still on the map,
      // that intent has nothing left to refer to — keeping the old view would
      // just show empty space with every new pin off screen.
      // A null `framed` means the camera has never successfully fitted anything —
      // panning a map that had no pins on it cannot count as choosing a view, and
      // treating it as one left the very first batch of pins off screen for good.
      const framed = fittedIdsRef.current;
      if (ids.length > 0 && (!framed || !ids.some((id) => framed.has(id)))) {
        userMovedRef.current = false;
      }

      if (!modeChanged && (userMovedRef.current || fittedSignatureRef.current === signature)) return;

      const bounds = computeBounds(points);
      if (!bounds) return;
      fittedSignatureRef.current = signature;
      fittedIdsRef.current = new Set(ids);

      if (isSinglePointBounds(bounds)) {
        const [[lng, lat]] = bounds as [[number, number], [number, number]];
        map.flyTo({ center: [lng, lat], zoom: singlePointZoom, duration: 700 });
      } else {
        map.fitBounds(bounds, { padding: 48, maxZoom: MAX_FIT_ZOOM, duration: 700 });
      }
    },
    [offers, expandedGroup],
  );

  return { syncCamera, markUserMoved, resetFraming };
}
