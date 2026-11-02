import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeCenter, isValidCoordinate, useMapCamera, useMapboxInstance, type MapCameraPoint } from '@/lib/map';
import type { MarketplaceOffer } from '../types';
import type { ExpandedGroup } from '../lib/offers-map/types';
import { useOfferPins } from '../hooks/useOfferPins';
import { useOfferRoute } from '../hooks/useOfferRoute';
import { MapOverlays } from './MapOverlays';

export type { ExpandedGroup, ExpandedGroupAppointment } from '../lib/offers-map/types';

/** One group on screen: zoom out enough to show the surrounding suburbs. */
const SINGLE_OFFER_ZOOM = 12;
/** One address on screen: street level, so the inspector can see the approach. */
const SINGLE_APPOINTMENT_ZOOM = 15;

interface OffersMapViewProps {
  offers: MarketplaceOffer[];
  onSelectOffer: (groupId: string) => void;
  /** When set, the map shows only this group's appointment pins (drill-down mode). */
  expandedGroup?: ExpandedGroup | null;
}

export function OffersMapView({ offers, onSelectOffer, expandedGroup = null }: OffersMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  // Memoized so the camera hook's syncCamera keeps a stable identity across the
  // periodic offers refetch (CLAUDE.md §11) — otherwise the pins effect would
  // re-place every marker on every render.
  const cameraPoints = useMemo<MapCameraPoint[]>(
    () =>
      expandedGroup
        ? expandedGroup.appointments.map((a) => ({
            id: a.id,
            lat: a.coordinates?.lat ?? null,
            lng: a.coordinates?.lng ?? null,
          }))
        : offers.map((o) => ({ id: o.groupId, lat: o.centroid?.lat ?? null, lng: o.centroid?.lng ?? null })),
    [offers, expandedGroup],
  );

  const camera = useMapCamera({
    points: cameraPoints,
    singlePointZoom: expandedGroup ? SINGLE_APPOINTMENT_ZOOM : SINGLE_OFFER_ZOOM,
    framingKey: expandedGroup?.groupId ?? null,
  });

  const { mapRef, mapLoadedRef, mapReady, error, retry } = useMapboxInstance({
    containerRef,
    getInitialView: () => ({
      center: computeCenter(cameraPoints),
      zoom: offers.some((o) => isValidCoordinate(o.centroid)) ? 11 : 4,
    }),
    onUserGesture: camera.markUserMoved,
    onTeardown: camera.resetFraming,
  });

  const toggleAppointment = useCallback((id: string) => {
    setSelectedAppointmentId((prev) => (prev === id ? null : id));
  }, []);

  useOfferPins({
    mapRef,
    mapLoadedRef,
    mapReady,
    offers,
    onSelectOffer,
    expandedGroup,
    onToggleAppointment: toggleAppointment,
    syncCamera: camera.syncCamera,
  });

  // Route polyline through the expanded group's pins (drill-down only).
  useOfferRoute({ mapRef, mapLoadedRef, mapReady, expandedGroup });

  // Close the info chip whenever the drill-down target changes or is cleared.
  useEffect(() => {
    setSelectedAppointmentId(null);
  }, [expandedGroup?.groupId]);

  // Mirrors what useOfferPins actually plots, so an offer with a malformed
  // centroid can't suppress the overlay while contributing no pin.
  const hasAnyOfferPin = offers.some((o) => isValidCoordinate(o.centroid));
  const expandedHasPin = expandedGroup
    ? expandedGroup.appointments.some((a) => isValidCoordinate(a.coordinates))
    : false;
  const showNoPinsOverlay = expandedGroup ? !expandedHasPin : !hasAnyOfferPin;
  const selectedAppointment =
    expandedGroup && selectedAppointmentId
      ? expandedGroup.appointments.find((a) => a.id === selectedAppointmentId) ?? null
      : null;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        data-testid="map-container"
        className="h-[60vh] w-full overflow-hidden rounded-2xl md:h-[72vh]"
      />
      <MapOverlays
        error={error}
        onRetry={retry}
        showNoPinsOverlay={showNoPinsOverlay}
        expandedGroup={expandedGroup}
        selectedAppointment={selectedAppointment}
        onCloseChip={() => setSelectedAppointmentId(null)}
      />
    </div>
  );
}
