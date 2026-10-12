import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarketplaceOffer } from '../types';
import { isValidCoordinate } from '../lib/offers-map/markers';
import type { ExpandedGroup } from '../lib/offers-map/types';
import { computeCenter, useMapCamera } from '../hooks/useMapCamera';
import { useMapboxInstance } from '../hooks/useMapboxInstance';
import { useOfferPins } from '../hooks/useOfferPins';
import { MapOverlays } from './MapOverlays';

export type { ExpandedGroup, ExpandedGroupAppointment } from '../lib/offers-map/types';

interface OffersMapViewProps {
  offers: MarketplaceOffer[];
  onSelectOffer: (groupId: string) => void;
  /** When set, the map shows only this group's appointment pins (drill-down mode). */
  expandedGroup?: ExpandedGroup | null;
}

export function OffersMapView({ offers, onSelectOffer, expandedGroup = null }: OffersMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  const camera = useMapCamera({ offers, expandedGroup });

  const { mapRef, mapLoadedRef, mapReady, error, retry } = useMapboxInstance({
    containerRef,
    getInitialView: () => ({
      center: computeCenter(offers),
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
        className="h-[60vh] w-full overflow-hidden rounded-2xl"
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
