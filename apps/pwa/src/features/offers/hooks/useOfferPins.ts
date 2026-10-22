import { type MutableRefObject, useEffect, useRef } from 'react';
import type MapboxGL from 'mapbox-gl';
import type { Map as MapboxMap } from 'mapbox-gl';
import type { MarketplaceOffer } from '../types';
import type { ExpandedGroup } from '../lib/offers-map/types';
import {
  applyCollisionOffsets,
  isValidCoordinate,
  makeAppointmentMarkerEl,
  makeMarkerEl,
  type PlacedMarker,
} from '../lib/offers-map/markers';

/** The mapbox-gl namespace (its default export), dynamically imported at runtime. */
type MapboxModule = typeof MapboxGL;

interface UseOfferPinsArgs {
  mapRef: MutableRefObject<MapboxMap | null>;
  mapLoadedRef: MutableRefObject<boolean>;
  mapReady: boolean;
  offers: MarketplaceOffer[];
  onSelectOffer: (groupId: string) => void;
  expandedGroup: ExpandedGroup | null;
  /** Toggle the info chip for an appointment pin (pass its marker id). */
  onToggleAppointment: (id: string) => void;
  /** Frame the pins after they are placed. */
  syncCamera: (map: MapboxMap) => void;
}

/**
 * Places the map's markers (group pins, or appointment pins in drill-down),
 * wires their click handlers, keeps them in `markersRef`, and re-renders them
 * when the offers change or the drill-down toggles — then nudges coincident
 * pins apart and asks the camera to re-frame.
 */
export function useOfferPins({
  mapRef,
  mapLoadedRef,
  mapReady,
  offers,
  onSelectOffer,
  expandedGroup,
  onToggleAppointment,
  syncCamera,
}: UseOfferPinsArgs): void {
  const markersRef = useRef<PlacedMarker[]>([]);

  function removeAllMarkers() {
    markersRef.current.forEach((m) => m.marker.remove());
    markersRef.current = [];
  }

  function placeOfferMarkers(
    map: MapboxMap,
    mapboxgl: MapboxModule,
    currentOffers: MarketplaceOffer[],
    onSelect: (id: string) => void,
  ) {
    for (const offer of currentOffers) {
      // Same validity rule as the appointment pins below: a NaN or out-of-range
      // centroid handed to setLngLat is a silently misplaced pin, which is
      // harder to notice than a missing one.
      if (!isValidCoordinate(offer.centroid)) continue;
      const el = makeMarkerEl(offer.appointmentCount);
      el.setAttribute('data-group-id', offer.groupId);
      el.addEventListener('click', () => onSelect(offer.groupId));

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([offer.centroid.lng, offer.centroid.lat])
        .addTo(map);
      markersRef.current.push({
        id: offer.groupId,
        marker,
        lng: offer.centroid.lng,
        lat: offer.centroid.lat,
      });
    }
  }

  function placeAppointmentMarkers(map: MapboxMap, mapboxgl: MapboxModule, group: ExpandedGroup) {
    group.appointments.forEach((appointment, index) => {
      if (!isValidCoordinate(appointment.coordinates)) return;
      const el = makeAppointmentMarkerEl(index);
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        onToggleAppointment(appointment.id);
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([appointment.coordinates.lng, appointment.coordinates.lat])
        .addTo(map);
      markersRef.current.push({
        id: appointment.id,
        marker,
        lng: appointment.coordinates.lng,
        lat: appointment.coordinates.lat,
      });
    });
  }

  function renderMode(map: MapboxMap, mapboxgl: MapboxModule) {
    removeAllMarkers();

    if (expandedGroup) {
      placeAppointmentMarkers(map, mapboxgl, expandedGroup);
    } else {
      placeOfferMarkers(map, mapboxgl, offers, onSelectOffer);
    }
    applyCollisionOffsets(markersRef.current);
    syncCamera(map);
  }

  // Re-render pins when offers change or the drill-down mode toggles. The
  // dependency on expandedGroup keeps the periodic offers refetch from
  // clobbering the expanded pin set.
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current) {
      // Map gone (teardown/retry): drop any stale markers so they do not linger
      // in the DOM over the recreated map.
      removeAllMarkers();
      return;
    }
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (!mapRef.current || !mapLoadedRef.current) return;
      renderMode(mapRef.current, mapboxgl);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, offers, onSelectOffer, expandedGroup, onToggleAppointment, syncCamera]);

  // Clean up markers' DOM on unmount.
  useEffect(() => {
    return () => removeAllMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
